"""
IntegrationManager: Discovers, loads, and manages integration lifecycle.
"""

import importlib
import json
import logging
import pkgutil

from fastapi import FastAPI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.integrations.base import IntegrationBase
from app.models.integration import Integration, IntegrationStatus
from app.services.tag_engine import TagEngine, TagValue

logger = logging.getLogger(__name__)


class IntegrationManager:
    def __init__(self, tag_engine: TagEngine, session_factory: async_sessionmaker):
        self._tag_engine = tag_engine
        self._session_factory = session_factory
        # type_name -> IntegrationBase subclass
        self._registry: dict[str, type[IntegrationBase]] = {}
        # integration db id -> running instance
        self._instances: dict[int, IntegrationBase] = {}

    def discover(self):
        """Scan backend/app/integrations/ for integration packages."""
        import app.integrations as pkg

        for _importer, modname, ispkg in pkgutil.iter_modules(pkg.__path__):
            if not ispkg:
                continue
            try:
                mod = importlib.import_module(f"app.integrations.{modname}")
                cls = getattr(mod, "integration_class", None)
                if cls and issubclass(cls, IntegrationBase):
                    self._registry[cls.type_name] = cls
                    logger.info(
                        f"Discovered integration: {cls.type_name} ({cls.display_name})"
                    )
            except Exception as e:
                logger.warning(f"Failed to load integration {modname}: {e}")

    def get_available_types(self) -> list[dict]:
        """Return metadata for all discovered integration types."""
        return [
            {
                "type_name": cls.type_name,
                "display_name": cls.display_name,
                "description": cls.description,
                "default_config": cls.default_config,
            }
            for cls in self._registry.values()
        ]

    async def load_and_start(self, app: FastAPI):
        """Load enabled integrations from DB and start them."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(Integration).where(Integration.enabled == True)  # noqa: E712
            )
            for db_int in result.scalars().all():
                await self._start_integration(db_int, app, session)
                await session.commit()

    async def _start_integration(
        self, db_int: Integration, app: FastAPI, session: AsyncSession | None = None
    ):
        """Instantiate and start a single integration."""
        cls = self._registry.get(db_int.type_name)
        if not cls:
            logger.warning(f"No integration class for type: {db_int.type_name}")
            return

        config = (
            json.loads(db_int.config) if isinstance(db_int.config, str) else db_int.config
        )
        instance = cls(name=db_int.name, config=config, tag_engine=self._tag_engine)

        # Register virtual tags
        self._register_tags(instance)

        # Mount router if provided
        router = instance.get_router()
        if router:
            app.include_router(router)

        try:
            await instance.start()
            db_int.status = IntegrationStatus.RUNNING.value
            db_int.status_message = None
            logger.info(f"Started integration: {db_int.name} ({db_int.type_name})")
        except Exception as e:
            db_int.status = IntegrationStatus.ERROR.value
            db_int.status_message = str(e)
            logger.error(f"Failed to start integration {db_int.name}: {e}")

        self._instances[db_int.id] = instance

        # Persist status
        if session:
            await session.merge(db_int)
        else:
            async with self._session_factory() as s:
                await s.merge(db_int)
                await s.commit()

    def _register_tags(self, instance: IntegrationBase):
        """Register virtual tags from an integration into the TagEngine."""
        for tag_def in instance.get_tag_definitions():
            name = tag_def["name"]
            if name in self._tag_engine._values:
                continue
            data_type = tag_def.get("data_type", "string")
            initial = {"bool": False, "int": 0, "float": 0.0, "string": ""}.get(
                data_type, ""
            )
            tv = TagValue(
                tag_id=0,
                name=name,
                value=initial,
                data_type=data_type,
                description=tag_def.get("description"),
            )
            self._tag_engine._values[name] = tv

    async def stop_all(self):
        """Stop all running integrations."""
        for _int_id, instance in self._instances.items():
            try:
                await instance.stop()
            except Exception as e:
                logger.error(f"Error stopping integration {instance.name}: {e}")
        self._instances.clear()

    async def enable_integration(
        self, db_int: Integration, app: FastAPI, session: AsyncSession | None = None
    ):
        """Enable and start an integration at runtime."""
        await self._start_integration(db_int, app, session)

    async def disable_integration(self, int_id: int):
        """Stop a running integration."""
        instance = self._instances.pop(int_id, None)
        if instance:
            await instance.stop()

    def get_instance(self, int_id: int) -> IntegrationBase | None:
        return self._instances.get(int_id)

    def get_status(self, int_id: int) -> dict:
        instance = self._instances.get(int_id)
        if not instance:
            return {"connected": False, "status": "stopped"}
        return {
            "connected": instance.connected,
            "status": "running" if instance.connected else "error",
            "status_message": instance.status_message,
        }
