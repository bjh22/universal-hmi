"""
OPC UA protocol driver using asyncua.
"""

from typing import Any

from app.drivers.base import ProtocolDriver


class OpcuaDriver(ProtocolDriver):
    def __init__(self, name: str, config: dict):
        super().__init__(name, config)
        self._client = None

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

    async def read_tag(self, address: str) -> Any:
        if not self._client:
            return None
        node = self._client.get_node(address)
        return await node.read_value()

    async def write_tag(self, address: str, value: Any) -> bool:
        if not self._client:
            return False
        node = self._client.get_node(address)
        await node.write_value(value)
        return True

    async def read_tags(self, addresses: list[str]) -> dict[str, Any]:
        result = {}
        if not self._client:
            return result
        for addr in addresses:
            try:
                node = self._client.get_node(addr)
                result[addr] = await node.read_value()
            except Exception:
                result[addr] = None
        return result

    async def browse(self) -> list[dict]:
        if not self._client:
            return []
        tags = []
        root = self._client.get_objects_node()
        await self._browse_recursive(root, tags, depth=0, max_depth=10)
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
