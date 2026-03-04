"""
Base protocol driver interface. All protocol drivers implement this ABC.
"""

from abc import ABC, abstractmethod
from typing import Any


class ProtocolDriver(ABC):
    def __init__(self, name: str, config: dict):
        self.name = name
        self.config = config
        self.connected = False

    @abstractmethod
    async def connect(self):
        """Establish connection to the data source."""

    @abstractmethod
    async def disconnect(self):
        """Close the connection."""

    @abstractmethod
    async def read_tag(self, address: str) -> Any:
        """Read a single tag value by address."""

    @abstractmethod
    async def write_tag(self, address: str, value: Any) -> bool:
        """Write a value to a tag by address."""

    @abstractmethod
    async def read_tags(self, addresses: list[str]) -> dict[str, Any]:
        """Read multiple tag values. Returns {address: value}."""

    @abstractmethod
    async def browse(self) -> list[dict]:
        """Browse available tags/nodes. Returns list of tag metadata dicts."""

    async def reconnect(self):
        """Disconnect and reconnect with backoff."""
        await self.disconnect()
        await self.connect()
