"""
Modbus TCP protocol driver using pymodbus.
"""

from typing import Any

from app.drivers.base import ProtocolDriver


class ModbusDriver(ProtocolDriver):
    def __init__(self, name: str, config: dict):
        super().__init__(name, config)
        self._client = None

    async def connect(self):
        try:
            from pymodbus.client import AsyncModbusTcpClient

            host = self.config.get("host", "127.0.0.1")
            port = self.config.get("port", 502)
            self._client = AsyncModbusTcpClient(host, port=port)
            await self._client.connect()
            self.connected = self._client.connected
        except Exception:
            self.connected = False
            raise

    async def disconnect(self):
        if self._client:
            self._client.close()
        self.connected = False

    async def read_tag(self, address: str) -> Any:
        if not self._client:
            return None
        reg_type, reg_addr, count = self._parse_address(address)
        return await self._read_register(reg_type, reg_addr, count)

    async def write_tag(self, address: str, value: Any) -> bool:
        if not self._client:
            return False
        reg_type, reg_addr, _ = self._parse_address(address)
        if reg_type == "coil":
            await self._client.write_coil(reg_addr, bool(value))
        elif reg_type == "holding":
            await self._client.write_register(reg_addr, int(value))
        return True

    async def read_tags(self, addresses: list[str]) -> dict[str, Any]:
        result = {}
        for addr in addresses:
            try:
                result[addr] = await self.read_tag(addr)
            except Exception:
                result[addr] = None
        return result

    async def browse(self) -> list[dict]:
        # Modbus doesn't support browsing; return empty
        return []

    def _parse_address(self, address: str) -> tuple[str, int, int]:
        """Parse address like 'holding:40001:1' or 'coil:0:1' or 'input:30001:2'."""
        parts = address.split(":")
        reg_type = parts[0] if len(parts) > 0 else "holding"
        reg_addr = int(parts[1]) if len(parts) > 1 else 0
        count = int(parts[2]) if len(parts) > 2 else 1
        return reg_type, reg_addr, count

    async def _read_register(self, reg_type: str, address: int, count: int):
        if reg_type == "coil":
            result = await self._client.read_coils(address, count)
            return result.bits[0] if result and not result.isError() else None
        elif reg_type == "discrete":
            result = await self._client.read_discrete_inputs(address, count)
            return result.bits[0] if result and not result.isError() else None
        elif reg_type == "input":
            result = await self._client.read_input_registers(address, count)
            return result.registers[0] if result and not result.isError() else None
        else:  # holding
            result = await self._client.read_holding_registers(address, count)
            return result.registers[0] if result and not result.isError() else None
