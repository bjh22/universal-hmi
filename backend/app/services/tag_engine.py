"""
Tag Engine: In-memory runtime tag value store and simulation engine.

Maintains current values for all tags and runs simulation behaviors
for tags in simulation mode. Pushes updates via WebSocket.
"""

import asyncio
import json
import math
import random
import time
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tag import SimulationBehavior, Tag


class TagValue:
    __slots__ = ("tag_id", "name", "value", "quality", "timestamp", "data_type", "long_description")

    def __init__(self, tag_id: int, name: str, value, data_type: str, long_description: str | None = None):
        self.tag_id = tag_id
        self.name = name
        self.value = value
        self.quality = "good"
        self.timestamp = datetime.now(timezone.utc)
        self.data_type = data_type
        self.long_description = long_description

    def to_dict(self) -> dict:
        d = {
            "tag_id": self.tag_id,
            "name": self.name,
            "value": self.value,
            "quality": self.quality,
            "timestamp": self.timestamp.isoformat(),
        }
        if self.long_description:
            d["long_description"] = self.long_description
        return d


class TagEngine:
    def __init__(self):
        self._values: dict[str, TagValue] = {}
        self._tags: dict[str, Tag] = {}  # tag name -> Tag model
        self._running = False
        self._sim_task: asyncio.Task | None = None
        self._subscribers: list[asyncio.Queue] = []
        self._start_time = time.time()

    @property
    def values(self) -> dict[str, TagValue]:
        return self._values

    async def load_tags(self, session: AsyncSession):
        result = await session.execute(select(Tag))
        tags = result.scalars().all()
        for tag in tags:
            self._tags[tag.name] = tag
            initial_value = self._get_initial_value(tag)
            self._values[tag.name] = TagValue(
                tag_id=tag.id, name=tag.name, value=initial_value,
                data_type=tag.data_type.value, long_description=tag.long_description,
            )

    def _get_initial_value(self, tag: Tag):
        if tag.simulation_enabled and tag.simulation_config:
            config = json.loads(tag.simulation_config)
            if "initial" in config:
                return config["initial"]
        match tag.data_type.value:
            case "bool":
                return False
            case "int":
                return 0
            case "float":
                return 0.0
            case "string":
                return ""
            case _:
                return 0

    def get_value(self, tag_name: str) -> TagValue | None:
        # Handle system tags
        if tag_name.startswith("$"):
            return self._get_system_tag(tag_name)
        return self._values.get(tag_name)

    def get_all_values(self) -> dict[str, dict]:
        result = {}
        for name, tv in self._values.items():
            result[name] = tv.to_dict()
        return result

    def set_value(self, tag_name: str, value) -> bool:
        tv = self._values.get(tag_name)
        if tv is None:
            return False
        tv.value = value
        tv.timestamp = datetime.now(timezone.utc)
        tv.quality = "good"
        self._notify_change(tag_name, tv)
        return True

    def _notify_change(self, tag_name: str, tv: TagValue):
        msg = {"type": "tag_update", "data": {tag_name: tv.to_dict()}}
        for q in self._subscribers:
            try:
                q.put_nowait(msg)
            except asyncio.QueueFull:
                pass

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=100)
        self._subscribers.append(q)
        return q

    def unsubscribe(self, q: asyncio.Queue):
        if q in self._subscribers:
            self._subscribers.remove(q)

    def _get_system_tag(self, name: str) -> TagValue:
        now = datetime.now(timezone.utc)
        value: object
        match name:
            case "$CURRENT_TIME":
                value = now.strftime("%H:%M:%S")
            case "$CURRENT_DATE":
                value = now.strftime("%Y-%m-%d")
            case "$CURRENT_DATETIME":
                value = now.isoformat()
            case "$CURRENT_TIMESTAMP":
                value = int(now.timestamp())
            case "$APP_VERSION":
                value = "0.1.0"
            case "$APP_UPTIME":
                value = int(time.time() - self._start_time)
            case "$ACTIVE_ALARM_COUNT":
                value = 0  # Updated by alarm service
            case "$CRITICAL_ALARM_COUNT":
                value = 0
            case "$UNACKED_ALARM_COUNT":
                value = 0
            case _:
                value = None
        return TagValue(tag_id=0, name=name, value=value, data_type="string")

    async def start_simulation(self):
        if self._running:
            return
        self._running = True
        self._sim_task = asyncio.create_task(self._simulation_loop())

    async def stop_simulation(self):
        self._running = False
        if self._sim_task:
            self._sim_task.cancel()
            try:
                await self._sim_task
            except asyncio.CancelledError:
                pass

    async def _simulation_loop(self):
        while self._running:
            changed = {}
            elapsed = time.time() - self._start_time
            for name, tag in self._tags.items():
                if not tag.simulation_enabled or not tag.simulation_behavior:
                    continue
                tv = self._values.get(name)
                if tv is None:
                    continue
                config = json.loads(tag.simulation_config or "{}")
                new_val = self._compute_sim_value(tag.simulation_behavior, config, elapsed, tv)
                if new_val is not None and new_val != tv.value:
                    tv.value = new_val
                    tv.timestamp = datetime.now(timezone.utc)
                    changed[name] = tv.to_dict()

            if changed:
                msg = {"type": "tag_update", "data": changed}
                for q in self._subscribers:
                    try:
                        q.put_nowait(msg)
                    except asyncio.QueueFull:
                        pass

            await asyncio.sleep(0.5)

    def _compute_sim_value(
        self, behavior: SimulationBehavior, config: dict, elapsed: float, current: TagValue
    ):
        match behavior:
            case SimulationBehavior.STATIC:
                return config.get("value", current.value)
            case SimulationBehavior.RAMP:
                min_v = config.get("min", 0)
                max_v = config.get("max", 100)
                period = config.get("period", 60)
                pos = (elapsed % period) / period
                return min_v + (max_v - min_v) * pos
            case SimulationBehavior.SINE:
                min_v = config.get("min", 0)
                max_v = config.get("max", 100)
                period = config.get("period", 60)
                mid = (min_v + max_v) / 2
                amp = (max_v - min_v) / 2
                return mid + amp * math.sin(2 * math.pi * elapsed / period)
            case SimulationBehavior.RANDOM:
                min_v = config.get("min", 0)
                max_v = config.get("max", 100)
                return random.uniform(min_v, max_v)
            case SimulationBehavior.TOGGLE:
                period = config.get("period", 10)
                return (int(elapsed / period) % 2) == 0
            case SimulationBehavior.ENUM_CYCLE:
                values = config.get("values", [0, 1, 2])
                period = config.get("period", 10)
                idx = int(elapsed / period) % len(values)
                return values[idx]
            case _:
                return None


# Singleton
tag_engine = TagEngine()
