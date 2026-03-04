"""
MQTT protocol driver using aiomqtt.
"""

import asyncio
import json
from typing import Any

from app.drivers.base import ProtocolDriver


class MqttDriver(ProtocolDriver):
    def __init__(self, name: str, config: dict):
        super().__init__(name, config)
        self._client = None
        self._values: dict[str, Any] = {}
        self._listen_task: asyncio.Task | None = None

    async def connect(self):
        try:
            import aiomqtt

            hostname = self.config.get("hostname", "localhost")
            port = self.config.get("port", 1883)
            self._client = aiomqtt.Client(hostname=hostname, port=port)
            await self._client.__aenter__()
            self.connected = True

            # Subscribe to configured topics
            topics = self.config.get("topics", ["#"])
            for topic in topics:
                await self._client.subscribe(topic)

            self._listen_task = asyncio.create_task(self._listen())
        except Exception:
            self.connected = False
            raise

    async def disconnect(self):
        if self._listen_task:
            self._listen_task.cancel()
            try:
                await self._listen_task
            except asyncio.CancelledError:
                pass
        if self._client:
            try:
                await self._client.__aexit__(None, None, None)
            except Exception:
                pass
        self.connected = False

    async def _listen(self):
        try:
            async for message in self._client.messages:
                topic = str(message.topic)
                try:
                    payload = json.loads(message.payload.decode())
                except (json.JSONDecodeError, UnicodeDecodeError):
                    payload = message.payload.decode()
                self._values[topic] = payload
        except asyncio.CancelledError:
            pass

    async def read_tag(self, address: str) -> Any:
        """Address format: 'topic' or 'topic:json_path' (e.g. 'sensors/temp:value')."""
        parts = address.split(":", 1)
        topic = parts[0]
        value = self._values.get(topic)
        if value is not None and len(parts) > 1:
            json_path = parts[1]
            try:
                for key in json_path.split("."):
                    value = value[key]
            except (KeyError, TypeError, IndexError):
                return None
        return value

    async def write_tag(self, address: str, value: Any) -> bool:
        if not self._client:
            return False
        topic = address.split(":")[0]
        qos = self.config.get("qos", 0)
        payload = json.dumps(value) if not isinstance(value, str) else value
        await self._client.publish(topic, payload, qos=qos)
        return True

    async def read_tags(self, addresses: list[str]) -> dict[str, Any]:
        return {addr: await self.read_tag(addr) for addr in addresses}

    async def browse(self) -> list[dict]:
        return [
            {"name": topic, "address": topic, "data_type": "string"}
            for topic in self._values.keys()
        ]
