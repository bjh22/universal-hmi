"""
OPC UA protocol driver using asyncua.

Supports automatic address prefix detection for CODESYS-style servers where
the node ID prefix (containing the runtime name) varies between machines but
the variable path remains the same.
"""

import logging
import re
from typing import Any

from app.drivers.base import ProtocolDriver

logger = logging.getLogger(__name__)

# Pattern: ns=<N>;s=|var|<runtime>.Application.
_CODESYS_APP_RE = re.compile(r"^(ns=\d+;s=\|var\|.+?\.Application\.)")


class OpcuaDriver(ProtocolDriver):
    def __init__(self, name: str, config: dict):
        super().__init__(name, config)
        self._client = None
        self._address_prefix: str | None = config.get("address_prefix")

    @property
    def address_prefix(self) -> str | None:
        return self._address_prefix

    async def connect(self):
        try:
            from asyncua import Client

            url = self.config.get("endpoint", "opc.tcp://localhost:4840")
            self._client = Client(url=url)

            security_policy = self.config.get("security_policy")
            if security_policy:
                certificate = self.config.get("certificate")
                private_key = self.config.get("private_key")
                if certificate and private_key:
                    await self._client.set_security_string(
                        f"{security_policy},{certificate},{private_key}"
                    )

            username = self.config.get("username")
            password = self.config.get("password")
            if username and password:
                self._client.set_user(username)
                self._client.set_password(password)

            await self._client.connect()
            self.connected = True
        except Exception:
            self.connected = False
            raise

    async def disconnect(self):
        if self._client:
            try:
                await self._client.disconnect()
            except Exception:
                pass
        self.connected = False

    def _resolve_address(self, address: str) -> str:
        """Prepend address_prefix to relative addresses."""
        if not self._address_prefix or address.startswith("ns="):
            return address
        return f"{self._address_prefix}{address}"

    async def read_tag(self, address: str) -> Any:
        if not self._client:
            return None
        node = self._client.get_node(self._resolve_address(address))
        return await node.read_value()

    async def write_tag(self, address: str, value: Any) -> bool:
        if not self._client:
            return False
        from asyncua import ua

        node = self._client.get_node(self._resolve_address(address))
        # Read the node's data type so we write with the correct VariantType
        variant_type = await node.read_data_type_as_variant_type()
        await node.write_value(ua.DataValue(ua.Variant(value, variant_type)))
        return True

    async def read_tags(self, addresses: list[str]) -> dict[str, Any]:
        result = {}
        if not self._client:
            return result
        for addr in addresses:
            try:
                node = self._client.get_node(self._resolve_address(addr))
                result[addr] = await node.read_value()
            except Exception:
                result[addr] = None
        return result

    async def detect_address_prefix(self) -> str | None:
        """Detect CODESYS-style address prefix by browsing for variable nodes.

        Looks for node IDs matching: ns=N;s=|var|<runtime>.Application.<path>
        Returns the prefix up to and including '.Application.' or None.
        """
        if not self._client:
            return None
        try:
            root = self._client.get_objects_node()
            prefix = await self._find_prefix(root, depth=0, max_depth=4)
            if prefix:
                self._address_prefix = prefix
                logger.info(f"Detected OPC UA address prefix for {self.name}: {prefix}")
            else:
                logger.debug(f"No CODESYS address prefix found for {self.name}")
            return prefix
        except Exception as e:
            logger.debug(f"Address prefix detection failed for {self.name}: {e}")
            return None

    async def _find_prefix(self, node, depth: int, max_depth: int) -> str | None:
        """Recursively browse to find a CODESYS variable node and extract prefix."""
        if depth >= max_depth:
            return None
        try:
            children = await node.get_children()
            for child in children:
                cls = await child.read_node_class()
                if cls.value == 2:  # Variable
                    node_id = child.nodeid.to_string()
                    m = _CODESYS_APP_RE.match(node_id)
                    if m:
                        return m.group(1)
                elif cls.value == 1:  # Object — recurse
                    result = await self._find_prefix(child, depth + 1, max_depth)
                    if result:
                        return result
        except Exception:
            pass
        return None

    async def browse(self) -> list[dict]:
        if not self._client:
            return []
        tags: list[dict] = []
        root = self._client.get_objects_node()
        await self._browse_recursive(root, tags, depth=0, max_depth=10)
        # Add relative_address for tags with a detected prefix
        if self._address_prefix:
            for tag in tags:
                node_id = tag.get("node_id", "")
                if node_id.startswith(self._address_prefix):
                    tag["relative_address"] = node_id[len(self._address_prefix):]
        return tags

    async def _browse_recursive(self, node, tags: list, depth: int, max_depth: int):
        if depth >= max_depth:
            return
        try:
            children = await node.get_children()
            for child in children:
                cls = await child.read_node_class()
                if cls.value == 2:  # Variable
                    try:
                        display_name = await child.read_display_name()
                        data_type = await child.read_data_type_as_variant_type()
                        tags.append(
                            {
                                "node_id": child.nodeid.to_string(),
                                "name": display_name.Text,
                                "data_type": str(data_type),
                            }
                        )
                    except Exception:
                        pass
                elif cls.value == 1:  # Object
                    await self._browse_recursive(child, tags, depth + 1, max_depth)
        except Exception:
            pass
