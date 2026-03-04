"""
EtherNet/IP (CIP) protocol driver using pycomm3.
"""

from typing import Any

from app.drivers.base import ProtocolDriver


class EthernetIpDriver(ProtocolDriver):
    def __init__(self, name: str, config: dict):
        super().__init__(name, config)
        self._plc = None

    async def connect(self):
        try:
            from pycomm3 import LogixDriver

            ip = self.config.get("ip_address", "192.168.1.1")
            slot = self.config.get("slot", 0)
            self._plc = LogixDriver(f"{ip}/{slot}")
            self._plc.open()
            self.connected = True
        except Exception:
            self.connected = False
            raise

    async def disconnect(self):
        if self._plc:
            try:
                self._plc.close()
            except Exception:
                pass
        self.connected = False

    async def read_tag(self, address: str) -> Any:
        if not self._plc:
            return None
        result = self._plc.read(address)
        return result.value if result else None

    async def write_tag(self, address: str, value: Any) -> bool:
        if not self._plc:
            return False
        result = self._plc.write((address, value))
        return bool(result)

    async def read_tags(self, addresses: list[str]) -> dict[str, Any]:
        if not self._plc:
            return {}
        results = self._plc.read(*addresses)
        if not isinstance(results, list):
            results = [results]
        return {addr: r.value for addr, r in zip(addresses, results) if r}

    async def browse(self) -> list[dict]:
        if not self._plc:
            return []
        tag_list = self._plc.get_tag_list()
        return [
            {
                "name": t.tag_name,
                "data_type": str(t.data_type_name),
                "address": t.tag_name,
            }
            for t in tag_list
        ]
