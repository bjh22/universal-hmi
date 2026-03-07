"""
Alarm Service: Evaluates alarm conditions, manages alarm state transitions,
and records alarm history.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.alarm import Alarm, AlarmHistory, AlarmSeverity, AlarmState
from app.models.tag import Tag
from app.services.tag_engine import TagEngine

logger = logging.getLogger(__name__)


class AlarmService:
    def __init__(self, tag_engine: TagEngine, session_factory: async_sessionmaker):
        self._tag_engine = tag_engine
        self._session_factory = session_factory
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
                config["tag_description"] = tag.description
                self._alarm_configs.append(config)

        # Restore active alarms from DB (survive restarts)
        result = await session.execute(
            select(Alarm).where(Alarm.state.in_([
                AlarmState.ACTIVE_UNACKED,
                AlarmState.ACTIVE_ACKED,
                AlarmState.INACTIVE_UNACKED,
            ]))
        )
        for alarm in result.scalars().all():
            self._active_alarms[alarm.tag_id] = alarm

    async def reload_alarm_configs(self):
        """Reload alarm configs from DB (call after tag alarm settings change)."""
        async with self._session_factory() as session:
            await self.load_alarm_configs(session)

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
        """Acknowledge an alarm. Updates DB and in-memory state."""
        alarm = await session.get(Alarm, alarm_id)
        if not alarm or alarm.state not in (
            AlarmState.ACTIVE_UNACKED, AlarmState.INACTIVE_UNACKED
        ):
            return alarm

        now = datetime.now(timezone.utc)
        was_inactive = alarm.state == AlarmState.INACTIVE_UNACKED
        alarm.state = AlarmState.INACTIVE if was_inactive else AlarmState.ACTIVE_ACKED
        alarm.acknowledged_at = now
        alarm.acknowledged_by = user
        await session.flush()

        if was_inactive:
            # Fully resolved — record history and remove from active
            self._record_history_obj(session, alarm)
            self._active_alarms.pop(alarm.tag_id, None)
        else:
            self._active_alarms[alarm.tag_id] = alarm

        self._broadcast_alarm(alarm)
        return alarm

    # ------------------------------------------------------------------
    # Evaluation loop
    # ------------------------------------------------------------------

    async def _evaluate_loop(self):
        while self._running:
            try:
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
                        await self._update_alarm_db(
                            current, AlarmState.ACTIVE_UNACKED, cleared_at=None
                        )
                    elif not is_alarm and current and current.state in (
                        AlarmState.ACTIVE_UNACKED, AlarmState.ACTIVE_ACKED
                    ):
                        await self._clear_alarm(tag_id, tv.value)
            except Exception:
                logger.exception("Error in alarm evaluation loop")
            await asyncio.sleep(1.0)

    def _check_condition(self, config: dict, value) -> bool:
        alarm_type = config.get("type", "threshold")
        if alarm_type == "boolean":
            trigger_on = config.get("trigger_on", True)
            # Coerce to bool for reliable comparison across types
            if isinstance(value, str):
                value = value.lower() in ("true", "1", "yes")
            if isinstance(trigger_on, str):
                trigger_on = trigger_on.lower() in ("true", "1", "yes")
            return bool(value) == bool(trigger_on)
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

    # ------------------------------------------------------------------
    # State transitions (all persist to DB)
    # ------------------------------------------------------------------

    async def _trigger_alarm(self, config: dict, value):
        alarm = Alarm(
            tag_id=config["tag_id"],
            message=config.get("message", f"Alarm on {config['tag_name']}"),
            severity=AlarmSeverity(config.get("severity", "warning")),
            state=AlarmState.ACTIVE_UNACKED,
            trigger_value=str(value),
        )
        async with self._session_factory() as session:
            session.add(alarm)
            await session.commit()
            await session.refresh(alarm)

        self._active_alarms[config["tag_id"]] = alarm
        self._broadcast_alarm(alarm, tag_name=config["tag_name"], tag_display_name=config.get("tag_description"))

    async def _clear_alarm(self, tag_id: int, value):
        alarm = self._active_alarms.get(tag_id)
        if not alarm:
            return

        now = datetime.now(timezone.utc)
        if alarm.state == AlarmState.ACTIVE_UNACKED:
            new_state = AlarmState.INACTIVE_UNACKED
        else:
            new_state = AlarmState.INACTIVE

        async with self._session_factory() as session:
            db_alarm = await session.get(Alarm, alarm.id)
            if db_alarm:
                db_alarm.state = new_state
                db_alarm.cleared_at = now
                await session.commit()

                if new_state == AlarmState.INACTIVE:
                    self._record_history_obj(session, db_alarm, str(value))
                    await session.commit()

        # Update in-memory copy
        alarm.state = new_state
        alarm.cleared_at = now
        if new_state == AlarmState.INACTIVE:
            self._active_alarms.pop(tag_id, None)

        self._broadcast_alarm(alarm)

    async def _update_alarm_db(self, alarm: Alarm, new_state: AlarmState, **fields):
        """Update alarm state in DB and in-memory."""
        async with self._session_factory() as session:
            db_alarm = await session.get(Alarm, alarm.id)
            if db_alarm:
                db_alarm.state = new_state
                for k, v in fields.items():
                    setattr(db_alarm, k, v)
                await session.commit()
        alarm.state = new_state
        for k, v in fields.items():
            setattr(alarm, k, v)

    # ------------------------------------------------------------------
    # History
    # ------------------------------------------------------------------

    def _get_tag_name(self, tag_id: int) -> str:
        for config in self._alarm_configs:
            if config["tag_id"] == tag_id:
                return config["tag_name"]
        return ""

    def _get_tag_description(self, tag_id: int) -> str | None:
        for config in self._alarm_configs:
            if config["tag_id"] == tag_id:
                return config.get("tag_description")
        return None

    def _record_history_obj(
        self, session: AsyncSession, alarm: Alarm, clear_value: str | None = None
    ):
        """Add a history record to the session (caller must commit)."""
        tag_name = self._get_tag_name(alarm.tag_id)
        history = AlarmHistory(
            tag_id=alarm.tag_id,
            tag_name=tag_name,
            tag_display_name=self._get_tag_description(alarm.tag_id),
            message=alarm.message,
            severity=alarm.severity,
            triggered_at=alarm.triggered_at,
            acknowledged_at=alarm.acknowledged_at,
            acknowledged_by=alarm.acknowledged_by,
            cleared_at=alarm.cleared_at,
            trigger_value=alarm.trigger_value,
            clear_value=clear_value,
        )
        session.add(history)

    # ------------------------------------------------------------------
    # WebSocket broadcast
    # ------------------------------------------------------------------

    def _broadcast_alarm(self, alarm: Alarm, tag_name: str | None = None, tag_display_name: str | None = None):
        """Send alarm state to all WebSocket subscribers."""
        if tag_name is None:
            tag_name = self._get_tag_name(alarm.tag_id)
        if tag_display_name is None:
            tag_display_name = self._get_tag_description(alarm.tag_id)
        msg = {
            "type": "alarm",
            "data": {
                "id": alarm.id,
                "tag_id": alarm.tag_id,
                "tag_name": tag_name,
                "tag_display_name": tag_display_name,
                "message": alarm.message,
                "severity": alarm.severity.value,
                "state": alarm.state.value,
                "triggered_at": alarm.triggered_at.isoformat(),
                "acknowledged_at": (
                    alarm.acknowledged_at.isoformat() if alarm.acknowledged_at else None
                ),
                "acknowledged_by": alarm.acknowledged_by,
                "trigger_value": alarm.trigger_value,
            },
        }
        for q in self._tag_engine._subscribers:
            try:
                q.put_nowait(msg)
            except asyncio.QueueFull:
                pass
