"""
Alarm Service: Evaluates alarm conditions, manages alarm state transitions,
and records alarm history.

Runs an evaluation loop every second that checks tag values against alarm
conditions and manages a state machine for each alarm. Industrial alarms follow
a strict state machine to ensure operators must EXPLICITLY acknowledge problems,
even if the problem clears on its own. This prevents issues from being silently
ignored.

Alarm state machine:
  ACTIVE_UNACKED  -> Problem detected, operator has NOT acknowledged it yet.
  ACTIVE_ACKED    -> Operator acknowledged, but the problem is still ongoing.
  INACTIVE_UNACKED -> Problem resolved on its own BEFORE operator acknowledged.
                      Stays visible so the operator still sees it happened.
  INACTIVE        -> Fully resolved: problem cleared AND operator acknowledged.
                     At this point, a history record is saved and the alarm is removed.

Boolean alarm model: This HMI treats alarms as simple true/false flags. Complex
analog threshold alarming (e.g., "temperature > 200C" or "pressure < 10 PSI")
is handled on the PLC side and reported to the HMI as boolean fault flags.
This keeps the HMI alarm logic simple and avoids duplicating PLC logic.
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
        self._tag_lookup: dict[int, dict] = {}  # tag_id -> {name, display_name} for O(1) lookups
        # Optimization: tracks the last value we evaluated for each tag. If the value
        # hasn't changed since the last check, we skip re-evaluating that alarm condition.
        # This avoids redundant work when most tags are stable most of the time.
        self._last_eval_values: dict[int, object] = {}  # tag_id -> last evaluated value
        self._help_cache: dict[int, dict] = {}  # tag_id -> {help_image, help_text, help_enabled}

    @property
    def active_alarms(self) -> list[Alarm]:
        return list(self._active_alarms.values())

    async def load_alarm_configs(self, session: AsyncSession):
        result = await session.execute(select(Tag).where(Tag.alarm_enabled == True))  # noqa: E712
        tags = result.scalars().all()
        new_configs: list[dict] = []
        new_tag_lookup: dict[int, dict] = {}
        for tag in tags:
            if tag.alarm_config:
                config = json.loads(tag.alarm_config)
                # Skip legacy threshold alarm configs — analog alarming
                # is handled on the PLC side, not in the HMI.
                if config.get("type") == "threshold":
                    logger.warning(
                        "Tag '%s' has a legacy threshold alarm config — skipping. "
                        "Convert to a boolean alarm or disable alarm_enabled.",
                        tag.name,
                    )
                    continue
                config["tag_id"] = tag.id
                config["tag_name"] = tag.name
                config["tag_display_name"] = tag.display_name
                config["tag_description"] = tag.description
                new_configs.append(config)
                new_tag_lookup[tag.id] = {"name": tag.name, "display_name": tag.display_name}

        # Build help cache for fault help dialog data
        new_help_cache: dict[int, dict] = {}
        for config in new_configs:
            if config.get("help_enabled"):
                new_help_cache[config["tag_id"]] = {
                    "help_image": config.get("help_image"),
                    "help_text": config.get("help_text"),
                    "help_enabled": True,
                }

        # Restore active alarms from DB (survive restarts)
        result = await session.execute(
            select(Alarm).where(Alarm.state.in_([
                AlarmState.ACTIVE_UNACKED,
                AlarmState.ACTIVE_ACKED,
                AlarmState.INACTIVE_UNACKED,
            ]))
        )
        new_active_alarms: dict[int, Alarm] = {}
        for alarm in result.scalars().all():
            new_active_alarms[alarm.tag_id] = alarm

        # Swap all state atomically (no await between clear and populate,
        # so the eval loop can't see an empty _active_alarms mid-reload).
        self._alarm_configs = new_configs
        self._tag_lookup = new_tag_lookup
        self._active_alarms = new_active_alarms
        self._help_cache = new_help_cache
        self._last_eval_values = {}

    async def reload_alarm_configs(self):
        """Reload alarm configs from DB (call after tag alarm settings change).

        When a tag's alarm config changes (e.g., severity info→warning) or alarm
        is disabled, any existing active alarm for that tag becomes stale. We must
        retire those stale alarms before loading the new configs, otherwise the old
        alarm persists in the DB and in-memory alongside any new alarm the eval loop
        creates from the updated config.

        IMPORTANT: We do NOT remove stale alarms from _active_alarms before calling
        load_alarm_configs(). The stale alarm sitting in _active_alarms acts as a
        guard — it prevents the eval loop from seeing "no active alarm" and creating
        a duplicate during the awaits inside load_alarm_configs(). The atomic swap
        at the end of load_alarm_configs() naturally drops the stale alarm (since
        it's INACTIVE in DB and won't be restored).
        """
        async with self._session_factory() as session:
            # Build a set of currently configured alarm tag_ids and their configs
            # BEFORE clearing in-memory state, so we can compare against active alarms.
            result = await session.execute(select(Tag).where(Tag.alarm_enabled == True))  # noqa: E712
            new_config_by_tag: dict[int, dict] = {}
            for tag in result.scalars().all():
                if tag.alarm_config:
                    config = json.loads(tag.alarm_config)
                    if config.get("type") == "threshold":
                        continue
                    new_config_by_tag[tag.id] = config

            # Find and retire stale active alarms: alarms whose tag is no longer
            # alarm-enabled, or whose severity/message changed since the alarm fired.
            active_result = await session.execute(
                select(Alarm).where(Alarm.state.in_([
                    AlarmState.ACTIVE_UNACKED,
                    AlarmState.ACTIVE_ACKED,
                    AlarmState.INACTIVE_UNACKED,
                ]))
            )
            now = datetime.now(timezone.utc)
            retired_any = False
            for alarm in active_result.scalars().all():
                new_cfg = new_config_by_tag.get(alarm.tag_id)
                is_stale = False
                if new_cfg is None:
                    # Tag no longer has alarm enabled
                    is_stale = True
                else:
                    # Config changed: severity or message differs from the active alarm
                    cfg_severity = new_cfg.get("severity", "warning")
                    cfg_message = new_cfg.get("message", "")
                    if cfg_severity != alarm.severity.value:
                        is_stale = True
                    elif cfg_message and cfg_message != alarm.message:
                        is_stale = True

                if is_stale:
                    retired_any = True
                    # Transition to INACTIVE and record history
                    alarm.state = AlarmState.INACTIVE
                    alarm.cleared_at = now
                    if not alarm.acknowledged_at:
                        alarm.acknowledged_at = now
                        alarm.acknowledged_by = "system:config_change"
                    self._record_history_obj(session, alarm)

            if retired_any:
                await session.commit()

            # Reload configs — the atomic swap in load_alarm_configs will
            # naturally exclude retired alarms (they're INACTIVE in DB now).
            await self.load_alarm_configs(session)
            # Push a fresh snapshot so all frontends have consistent alarm state
            self.broadcast_alarms_snapshot()

    def broadcast_alarms_snapshot(self):
        """Push current active alarms to all WS subscribers, replacing stale state."""
        alarms = []
        for alarm in self._active_alarms.values():
            tag_name = self._get_tag_name(alarm.tag_id)
            tag_display_name = self._get_tag_display_name(alarm.tag_id)
            help_info = self._help_cache.get(alarm.tag_id, {})
            alarms.append({
                "id": alarm.id,
                "tag_id": alarm.tag_id,
                "tag_name": tag_name,
                "tag_display_name": tag_display_name,
                "message": alarm.message,
                "severity": alarm.severity.value,
                "state": alarm.state.value,
                "triggered_at": alarm.triggered_at.isoformat() + ("" if alarm.triggered_at.tzinfo else "Z"),
                "acknowledged_at": (
                    (alarm.acknowledged_at.isoformat() + ("" if alarm.acknowledged_at.tzinfo else "Z"))
                    if alarm.acknowledged_at else None
                ),
                "acknowledged_by": alarm.acknowledged_by,
                "trigger_value": alarm.trigger_value,
                "help_image": help_info.get("help_image"),
                "help_text": help_info.get("help_text"),
                "help_enabled": help_info.get("help_enabled", False),
            })
        msg = {"type": "alarms_snapshot", "data": alarms}
        for q in self._tag_engine._subscribers:
            try:
                q.put_nowait(msg)
            except asyncio.QueueFull:
                pass

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
        """Checks all alarm-enabled tags once per second. Instead of committing each
        alarm state change individually, all changes are collected into batches
        (new alarms, retriggers, clears) and committed in a single database
        transaction. This is much more efficient for SQLite, which is slow with
        many small writes.
        """
        while self._running:
            try:
                # Collect all state changes, then commit in a single batch
                new_alarms: list[tuple[dict, object]] = []
                retriggers: list[Alarm] = []
                clears: list[tuple[int, object]] = []

                for config in self._alarm_configs:
                    tag_name = config["tag_name"]
                    tag_id = config["tag_id"]
                    tv = self._tag_engine.get_value(tag_name)
                    if tv is None:
                        continue

                    # Skip evaluation if value hasn't changed since last check
                    last_val = self._last_eval_values.get(tag_id)
                    if last_val is not None and last_val == tv.value and tag_id not in self._active_alarms:
                        continue
                    self._last_eval_values[tag_id] = tv.value

                    is_alarm = self._check_condition(config, tv.value)
                    current = self._active_alarms.get(tag_id)

                    if is_alarm and current is None:
                        new_alarms.append((config, tv.value))
                    elif is_alarm and current and current.state == AlarmState.INACTIVE_UNACKED:
                        retriggers.append(current)
                    elif not is_alarm and current and current.state in (
                        AlarmState.ACTIVE_UNACKED, AlarmState.ACTIVE_ACKED
                    ):
                        clears.append((tag_id, tv.value))

                if new_alarms or retriggers or clears:
                    await self._apply_batch(new_alarms, retriggers, clears)

            except Exception:
                logger.exception("Error in alarm evaluation loop")
            await asyncio.sleep(1.0)

    async def _apply_batch(
        self,
        new_alarms: list[tuple[dict, object]],
        retriggers: list[Alarm],
        clears: list[tuple[int, object]],
    ):
        """Apply all alarm state changes in a single DB session."""
        now = datetime.now(timezone.utc)
        async with self._session_factory() as session:
            # New alarms
            for config, value in new_alarms:
                alarm = Alarm(
                    tag_id=config["tag_id"],
                    message=config.get("message") or config.get("tag_description") or config.get("tag_display_name") or f"Alarm on {config['tag_name']}",
                    severity=AlarmSeverity(config.get("severity", "warning")),
                    state=AlarmState.ACTIVE_UNACKED,
                    trigger_value=str(value),
                )
                session.add(alarm)
                # Flush to get the ID for broadcasting
                await session.flush()
                await session.refresh(alarm)
                self._active_alarms[config["tag_id"]] = alarm
                self._broadcast_alarm(alarm, tag_name=config["tag_name"], tag_display_name=config.get("tag_display_name"))

            # Retriggers
            for alarm in retriggers:
                db_alarm = await session.get(Alarm, alarm.id)
                if db_alarm:
                    db_alarm.state = AlarmState.ACTIVE_UNACKED
                    db_alarm.cleared_at = None
                alarm.state = AlarmState.ACTIVE_UNACKED
                alarm.cleared_at = None

            # Clears
            for tag_id, value in clears:
                alarm = self._active_alarms.get(tag_id)
                if not alarm:
                    continue
                new_state = AlarmState.INACTIVE_UNACKED if alarm.state == AlarmState.ACTIVE_UNACKED else AlarmState.INACTIVE
                db_alarm = await session.get(Alarm, alarm.id)
                if db_alarm:
                    db_alarm.state = new_state
                    db_alarm.cleared_at = now
                    if new_state == AlarmState.INACTIVE:
                        self._record_history_obj(session, db_alarm, str(value))
                alarm.state = new_state
                alarm.cleared_at = now
                if new_state == AlarmState.INACTIVE:
                    self._active_alarms.pop(tag_id, None)
                self._broadcast_alarm(alarm)

            await session.commit()

    def _check_condition(self, config: dict, value) -> bool:
        """Boolean alarm check — compare tag value against trigger_on (default True).

        Analog threshold alarming is handled on the PLC side and reported
        to the HMI as boolean fault flags.
        """
        trigger_on = config.get("trigger_on", True)
        # Coerce to bool for reliable comparison across types
        if isinstance(value, str):
            value = value.lower() in ("true", "1", "yes")
        if isinstance(trigger_on, str):
            trigger_on = trigger_on.lower() in ("true", "1", "yes")
        return bool(value) == bool(trigger_on)

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
        self._broadcast_alarm(alarm, tag_name=config["tag_name"], tag_display_name=config.get("tag_display_name"))

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
        entry = self._tag_lookup.get(tag_id)
        return entry["name"] if entry else ""

    def _get_tag_display_name(self, tag_id: int) -> str | None:
        entry = self._tag_lookup.get(tag_id)
        return entry["display_name"] if entry else None

    def _record_history_obj(
        self, session: AsyncSession, alarm: Alarm, clear_value: str | None = None
    ):
        """Add a history record to the session (caller must commit).

        When an alarm is fully resolved (cleared AND acknowledged), we save it to
        alarm_history for regulatory compliance and post-incident troubleshooting.
        Many industries require maintaining alarm logs for audits.
        """
        tag_name = self._get_tag_name(alarm.tag_id)
        history = AlarmHistory(
            tag_id=alarm.tag_id,
            tag_name=tag_name,
            tag_display_name=self._get_tag_display_name(alarm.tag_id),
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
            tag_display_name = self._get_tag_display_name(alarm.tag_id)
        help_info = self._help_cache.get(alarm.tag_id, {})
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
                "triggered_at": alarm.triggered_at.isoformat() + ("" if alarm.triggered_at.tzinfo else "Z"),
                "acknowledged_at": (
                    (alarm.acknowledged_at.isoformat() + ("" if alarm.acknowledged_at.tzinfo else "Z"))
                    if alarm.acknowledged_at else None
                ),
                "acknowledged_by": alarm.acknowledged_by,
                "trigger_value": alarm.trigger_value,
                "help_image": help_info.get("help_image"),
                "help_text": help_info.get("help_text"),
                "help_enabled": help_info.get("help_enabled", False),
            },
        }
        for q in self._tag_engine._subscribers:
            try:
                q.put_nowait(msg)
            except asyncio.QueueFull:
                pass
