"""
Driver Manager: Creates and manages protocol driver instances based on data source config.
"""

import asyncio
import json
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.drivers.base import ProtocolDriver
from app.drivers.ethernet_ip_driver import EthernetIpDriver
from app.drivers.modbus_driver import ModbusDriver
from app.drivers.mqtt_driver import MqttDriver
from app.drivers.opcua_driver import OpcuaDriver
from app.models.datasource import DataSource, ProtocolType

logger = logging.getLogger(__name__)

DRIVER_MAP = {
    ProtocolType.OPCUA: OpcuaDriver,
    ProtocolType.ETHERNET_IP: EthernetIpDriver,
    ProtocolType.MODBUS_TCP: ModbusDriver,
    ProtocolType.MQTT: MqttDriver,
}


class DriverManager:
    def __init__(self):
        self._drivers: dict[int, ProtocolDriver] = {}  # datasource_id -> driver
        self._reconnect_tasks: dict[int, asyncio.Task] = {}

    @property
    def drivers(self) -> dict[int, ProtocolDriver]:
        return self._drivers

    async def load_and_connect(self, session: AsyncSession):
        result = await session.execute(
            select(DataSource).where(
                DataSource.enabled == True,  # noqa: E712
                DataSource.protocol != ProtocolType.SIMULATION,
            )
        )
        sources = result.scalars().all()
        for ds in sources:
            await self.connect_source(ds)

    async def connect_source(self, ds: DataSource):
        driver_cls = DRIVER_MAP.get(ds.protocol)
        if not driver_cls:
            logger.warning(f"No driver for protocol: {ds.protocol}")
            return

        config = json.loads(ds.config) if isinstance(ds.config, str) else ds.config
        driver = driver_cls(name=ds.name, config=config)
        try:
            await driver.connect()
            logger.info(f"Connected to {ds.name} ({ds.protocol.value})")
        except Exception as e:
            logger.error(f"Failed to connect to {ds.name}: {e}")
            self._schedule_reconnect(ds.id, driver)

        self._drivers[ds.id] = driver

    def _schedule_reconnect(self, ds_id: int, driver: ProtocolDriver):
        async def _reconnect():
            delay = 2
            while not driver.connected:
                await asyncio.sleep(delay)
                try:
                    await driver.connect()
                    logger.info(f"Reconnected to {driver.name}")
                except Exception:
                    delay = min(delay * 2, 60)

        if ds_id in self._reconnect_tasks:
            self._reconnect_tasks[ds_id].cancel()
        self._reconnect_tasks[ds_id] = asyncio.create_task(_reconnect())

    async def disconnect_all(self):
        for task in self._reconnect_tasks.values():
            task.cancel()
        self._reconnect_tasks.clear()
        for driver in self._drivers.values():
            try:
                await driver.disconnect()
            except Exception:
                pass
        self._drivers.clear()

    def get_driver(self, datasource_id: int) -> ProtocolDriver | None:
        return self._drivers.get(datasource_id)


driver_manager = DriverManager()
