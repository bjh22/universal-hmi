"""
Tag Engine: In-memory runtime tag value store and simulation engine.

Maintains current values for all tags and runs simulation behaviors
for tags in simulation mode. Pushes updates via WebSocket.

In industrial automation, a "tag" is a named data point representing a sensor
reading, machine state, or setpoint — similar to a variable in a PLC (Programmable
Logic Controller). Examples: "Pump1_Running" (bool), "Tank_Level" (float),
"Motor_Speed_SP" (int setpoint).

The TagEngine holds ALL tag values in memory for fast access (no database round-trip
on every read). It also runs simulation behaviors (sine waves, ramps, random values,
etc.) so the HMI can be developed and tested without real hardware connected.
"""

import asyncio
import json
import logging
import math
import random
import time
from collections import defaultdict
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tag import SimulationBehavior, Tag, TagAccessMode, TagDataType

logger = logging.getLogger(__name__)

# System tag definitions — seeded into the database so they appear in TagPicker
# autocomplete. Values are computed dynamically by _get_system_tag().
SYSTEM_TAG_DEFS = [
    {"name": "$CURRENT_TIME", "display_name": "Current Time", "description": "Current time of day (HH:MM:SS)", "data_type": "string"},
    {"name": "$CURRENT_DATE", "display_name": "Current Date", "description": "Current date (YYYY-MM-DD)", "data_type": "string"},
    {"name": "$CURRENT_DATETIME", "display_name": "Current Date/Time", "description": "Current date and time in ISO 8601 format", "data_type": "string"},
    {"name": "$CURRENT_TIMESTAMP", "display_name": "Unix Timestamp", "description": "Current time as Unix timestamp (seconds since epoch)", "data_type": "int"},
    {"name": "$APP_VERSION", "display_name": "App Version", "description": "Current application version", "data_type": "string"},
    {"name": "$APP_UPTIME", "display_name": "App Uptime", "description": "Seconds since the application started", "data_type": "int"},
    {"name": "$ACTIVE_ALARM_COUNT", "display_name": "Active Alarms", "description": "Number of currently active alarms", "data_type": "int"},
    {"name": "$CRITICAL_ALARM_COUNT", "display_name": "Critical Alarms", "description": "Number of currently active critical alarms", "data_type": "int"},
    {"name": "$UNACKED_ALARM_COUNT", "display_name": "Unacked Alarms", "description": "Number of unacknowledged alarms", "data_type": "int"},
    {"name": "$ACTIVE_JOB", "display_name": "Active Job", "description": "Name of the currently loaded job", "data_type": "string"},
]


class TagValue:
    # __slots__ is a Python optimization: instead of each instance having a flexible
    # __dict__ for attributes, Python pre-allocates fixed memory slots for only these
    # named attributes. This saves significant memory when thousands of TagValue
    # instances exist (one per tag in the system).
    __slots__ = ("tag_id", "name", "value", "quality", "timestamp", "data_type", "description", "display_name", "engineering_units", "display_format")

    def __init__(self, tag_id: int, name: str, value, data_type: str, description: str | None = None, display_name: str | None = None, engineering_units: str | None = None, display_format: str | None = None):
        self.tag_id = tag_id
        self.name = name
        self.value = value
        self.quality = "good"
        self.timestamp = datetime.now(timezone.utc)
        self.data_type = data_type
        self.description = description
        self.display_name = display_name
        self.engineering_units = engineering_units
        self.display_format = display_format

    def to_dict(self) -> dict:
        d = {
            "tag_id": self.tag_id,
            "name": self.name,
            "value": self.value,
            "quality": self.quality,
            "timestamp": self.timestamp.isoformat() + ("" if self.timestamp.tzinfo else "Z"),
        }
        if self.description:
            d["description"] = self.description
        if self.display_name:
            d["display_name"] = self.display_name
        if self.engineering_units:
            d["engineering_units"] = self.engineering_units
        if self.display_format:
            d["display_format"] = self.display_format
        return d


# Quick lookup: system tag name → data_type string
_SYSTEM_TAG_TYPES = {d["name"]: d["data_type"] for d in SYSTEM_TAG_DEFS}


class TagEngine:
    def __init__(self):
        self._values: dict[str, TagValue] = {}
        self._tags: dict[str, Tag] = {}  # tag name -> Tag model
        self._sim_configs: dict[str, dict] = {}  # cached parsed simulation configs
        self._running = False
        self._sim_task: asyncio.Task | None = None
        self._poll_task: asyncio.Task | None = None
        self._driver_manager = None
        self._subscribers: list[asyncio.Queue] = []
        self._start_time = time.time()
        self._system_values: dict[str, object] = {}  # mutable system tag values
        self._last_system_broadcast: dict[str, object] = {}  # last broadcast values for change detection
        # Caches the serialized dict of all tag values. Invalidated on any value change.
        # Without this, we'd re-serialize all tags every 500ms for EACH WebSocket client,
        # which is wasteful when many clients are connected.
        self._snapshot_cache: dict[str, dict] | None = None
        self._poll_tags: dict[int, list[tuple[str, str]]] | None = None  # cached ds_id -> [(name, addr)]

    @property
    def values(self) -> dict[str, TagValue]:
        return self._values

    async def ensure_system_tags(self, session: AsyncSession):
        """Create or update system tags in the database.

        System tags exist in the DB so they appear in TagPicker autocomplete.
        Their runtime values are computed dynamically by _get_system_tag().
        """
        type_map = {"string": TagDataType.STRING, "int": TagDataType.INT, "float": TagDataType.FLOAT, "bool": TagDataType.BOOL}

        for sdef in SYSTEM_TAG_DEFS:
            result = await session.execute(select(Tag).where(Tag.name == sdef["name"]))
            existing = result.scalar_one_or_none()
            if existing:
                existing.is_system = True
                existing.display_name = sdef["display_name"]
                existing.description = sdef["description"]
                existing.data_type = type_map[sdef["data_type"]]
                existing.access_mode = TagAccessMode.READ
                existing.group_name = "System"
            else:
                tag = Tag(
                    name=sdef["name"],
                    display_name=sdef["display_name"],
                    description=sdef["description"],
                    data_type=type_map[sdef["data_type"]],
                    access_mode=TagAccessMode.READ,
                    group_name="System",
                    is_system=True,
                )
                session.add(tag)
        await session.flush()

    async def load_tags(self, session: AsyncSession):
        result = await session.execute(select(Tag))
        tags = result.scalars().all()
        for tag in tags:
            self._tags[tag.name] = tag
            # System tags compute values dynamically — don't add to _values
            if tag.is_system:
                continue
            # Cache parsed simulation config to avoid JSON parsing every cycle
            if tag.simulation_enabled and tag.simulation_config:
                self._sim_configs[tag.name] = json.loads(tag.simulation_config)
            initial_value = self._get_initial_value(tag)
            self._values[tag.name] = TagValue(
                tag_id=tag.id, name=tag.name, value=initial_value,
                data_type=tag.data_type.value, description=tag.description,
                display_name=tag.display_name,
                engineering_units=tag.engineering_units,
                display_format=tag.display_format,
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

    def set_driver_manager(self, dm):
        self._driver_manager = dm

    def get_tag(self, tag_name: str) -> Tag | None:
        return self._tags.get(tag_name)

    def register_tag(self, tag: Tag):
        """Register or update a tag at runtime (e.g. after creation/edit via API).

        Preserves the current runtime value when updating an existing tag so that
        metadata-only edits (description, units, etc.) don't wipe live values.
        """
        self._tags[tag.name] = tag
        # Cache parsed simulation config
        if tag.simulation_enabled and tag.simulation_config:
            self._sim_configs[tag.name] = json.loads(tag.simulation_config)
        else:
            self._sim_configs.pop(tag.name, None)

        existing = self._values.get(tag.name)
        if existing and existing.tag_id == tag.id:
            # Update metadata on existing TagValue, keep current value
            existing.data_type = tag.data_type.value
            existing.description = tag.description
            existing.display_name = tag.display_name
            existing.engineering_units = tag.engineering_units
            existing.display_format = tag.display_format
            self._invalidate_snapshot()
        else:
            # Brand-new tag — set initial value
            initial_value = self._get_initial_value(tag)
            self._values[tag.name] = TagValue(
                tag_id=tag.id, name=tag.name, value=initial_value,
                data_type=tag.data_type.value, description=tag.description,
                display_name=tag.display_name,
                engineering_units=tag.engineering_units,
                display_format=tag.display_format,
            )
        self._poll_tags = None  # invalidate cached poll list

    def _build_poll_tags(self) -> dict[int, list[tuple[str, str]]]:
        """Build and cache the poll tag list grouped by data_source_id."""
        if self._poll_tags is not None:
            return self._poll_tags
        ds_tags: dict[int, list[tuple[str, str]]] = defaultdict(list)
        for name, tag in self._tags.items():
            if tag.data_source_id and tag.address and not tag.simulation_enabled:
                ds_tags[tag.data_source_id].append((name, tag.address))
        self._poll_tags = dict(ds_tags)
        return self._poll_tags

    def get_value(self, tag_name: str) -> TagValue | None:
        # Handle system tags
        if tag_name.startswith("$"):
            return self._get_system_tag(tag_name)
        return self._values.get(tag_name)

    def get_all_values(self) -> dict[str, dict]:
        # Build cached snapshot of regular tags
        if self._snapshot_cache is not None:
            result = dict(self._snapshot_cache)
        else:
            cache = {}
            for name, tv in self._values.items():
                cache[name] = tv.to_dict()
            self._snapshot_cache = cache
            result = dict(cache)
        # Merge system tag values (computed fresh — they change every cycle)
        for sdef in SYSTEM_TAG_DEFS:
            tv = self._get_system_tag(sdef["name"])
            result[tv.name] = tv.to_dict()
        return result

    def _invalidate_snapshot(self):
        self._snapshot_cache = None

    def set_value(self, tag_name: str, value) -> bool:
        if tag_name.startswith("$"):
            self._system_values[tag_name] = value
            # Broadcast immediately so subscribers see the change
            tv = self._get_system_tag(tag_name)
            self._last_system_broadcast[tag_name] = tv.value
            self._broadcast({"type": "tag_update", "data": {tag_name: tv.to_dict()}})
            return True
        tv = self._values.get(tag_name)
        if tv is None:
            return False
        tv.value = value
        tv.timestamp = datetime.now(timezone.utc)
        tv.quality = "good"
        self._invalidate_snapshot()
        self._notify_change(tag_name, tv)
        return True

    @staticmethod
    def _coerce_value(value, data_type: str):
        """Coerce a value to match the tag's data type."""
        match data_type:
            case "float":
                return float(value)
            case "int":
                return int(value)
            case "bool":
                if isinstance(value, str):
                    return value.lower() in ("true", "1", "yes")
                return bool(value)
            case "string":
                return str(value)
            case _:
                return value

    async def write_value(self, tag_name: str, value) -> bool:
        """Write a tag value. If the tag is connected to real hardware (has a
        data_source_id), the write is routed through the appropriate protocol driver
        (OPC-UA, Modbus, etc.) to actually change the value on the PLC/device.
        For simulated tags, it just updates the in-memory store.
        """
        tag = self._tags.get(tag_name)
        if tag is None:
            return False
        # If tag is backed by a data source, write the raw value through the
        # driver — the driver reads the node's actual type (e.g. OPC-UA
        # VariantType) and handles conversion itself.  Coercing to the HMI
        # tag's data_type first would truncate (e.g. float→int loses decimals).
        if tag.data_source_id and tag.address and self._driver_manager:
            driver = self._driver_manager.get_driver(tag.data_source_id)
            if driver and driver.connected:
                try:
                    await driver.write_tag(tag.address, value)
                except Exception as e:
                    logger.warning(f"Driver write failed for {tag_name}: {e}")
        # Coerce for in-memory store only
        try:
            value = self._coerce_value(value, tag.data_type.value)
        except (ValueError, TypeError):
            pass
        return self.set_value(tag_name, value)

    def _notify_change(self, tag_name: str, tv: TagValue):
        msg = {"type": "tag_update", "data": {tag_name: tv.to_dict()}}
        self._broadcast(msg)

    def _broadcast(self, msg: dict):
        """Send a message to all subscribed WebSocket clients.

        QueueFull handling is critical: if a slow or disconnected client can't
        keep up, we drop its messages rather than blocking the entire engine.
        After 50 consecutive dropped messages, we remove the subscriber entirely
        to prevent a dead client from consuming resources indefinitely.
        """
        dead_queues: list[asyncio.Queue] = []
        for q in self._subscribers:
            try:
                q.put_nowait(msg)
            except asyncio.QueueFull:
                # Track consecutively-full queues for cleanup
                if not hasattr(q, '_drop_count'):
                    q._drop_count = 0  # type: ignore[attr-defined]
                q._drop_count += 1  # type: ignore[attr-defined]
                if q._drop_count >= 10:  # type: ignore[attr-defined]
                    dead_queues.append(q)
                    logger.warning("Removing unresponsive WebSocket subscriber (10 consecutive drops)")
        for q in dead_queues:
            self._subscribers.remove(q)

    def subscribe(self) -> asyncio.Queue:
        """Publish-subscribe (pub/sub) pattern: each WebSocket client subscribes by
        getting an asyncio.Queue. The engine pushes tag updates into all queues,
        and each client reads from its own queue. This is more efficient than
        polling — clients get updates instantly without repeatedly asking "anything new?"
        """
        q: asyncio.Queue = asyncio.Queue(maxsize=50)
        self._subscribers.append(q)
        return q

    def unsubscribe(self, q: asyncio.Queue):
        """Remove a client's queue when they disconnect, so we stop pushing to it."""
        if q in self._subscribers:
            self._subscribers.remove(q)

    def _get_system_tag(self, name: str) -> TagValue:
        now = datetime.now(timezone.utc)
        value: object
        data_type = _SYSTEM_TAG_TYPES.get(name, "string")
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
                value = self._system_values.get(name, 0)
            case "$CRITICAL_ALARM_COUNT":
                value = self._system_values.get(name, 0)
            case "$UNACKED_ALARM_COUNT":
                value = self._system_values.get(name, 0)
            case "$ACTIVE_JOB":
                value = self._system_values.get(name, "None")
            case _:
                value = self._system_values.get(name)
        return TagValue(tag_id=0, name=name, value=value, data_type=data_type)

    async def reload(self, session: AsyncSession):
        """Reload all tags from the database (e.g. after a project load/switch)."""
        await self.stop_simulation()
        self._tags.clear()
        self._values.clear()
        self._sim_configs.clear()
        self._snapshot_cache = None
        self._poll_tags = None
        await self.load_tags(session)
        await self.start_simulation()
        # Push full snapshot to all WebSocket subscribers
        snapshot = self.get_all_values()
        self._broadcast({"type": "snapshot", "data": snapshot})

    async def start_simulation(self):
        if self._running:
            return
        self._running = True
        self._sim_task = asyncio.create_task(self._simulation_loop())
        if self._driver_manager:
            self._poll_task = asyncio.create_task(self._polling_loop())

    async def stop_simulation(self):
        self._running = False
        for task in [self._sim_task, self._poll_task]:
            if task:
                task.cancel()
                try:
                    await task
                except (asyncio.CancelledError, Exception):
                    pass

    async def _simulation_loop(self):
        """Runs every 500ms, computing new values for simulated tags (sine waves,
        ramps, random values, toggles, etc.). This lets the HMI show realistic
        behavior during development without connecting to real PLCs/sensors.

        Only tags whose values actually changed are broadcast — this minimizes
        network traffic to WebSocket clients.
        """
        while self._running:
            changed = {}
            elapsed = time.time() - self._start_time
            for name, tag in self._tags.items():
                if not tag.simulation_enabled or not tag.simulation_behavior:
                    continue
                tv = self._values.get(name)
                if tv is None:
                    continue
                config = self._sim_configs.get(name, {})
                new_val = self._compute_sim_value(tag.simulation_behavior, config, elapsed, tv)
                if new_val is not None and new_val != tv.value:
                    tv.value = new_val
                    tv.timestamp = datetime.now(timezone.utc)
                    changed[name] = tv.to_dict()

            # Compute system tag values and include any changes
            for sdef in SYSTEM_TAG_DEFS:
                sname = sdef["name"]
                tv = self._get_system_tag(sname)
                cur_value = tv.value
                if self._last_system_broadcast.get(sname) != cur_value:
                    changed[sname] = tv.to_dict()
                    self._last_system_broadcast[sname] = cur_value

            if changed:
                self._invalidate_snapshot()
                self._broadcast({"type": "tag_update", "data": changed})

            # asyncio.sleep yields control back to the event loop, allowing other
            # async tasks (WebSocket handlers, HTTP requests) to run between cycles
            await asyncio.sleep(0.5)

    async def _polling_loop(self):
        """Poll connected data source drivers (OPC-UA, Modbus, EtherNet/IP, MQTT)
        for real hardware tag values. Runs every 500ms alongside the simulation loop.

        Deadband filtering: for numeric values, ignores changes smaller than the
        configured threshold. This reduces noise from sensor jitter (e.g., a
        temperature reading flickering between 72.01 and 72.02 won't trigger updates).
        """
        while self._running:
            ds_tags = self._build_poll_tags()

            changed = {}
            for ds_id, tag_list in ds_tags.items():
                driver = self._driver_manager.get_driver(ds_id)
                if not driver:
                    continue
                if not driver.connected:
                    # Driver lost connection — trigger reconnection if not already running
                    self._driver_manager.trigger_reconnect(ds_id)
                    # Mark affected tags as bad quality so the UI shows stale data
                    for tag_name, _ in tag_list:
                        tv = self._values.get(tag_name)
                        if tv and tv.quality != "bad":
                            tv.quality = "bad"
                            changed[tag_name] = tv.to_dict()
                    continue
                addresses = [addr for _, addr in tag_list]
                try:
                    values = await driver.read_tags(addresses)
                except Exception as e:
                    logger.warning(f"Failed to poll data source {ds_id}: {e}")
                    # Mark driver disconnected so next cycle triggers reconnect
                    driver.connected = False
                    continue
                # If the driver marked itself disconnected during read_tags
                # (e.g. consecutive failures), trigger reconnect on next cycle
                if not driver.connected:
                    continue
                for tag_name, addr in tag_list:
                    if addr not in values or values[addr] is None:
                        continue
                    tv = self._values.get(tag_name)
                    if tv is None:
                        continue
                    new_val = values[addr]
                    # Apply deadband for numeric values to reduce noise
                    tag = self._tags.get(tag_name)
                    if (tag and tag.deadband and isinstance(new_val, (int, float))
                            and isinstance(tv.value, (int, float))):
                        if abs(new_val - tv.value) < tag.deadband:
                            continue
                    if new_val != tv.value:
                        tv.value = new_val
                        tv.timestamp = datetime.now(timezone.utc)
                        tv.quality = "good"
                        changed[tag_name] = tv.to_dict()

            if changed:
                self._invalidate_snapshot()
                self._broadcast({"type": "tag_update", "data": changed})

            await asyncio.sleep(0.5)

    def unregister_tag(self, tag_name: str):
        """Remove a tag from the in-memory store (e.g. after deletion via API)."""
        self._tags.pop(tag_name, None)
        self._values.pop(tag_name, None)
        self._sim_configs.pop(tag_name, None)
        self._poll_tags = None  # invalidate cached poll list
        self._invalidate_snapshot()

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
                if not period:
                    return min_v
                pos = (elapsed % period) / period
                return min_v + (max_v - min_v) * pos
            case SimulationBehavior.SINE:
                min_v = config.get("min", 0)
                max_v = config.get("max", 100)
                period = config.get("period", 60)
                if not period:
                    return (min_v + max_v) / 2
                mid = (min_v + max_v) / 2
                amp = (max_v - min_v) / 2
                return mid + amp * math.sin(2 * math.pi * elapsed / period)
            case SimulationBehavior.RANDOM:
                min_v = config.get("min", 0)
                max_v = config.get("max", 100)
                return random.uniform(min_v, max_v)
            case SimulationBehavior.TOGGLE:
                period = config.get("period", 10)
                if not period:
                    return current.value
                return (int(elapsed / period) % 2) == 0
            case SimulationBehavior.ENUM_CYCLE:
                values = config.get("values", [0, 1, 2])
                if not values:
                    return current.value
                period = config.get("period", 10)
                if not period:
                    return values[0]
                idx = int(elapsed / period) % len(values)
                return values[idx]
            case _:
                return None


# Singleton pattern: this module-level instance is created once when the module is
# first imported. Every part of the app (API routes, WebSocket handlers, alarm service)
# imports and shares this same instance, ensuring a single source of truth for tag values.
tag_engine = TagEngine()
