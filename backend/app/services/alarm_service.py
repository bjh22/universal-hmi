"""
Alarm Service: Evaluates alarm conditions, manages alarm state transitions,
and records alarm history.
"""

import asyncio
import json
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alarm import Alarm, AlarmHistory, AlarmSeverity, AlarmState
from app.models.tag import Tag
from app.services.tag_engine import TagEngine


class AlarmService:
    def __init__(self, tag_engine: TagEngine):
        self._tag_engine = tag_engine
        self._running = False
        self._eval_task: asyncio.Task | None = None
        self._alarm_configs: list[dict] = []
        self._active_alarms: dict[int, Alarm] = {}  # tag_id -> active Alarm

    @property
    def active_alarms(self) -> list[Alarm]:
        return list(self._active_alarms.values())

    async def load_alarm_configs(self, session: AsyncSession):
        result = await session.execute(select(Tag).where(Tag.alarm_enabled == True))  # noqa: E712
        tags = result.scalars().all()
        self._alarm_configs = []
        for tag in tags:
            if tag.alarm_config:
                config = json.loads(tag.alarm_config)
                config["tag_id"] = tag.id
                config["tag_name"] = tag.name
                self._alarm_configs.append(config)

    async def start(self):
        if self._running:
            return
        self._running = True
        self._eval_task = asyncio.create_task(self._evaluate_loop())

    async def stop(self):
        self._running = False
        if self._eval_task:
            self._eval_task.cancel()
            try:
                await self._eval_task
            except asyncio.CancelledError:
                pass

    async def acknowledge(self, alarm_id: int, user: str, session: AsyncSession):
        alarm = await session.get(Alarm, alarm_id)
        if alarm and alarm.state in (AlarmState.ACTIVE_UNACKED, AlarmState.INACTIVE_UNACKED):
            now = datetime.now(timezone.utc)
            was_inactive = alarm.state == AlarmState.INACTIVE_UNACKED
            alarm.state = AlarmState.INACTIVE if was_inactive else AlarmState.ACTIVE_ACKED
            alarm.acknowledged_at = now
            alarm.acknowledged_by = user
            await session.commit()
            if was_inactive:
                # Alarm already cleared, remove from active tracking
                self._active_alarms.pop(alarm.tag_id, None)
            elif alarm.tag_id in self._active_alarms:
                self._active_alarms[alarm.tag_id] = alarm
        return alarm

    async def _evaluate_loop(self):
        while self._running:
            for config in self._alarm_configs:
                tag_name = config["tag_name"]
                tag_id = config["tag_id"]
                tv = self._tag_engine.get_value(tag_name)
                if tv is None:
                    continue

                is_alarm = self._check_condition(config, tv.value)
                current = self._active_alarms.get(tag_id)

                if is_alarm and current is None:
                    await self._trigger_alarm(config, tv.value)
                elif is_alarm and current and current.state == AlarmState.INACTIVE_UNACKED:
                    # Alarm re-triggered while waiting for ack — return to active
                    current.state = AlarmState.ACTIVE_UNACKED
                    current.cleared_at = None
                elif not is_alarm and current and current.state in (
                    AlarmState.ACTIVE_UNACKED, AlarmState.ACTIVE_ACKED
                ):
                    await self._clear_alarm(tag_id, tv.value)

            await asyncio.sleep(1.0)

    def _check_condition(self, config: dict, value) -> bool:
        alarm_type = config.get("type", "threshold")
        if alarm_type == "boolean":
            trigger_on = config.get("trigger_on", True)
            return value == trigger_on
        elif alarm_type == "threshold":
            try:
                val = float(value)
            except (TypeError, ValueError):
                return False
            # Support hi/hi_hi/lo/lo_lo thresholds (industry standard)
            for key in ("hi_hi", "hi", "high"):
                limit = config.get(key)
                if limit is not None and val >= float(limit):
                    return True
            for key in ("lo_lo", "lo", "low"):
                limit = config.get(key)
                if limit is not None and val <= float(limit):
                    return True
        return False

    async def _trigger_alarm(self, config: dict, value):
        alarm = Alarm(
            tag_id=config["tag_id"],
            message=config.get("message", f"Alarm on {config['tag_name']}"),
            severity=AlarmSeverity(config.get("severity", "warning")),
            state=AlarmState.ACTIVE_UNACKED,
            trigger_value=str(value),
        )
        self._active_alarms[config["tag_id"]] = alarm
        # Notify subscribers
        msg = {
            "type": "alarm",
            "data": {
                "tag_id": config["tag_id"],
                "tag_name": config["tag_name"],
                "message": alarm.message,
                "severity": alarm.severity.value,
                "state": alarm.state.value,
                "triggered_at": alarm.triggered_at.isoformat(),
            },
        }
        for q in self._tag_engine._subscribers:
            try:
                q.put_nowait(msg)
            except asyncio.QueueFull:
                pass

    async def _clear_alarm(self, tag_id: int, value):
        alarm = self._active_alarms.get(tag_id)
        if alarm:
            alarm.cleared_at = datetime.now(timezone.utc)
            if alarm.state == AlarmState.ACTIVE_UNACKED:
                # Alarm cleared before acknowledgment
                alarm.state = AlarmState.INACTIVE_UNACKED
            else:
                # Alarm was already acknowledged
                alarm.state = AlarmState.INACTIVE
                self._active_alarms.pop(tag_id, None)
