"""Integration tests for /api/alarms/* endpoints.

Covers the user-facing alarm API: active alarms listing, history query with
filters/pagination, and acknowledge flow. The deep state-machine logic is
tested at the service layer (test_alarm_state_machine.py); here we verify
that the routes assemble responses correctly and delegate to AlarmService.
"""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.models.alarm import Alarm, AlarmHistory, AlarmSeverity, AlarmState
from app.models.tag import Tag


class TestActiveAlarms:
    async def test_empty_initially(self, test_client, seeded_db):
        resp = await test_client.get("/api/alarms/active")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_returns_active_only(self, test_client, seeded_db):
        # Insert one active and one fully-resolved alarm
        result = await seeded_db.execute(select(Tag).where(Tag.name == "Pump1.Running"))
        tag = result.scalar_one()
        now = datetime.now(timezone.utc)

        seeded_db.add_all([
            Alarm(
                tag_id=tag.id, message="active", severity=AlarmSeverity.WARNING,
                state=AlarmState.ACTIVE_UNACKED, triggered_at=now,
            ),
            Alarm(
                tag_id=tag.id, message="resolved", severity=AlarmSeverity.INFO,
                state=AlarmState.INACTIVE, triggered_at=now - timedelta(minutes=5),
            ),
        ])
        await seeded_db.commit()

        resp = await test_client.get("/api/alarms/active")
        assert resp.status_code == 200
        data = resp.json()
        messages = [a["message"] for a in data]
        assert "active" in messages
        assert "resolved" not in messages
        # Joined tag name populated
        for a in data:
            if a["message"] == "active":
                assert a["tag_name"] == "Pump1.Running"

    async def test_includes_inactive_unacked(self, test_client, seeded_db):
        """Cleared-but-unacknowledged alarms (INACTIVE_UNACKED) still appear as active."""
        result = await seeded_db.execute(select(Tag).where(Tag.name == "Tank.Level"))
        tag = result.scalar_one()
        seeded_db.add(Alarm(
            tag_id=tag.id, message="cleared-unacked", severity=AlarmSeverity.CRITICAL,
            state=AlarmState.INACTIVE_UNACKED,
            triggered_at=datetime.now(timezone.utc),
        ))
        await seeded_db.commit()

        resp = await test_client.get("/api/alarms/active")
        messages = [a["message"] for a in resp.json()]
        assert "cleared-unacked" in messages


class TestAlarmHistory:
    async def test_history_empty(self, test_client, seeded_db):
        resp = await test_client.get("/api/alarms/history")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_history_returns_records(self, test_client, seeded_db):
        result = await seeded_db.execute(select(Tag).where(Tag.name == "Pump1.Running"))
        tag = result.scalar_one()
        now = datetime.now(timezone.utc)
        seeded_db.add_all([
            AlarmHistory(
                tag_id=tag.id, tag_name="Pump1.Running", message="warn",
                severity=AlarmSeverity.WARNING, triggered_at=now,
            ),
            AlarmHistory(
                tag_id=tag.id, tag_name="Pump1.Running", message="crit",
                severity=AlarmSeverity.CRITICAL, triggered_at=now - timedelta(minutes=1),
            ),
        ])
        await seeded_db.commit()

        resp = await test_client.get("/api/alarms/history")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        # Sorted by triggered_at desc
        assert data[0]["message"] == "warn"

    async def test_history_severity_filter(self, test_client, seeded_db):
        result = await seeded_db.execute(select(Tag).where(Tag.name == "Pump1.Running"))
        tag = result.scalar_one()
        now = datetime.now(timezone.utc)
        seeded_db.add_all([
            AlarmHistory(
                tag_id=tag.id, tag_name="Pump1.Running", message="w",
                severity=AlarmSeverity.WARNING, triggered_at=now,
            ),
            AlarmHistory(
                tag_id=tag.id, tag_name="Pump1.Running", message="c",
                severity=AlarmSeverity.CRITICAL, triggered_at=now,
            ),
        ])
        await seeded_db.commit()

        resp = await test_client.get("/api/alarms/history?severity=critical")
        messages = [a["message"] for a in resp.json()]
        assert messages == ["c"]

    async def test_history_pagination(self, test_client, seeded_db):
        result = await seeded_db.execute(select(Tag).where(Tag.name == "Pump1.Running"))
        tag = result.scalar_one()
        now = datetime.now(timezone.utc)
        for i in range(5):
            seeded_db.add(AlarmHistory(
                tag_id=tag.id, tag_name="Pump1.Running", message=f"m{i}",
                severity=AlarmSeverity.INFO,
                triggered_at=now - timedelta(seconds=i),
            ))
        await seeded_db.commit()

        resp = await test_client.get("/api/alarms/history?limit=2&offset=0")
        assert len(resp.json()) == 2
        resp2 = await test_client.get("/api/alarms/history?limit=2&offset=2")
        assert len(resp2.json()) == 2


@pytest.fixture
async def alarm_service_ready(test_client):
    """Attach an AlarmService to app.state (done by lifespan in prod, bypassed in tests).

    Uses the real AlarmService against an isolated TagEngine; we don't start its
    evaluation loop — we only need `acknowledge()` to work.
    """
    from app.main import app
    from app.services.alarm_service import AlarmService
    from app.services.tag_engine import TagEngine

    tag_engine = TagEngine()
    # session_factory_stub isn't used by acknowledge() — it takes the session directly
    alarm_service = AlarmService(tag_engine, session_factory=None)
    app.state.alarm_service = alarm_service
    yield alarm_service
    del app.state.alarm_service


class TestAcknowledge:
    async def test_ack_missing_returns_404(
        self, test_client, seeded_db, admin_token, alarm_service_ready,
    ):
        resp = await test_client.post(
            "/api/alarms/99999/acknowledge",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 404

    async def test_ack_active_alarm(
        self, test_client, seeded_db, admin_token, alarm_service_ready,
    ):
        result = await seeded_db.execute(select(Tag).where(Tag.name == "Pump1.Running"))
        tag = result.scalar_one()
        alarm = Alarm(
            tag_id=tag.id, message="ack me", severity=AlarmSeverity.WARNING,
            state=AlarmState.ACTIVE_UNACKED,
            triggered_at=datetime.now(timezone.utc),
        )
        seeded_db.add(alarm)
        await seeded_db.commit()
        await seeded_db.refresh(alarm)
        alarm_id = alarm.id

        resp = await test_client.post(
            f"/api/alarms/{alarm_id}/acknowledge",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        assert resp.json() == {"success": True}

        # State transitioned to ACTIVE_ACKED (re-fetch via seeded_db)
        await seeded_db.refresh(alarm)
        assert alarm.state == AlarmState.ACTIVE_ACKED
        assert alarm.acknowledged_by == "admin"
        assert alarm.acknowledged_at is not None

    async def test_ack_without_token_uses_anonymous(
        self, test_client, seeded_db, alarm_service_ready,
    ):
        result = await seeded_db.execute(select(Tag).where(Tag.name == "Pump1.Running"))
        tag = result.scalar_one()
        alarm = Alarm(
            tag_id=tag.id, message="anon", severity=AlarmSeverity.INFO,
            state=AlarmState.ACTIVE_UNACKED,
            triggered_at=datetime.now(timezone.utc),
        )
        seeded_db.add(alarm)
        await seeded_db.commit()
        await seeded_db.refresh(alarm)
        alarm_id = alarm.id

        resp = await test_client.post(f"/api/alarms/{alarm_id}/acknowledge")
        assert resp.status_code == 200

        await seeded_db.refresh(alarm)
        assert alarm.acknowledged_by == "anonymous"
