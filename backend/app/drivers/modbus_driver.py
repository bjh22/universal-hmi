"""
Modbus TCP protocol driver using pymodbus.
"""

import asyncio
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
            timeout = self.config.get("connect_timeout", 10)
            self._client = AsyncModbusTcpClient(host, port=port, timeout=timeout)
            await asyncio.wait_for(self._client.connect(), timeout=timeout)
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
        """Read multiple tags, batching contiguous registers of the same type.

        Groups addresses by register type and merges contiguous address ranges
        into single multi-register reads to minimize network round-trips.
        """
        if not self._client:
            return {addr: None for addr in addresses}

        result: dict[str, Any] = {}

        # Group by register type for batch reads
        groups: dict[str, list[tuple[str, int, int]]] = {}  # type -> [(addr_str, reg_addr, count)]
        for addr in addresses:
            reg_type, reg_addr, count = self._parse_address(addr)
            groups.setdefault(reg_type, []).append((addr, reg_addr, count))

        for reg_type, entries in groups.items():
            # Sort by register address for contiguous range detection
            entries.sort(key=lambda x: x[1])

            # Build contiguous batches (gap of > 1 register breaks the batch)
            batches: list[list[tuple[str, int, int]]] = []
            current_batch: list[tuple[str, int, int]] = [entries[0]]
            for i in range(1, len(entries)):
                prev_addr_str, prev_reg, prev_count = current_batch[-1]
                cur_addr_str, cur_reg, cur_count = entries[i]
                if cur_reg <= prev_reg + prev_count:
                    current_batch.append(entries[i])
                else:
                    batches.append(current_batch)
                    current_batch = [entries[i]]
            batches.append(current_batch)

            for batch in batches:
                if len(batch) == 1:
                    # Single register — use simple read
                    addr_str, reg_addr, count = batch[0]
                    try:
                        result[addr_str] = await self._read_register(reg_type, reg_addr, count)
                    except Exception:
                        result[addr_str] = None
                    continue

                # Multi-register batch read
                batch_start = batch[0][1]
                batch_end = batch[-1][1] + batch[-1][2]
                total_count = batch_end - batch_start

                try:
                    batch_result = await self._read_register_batch(reg_type, batch_start, total_count)
                    if batch_result is not None:
                        for addr_str, reg_addr, count in batch:
                            offset = reg_addr - batch_start
                            if reg_type in ("coil", "discrete"):
                                result[addr_str] = batch_result[offset] if offset < len(batch_result) else None
                            else:
                                result[addr_str] = batch_result[offset] if count == 1 and offset < len(batch_result) else None
                    else:
                        # Batch failed — fall back to individual reads
                        for addr_str, reg_addr, count in batch:
                            try:
                                result[addr_str] = await self._read_register(reg_type, reg_addr, count)
                            except Exception:
                                result[addr_str] = None
                except Exception:
                    # Batch failed — fall back to individual reads
                    for addr_str, reg_addr, count in batch:
                        try:
                            result[addr_str] = await self._read_register(reg_type, reg_addr, count)
                        except Exception:
                            result[addr_str] = None

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

    async def _read_register_batch(self, reg_type: str, address: int, count: int) -> list | None:
        """Read multiple contiguous registers/coils and return the full list."""
        if reg_type == "coil":
            result = await self._client.read_coils(address, count)
            return result.bits[:count] if result and not result.isError() else None
        elif reg_type == "discrete":
            result = await self._client.read_discrete_inputs(address, count)
            return result.bits[:count] if result and not result.isError() else None
        elif reg_type == "input":
            result = await self._client.read_input_registers(address, count)
            return result.registers if result and not result.isError() else None
        else:  # holding
            result = await self._client.read_holding_registers(address, count)
            return result.registers if result and not result.isError() else None

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
