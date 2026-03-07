"""
Base class for all integrations.

Each integration is a background service that communicates with external
equipment and exposes virtual tags plus optional custom API endpoints.
"""

from abc import ABC, abstractmethod
from typing import Any

from fastapi import APIRouter

from app.services.tag_engine import TagEngine


class IntegrationBase(ABC):
    """Abstract base class for integrations."""

    type_name: str = ""
    display_name: str = ""
    description: str = ""
    default_config: dict = {}

    def __init__(self, name: str, config: dict, tag_engine: TagEngine):
        self.name = name
        self.config = config
        self._tag_engine = tag_engine
        self.connected = False
        self.status_message: str | None = None

    @abstractmethod
    async def start(self):
        """Start the integration (connect, begin polling, etc.)."""

    @abstractmethod
    async def stop(self):
        """Stop the integration (disconnect, cancel tasks, cleanup)."""

    async def configure(self, config: dict):
        """Update configuration at runtime. Default: store and restart."""
        self.config = config
        await self.stop()
        await self.start()

    def get_router(self) -> APIRouter | None:
        """Return a FastAPI router for integration-specific endpoints, or None."""
        return None

    def get_tag_definitions(self) -> list[dict]:
        """
        Return list of virtual tag definitions this integration provides.
        Each dict: {"name": "zebra.status", "data_type": "string",
                     "description": "Printer status", "access_mode": "read"}
        """
        return []

    def _set_tag(self, tag_name: str, value: Any):
        """Push a value into the TagEngine for WebSocket broadcast."""
        self._tag_engine.set_value(tag_name, value)
