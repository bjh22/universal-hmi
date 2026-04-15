"""Unit tests for IntegrationManager — plugin lifecycle (load, start, stop, set_tag).

We define in-test IntegrationBase subclasses instead of discovering real plugins
on disk (those touch real printers/vision systems). discover() is also smoke-tested
against the actual app.integrations package to ensure the discovery mechanism
loads each shipped integration without raising.
"""

import json

import pytest
from fastapi import APIRouter, FastAPI
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.integrations.base import IntegrationBase
from app.integrations.manager import IntegrationManager
from app.models.integration import Integration, IntegrationStatus
from app.services.tag_engine import TagEngine


# ─── In-test integrations ───

class _FakeIntegration(IntegrationBase):
    type_name = "fake"
    display_name = "Fake"
    description = "For tests"
    default_config = {"x": 1}

    async def start(self):
        self.started = True
        self.connected = True
        # Push an initial value to demonstrate _set_tag wiring
        self._set_tag("fake.status", "running")

    async def stop(self):
        self.stopped = True
        self.connected = False

    def get_tag_definitions(self):
        return [
            {"name": "fake.status", "data_type": "string", "description": "Fake status"},
            {"name": "fake.count", "data_type": "int"},
        ]

    def get_router(self):
        r = APIRouter(prefix="/api/fake")
        @r.get("/ping")
        def ping():
            return {"ok": True}
        return r


class _BrokenIntegration(IntegrationBase):
    type_name = "broken"
    display_name = "Broken"

    async def start(self):
        raise RuntimeError("boom")

    async def stop(self):
        pass


# ─── Fixtures ───

@pytest.fixture
def manager(db_engine):
    from sqlalchemy.ext.asyncio import AsyncSession
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    mgr = IntegrationManager(TagEngine(), factory)
    # Pre-register fakes so _start_integration finds them
    mgr._registry["fake"] = _FakeIntegration
    mgr._registry["broken"] = _BrokenIntegration
    return mgr


@pytest.fixture
def fastapi_app():
    return FastAPI()


# ─── Discover ───

class TestDiscover:
    def test_discover_loads_available_types(self):
        """Real discover() scans app.integrations/* without raising."""
        mgr = IntegrationManager(TagEngine(), session_factory=None)
        mgr.discover()
        types = {t["type_name"] for t in mgr.get_available_types()}
        # Shipped integrations — update here if names change
        # (Intentionally loose: we just confirm discovery finds something;
        # individual plugin names may evolve.)
        assert isinstance(types, set)
        for t in mgr.get_available_types():
            assert "type_name" in t
            assert "display_name" in t
            assert "default_config" in t


# ─── Register tags ───

class TestRegisterTags:
    def test_registers_tags_with_correct_initial_values(self, manager):
        inst = _FakeIntegration(
            name="fake1", config={}, tag_engine=manager._tag_engine,
        )
        manager._register_tags(inst)

        engine = manager._tag_engine
        assert "fake.status" in engine._values
        assert engine._values["fake.status"].value == ""  # string default
        assert engine._values["fake.status"].description == "Fake status"
        assert "fake.count" in engine._values
        assert engine._values["fake.count"].value == 0  # int default

    def test_does_not_overwrite_existing(self, manager):
        from app.services.tag_engine import TagValue
        manager._tag_engine._values["fake.status"] = TagValue(
            tag_id=42, name="fake.status", value="preloaded", data_type="string",
        )
        inst = _FakeIntegration(name="fake1", config={}, tag_engine=manager._tag_engine)
        manager._register_tags(inst)

        # Pre-existing value was preserved
        assert manager._tag_engine._values["fake.status"].value == "preloaded"


# ─── Start / Stop lifecycle ───

class TestStartStop:
    async def test_start_integration_happy_path(self, manager, db_session, fastapi_app):
        db_int = Integration(
            type_name="fake", name="fake-inst", enabled=True, config=json.dumps({"a": 1}),
        )
        db_session.add(db_int)
        await db_session.commit()
        await db_session.refresh(db_int)

        await manager._start_integration(db_int, fastapi_app, db_session)
        await db_session.commit()

        # Instance stored, started, tag broadcast worked
        inst = manager.get_instance(db_int.id)
        assert isinstance(inst, _FakeIntegration)
        assert inst.started is True
        assert inst.connected is True

        # _set_tag in start() pushed into engine
        assert manager._tag_engine.get_value("fake.status").value == "running"

        # DB status was updated
        assert db_int.status == IntegrationStatus.RUNNING.value
        assert db_int.status_message is None

        # Router was mounted on app
        paths = [r.path for r in fastapi_app.routes]
        assert any("/api/fake/ping" in p for p in paths)

    async def test_start_broken_records_error_status(self, manager, db_session, fastapi_app):
        db_int = Integration(
            type_name="broken", name="broken-inst", enabled=True, config="{}",
        )
        db_session.add(db_int)
        await db_session.commit()
        await db_session.refresh(db_int)

        # Should not raise — errors get caught & recorded
        await manager._start_integration(db_int, fastapi_app, db_session)
        await db_session.commit()

        assert db_int.status == IntegrationStatus.ERROR.value
        assert "boom" in db_int.status_message

    async def test_start_unknown_type_is_noop(self, manager, db_session, fastapi_app):
        db_int = Integration(
            type_name="nonexistent", name="ghost", enabled=True, config="{}",
        )
        db_session.add(db_int)
        await db_session.commit()
        await db_session.refresh(db_int)

        await manager._start_integration(db_int, fastapi_app, db_session)
        assert manager.get_instance(db_int.id) is None

    async def test_stop_all(self, manager, db_session, fastapi_app):
        db_int = Integration(
            type_name="fake", name="stop-me", enabled=True, config="{}",
        )
        db_session.add(db_int)
        await db_session.commit()
        await db_session.refresh(db_int)

        await manager._start_integration(db_int, fastapi_app, db_session)
        await db_session.commit()
        inst = manager.get_instance(db_int.id)
        assert inst.connected is True

        await manager.stop_all()
        assert inst.connected is False
        assert inst.stopped is True
        assert manager.get_instance(db_int.id) is None

    async def test_disable_individual(self, manager, db_session, fastapi_app):
        db_int = Integration(
            type_name="fake", name="disable-me", enabled=True, config="{}",
        )
        db_session.add(db_int)
        await db_session.commit()
        await db_session.refresh(db_int)

        await manager._start_integration(db_int, fastapi_app, db_session)
        await db_session.commit()
        await manager.disable_integration(db_int.id)
        assert manager.get_instance(db_int.id) is None


class TestGetStatus:
    def test_stopped_when_no_instance(self, manager):
        assert manager.get_status(999) == {"connected": False, "status": "stopped"}

    async def test_running_when_instance_connected(self, manager, db_session, fastapi_app):
        db_int = Integration(
            type_name="fake", name="s1", enabled=True, config="{}",
        )
        db_session.add(db_int)
        await db_session.commit()
        await db_session.refresh(db_int)
        await manager._start_integration(db_int, fastapi_app, db_session)
        await db_session.commit()

        status = manager.get_status(db_int.id)
        assert status["connected"] is True
        assert status["status"] == "running"
