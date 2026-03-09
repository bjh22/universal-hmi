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

    @property
    def address_prefix(self) -> str | None:
        """Return the detected address prefix, if any."""
        return None

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

    async def browse_level(self, parent_node_id: str | None = None) -> list[dict]:
        """Browse a single level of the tag tree (lazy browsing).

        Args:
            parent_node_id: Protocol-specific parent identifier.
                           None means browse from the root.

        Returns:
            List of dicts. Each dict has at minimum: node_id, name, node_class
            ("variable" or "object"). Variables include data_type.
            Objects include has_children boolean.

        Default implementation falls back to full browse() for drivers
        that don't support incremental browsing.
        """
        tags = await self.browse()
        # Convert flat tag list to variable entries
        return [
            {**tag, "node_class": "variable", "has_children": False}
            for tag in tags
        ]

    def clear_browse_cache(self):
        """Clear any cached browse results. No-op by default."""

    async def reconnect(self):
        """Disconnect and reconnect with backoff."""
        await self.disconnect()
        await self.connect()
