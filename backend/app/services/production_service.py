"""
Production Service: Monitors active production runs against live machine data.

Integrates with the TagEngine (for good count tracking) and AlarmService
(for reject counting and automatic downtime event creation).

Includes an optional shift scheduler that auto-starts/stops runs at
configured shift boundaries.

Runs as a background service started in the app lifespan.
"""

import asyncio
import logging
from datetime import datetime, time, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models.audit import AuditAction
from app.models.production import DowntimeEvent, ProductionRun
from app.services.audit_service import log_audit
from app.services.tag_engine import TagEngine

logger = logging.getLogger(__name__)

# Module-level reference so production_settings can notify us
production_service: "ProductionService | None" = None


class ProductionService:
    def __init__(self, tag_engine: TagEngine, alarm_service, session_factory: async_sessionmaker):
        self._tag_engine = tag_engine
        self._alarm_service = alarm_service
        self._session_factory = session_factory

        # Production settings (loaded from DB)
        self._good_count_tag: str | None = None
        self._reject_fault_tags: list[str] = []
        self._downtime_alarm_tags: list[str] = []

        # Shift schedule settings
        self._shift_mode: str = "manual"
        self._shifts: list[dict] = []
        self._scheduler_task: asyncio.Task | None = None

        # Track open downtime events by alarm tag name -> downtime event id
        self._open_downtime: dict[str, int] = {}

        self._running = False

    async def start(self):
        global production_service
        production_service = self
        self._running = True

        # Load settings
        async with self._session_factory() as session:
            await self.reload_settings(session)

        # Register alarm callback
        self._alarm_service.add_alarm_callback(self._on_alarm_event)
        logger.info("ProductionService started")

    async def stop(self):
        global production_service
        self._running = False
        self._alarm_service.remove_alarm_callback(self._on_alarm_event)
        if self._scheduler_task and not self._scheduler_task.done():
            self._scheduler_task.cancel()
            try:
                await self._scheduler_task
            except asyncio.CancelledError:
                pass
            self._scheduler_task = None
        production_service = None
        logger.info("ProductionService stopped")

    @property
    def shift_mode(self) -> str:
        return self._shift_mode

    async def reload_settings(self, session):
        from app.api.production_settings import load_production_settings
        settings = await load_production_settings(session)
        self._good_count_tag = settings["good_count_tag"]
        self._reject_fault_tags = settings["reject_fault_tags"]
        self._downtime_alarm_tags = settings["downtime_alarm_tags"]

        old_mode = self._shift_mode
        self._shift_mode = settings.get("shift_mode", "manual")
        self._shifts = settings.get("shifts", [])

        # Start or stop the scheduler based on mode change
        if self._shift_mode == "automatic" and (old_mode != "automatic" or self._scheduler_task is None):
            self._start_scheduler()
        elif self._shift_mode != "automatic" and self._scheduler_task is not None:
            self._stop_scheduler()

        logger.info(
            "Production settings loaded: good_count_tag=%s, reject_tags=%d, downtime_tags=%d, shift_mode=%s, shifts=%d",
            self._good_count_tag, len(self._reject_fault_tags), len(self._downtime_alarm_tags),
            self._shift_mode, len(self._shifts),
        )

    # -----------------------------------------------------------------------
    # Shift scheduler
    # -----------------------------------------------------------------------

    def _start_scheduler(self):
        if self._scheduler_task and not self._scheduler_task.done():
            self._scheduler_task.cancel()
        self._scheduler_task = asyncio.create_task(self._shift_scheduler_loop())
        logger.info("Shift scheduler started")

    def _stop_scheduler(self):
        if self._scheduler_task and not self._scheduler_task.done():
            self._scheduler_task.cancel()
        self._scheduler_task = None
        logger.info("Shift scheduler stopped")

    async def _shift_scheduler_loop(self):
        try:
            while self._running:
                try:
                    await self._check_shift_transition()
                except Exception:
                    logger.exception("Error in shift scheduler")
                await asyncio.sleep(30)
        except asyncio.CancelledError:
            pass

    def _get_current_shift(self) -> dict | None:
        """Determine which shift the current local time falls in."""
        now_t = datetime.now().time()
        for shift in self._shifts:
            if self._is_in_shift(now_t, shift):
                return shift
        return None

    @staticmethod
    def _is_in_shift(now_t: time, shift: dict) -> bool:
        """Check if a time falls within a shift. Handles overnight shifts."""
        start = time.fromisoformat(shift["start_time"])
        end = time.fromisoformat(shift["end_time"])
        if start < end:
            return start <= now_t < end
        else:
            # Overnight shift (e.g., 22:00 - 06:00)
            return now_t >= start or now_t < end

    async def _check_shift_transition(self):
        """Check if we need to start, stop, or transition a production run."""
        if self._shift_mode != "automatic" or not self._shifts:
            return

        current_shift = self._get_current_shift()

        async with self._session_factory() as session:
            # Find active run
            result = await session.execute(
                select(ProductionRun)
                .where(ProductionRun.end_time.is_(None))
                .order_by(ProductionRun.start_time.desc())
                .limit(1)
            )
            active_run = result.scalar_one_or_none()

            if current_shift is None and active_run is not None:
                # We're in a gap between shifts — stop the run
                await self._auto_stop_run(active_run, session)
                await session.commit()
                logger.info("Shift gap: stopped run #%d", active_run.id)

            elif current_shift is not None and active_run is None:
                # No run but we should have one — start it
                await self._auto_start_run(current_shift, session)
                await session.commit()
                logger.info("Shift start: started run for shift '%s'", current_shift["name"])

            elif current_shift is not None and active_run is not None:
                if active_run.shift != current_shift["name"]:
                    # Shift transition — stop old, start new
                    await self._auto_stop_run(active_run, session)
                    await self._auto_start_run(current_shift, session)
                    await session.commit()
                    logger.info(
                        "Shift transition: stopped run #%d (%s), started new for '%s'",
                        active_run.id, active_run.shift, current_shift["name"],
                    )

    async def _auto_start_run(self, shift: dict, session) -> ProductionRun:
        """Start a production run automatically for a shift."""
        run = ProductionRun(
            shift=shift["name"],
            target_count=shift.get("target_count"),
            start_time=datetime.now(timezone.utc),
        )
        session.add(run)
        await session.flush()
        await self.on_run_start(run, session)
        await log_audit(
            session, AuditAction.PRODUCTION_START,
            user="system",
            details=f"Auto-started run #{run.id} for shift '{shift['name']}'",
        )
        return run

    async def _auto_stop_run(self, run: ProductionRun, session) -> None:
        """Stop a production run automatically and compute OEE."""
        run.end_time = datetime.now(timezone.utc)
        await self.on_run_stop(run, session)
        await self._calculate_oee(run, session)
        await log_audit(
            session, AuditAction.PRODUCTION_STOP,
            user="system",
            details=f"Auto-stopped run #{run.id} shift='{run.shift}' good={run.good_count} reject={run.reject_count}",
        )

    @staticmethod
    async def _calculate_oee(run: ProductionRun, session) -> None:
        """Compute OEE metrics for a completed run."""
        total_parts = run.good_count + run.reject_count

        # Quality
        if total_parts > 0:
            run.quality = run.good_count / total_parts
        else:
            run.quality = None

        # Availability
        if run.end_time and run.start_time:
            # Normalise timezone awareness (SQLite returns naive datetimes)
            end = run.end_time.replace(tzinfo=None) if run.end_time.tzinfo else run.end_time
            start = run.start_time.replace(tzinfo=None) if run.start_time.tzinfo else run.start_time
            run_duration = (end - start).total_seconds()
            if run_duration > 0:
                result = await session.execute(
                    select(func.coalesce(func.sum(DowntimeEvent.duration_seconds), 0))
                    .where(DowntimeEvent.production_run_id == run.id)
                )
                total_downtime = result.scalar() or 0
                run.availability = max(0, (run_duration - total_downtime) / run_duration)
            else:
                run.availability = None
        else:
            run.availability = None

        # Performance (default to 1.0 when no target is set)
        if run.target_count and run.target_count > 0 and total_parts > 0:
            run.performance = min(total_parts / run.target_count, 1.0)
        else:
            run.performance = 1.0

        # OEE composite
        if run.availability is not None and run.performance is not None and run.quality is not None:
            run.oee = run.availability * run.performance * run.quality
        else:
            run.oee = None

    # -----------------------------------------------------------------------
    # Run start/stop hooks
    # -----------------------------------------------------------------------

    async def on_run_start(self, run: ProductionRun, session) -> None:
        """Called when a production run is started. Captures initial counter value."""
        if self._good_count_tag:
            tv = self._tag_engine.get_value(self._good_count_tag)
            if tv:
                try:
                    run.start_good_count = int(tv.value)
                except (ValueError, TypeError):
                    run.start_good_count = 0
            else:
                run.start_good_count = 0
            run.good_count_tag = self._good_count_tag
            logger.info("Run #%d: captured start good count = %s from tag %s",
                        run.id, run.start_good_count, self._good_count_tag)

    async def on_run_stop(self, run: ProductionRun, session) -> None:
        """Called when a production run is stopped. Computes good count delta."""
        if run.good_count_tag and run.start_good_count is not None:
            tv = self._tag_engine.get_value(run.good_count_tag)
            if tv:
                try:
                    current = int(tv.value)
                    run.good_count = max(0, current - run.start_good_count)
                    logger.info("Run #%d: good count delta = %d (current=%d, start=%d)",
                                run.id, run.good_count, current, run.start_good_count)
                except (ValueError, TypeError):
                    pass

        # Close any open auto-downtime events
        now = datetime.now(timezone.utc)
        for tag_name, event_id in list(self._open_downtime.items()):
            event = await session.get(DowntimeEvent, event_id)
            if event and event.production_run_id == run.id and not event.end_time:
                event.end_time = now
                event.duration_seconds = (event.end_time - event.start_time).total_seconds()
                logger.info("Run #%d: closed open downtime event #%d for %s",
                            run.id, event_id, tag_name)
            self._open_downtime.pop(tag_name, None)

    # -----------------------------------------------------------------------
    # Alarm callback
    # -----------------------------------------------------------------------

    def _on_alarm_event(self, alarm_data: dict) -> None:
        """Callback from AlarmService on alarm state changes. Runs synchronously —
        schedule async work via the event loop."""
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self._handle_alarm_async(alarm_data))
        except RuntimeError:
            pass

    async def _handle_alarm_async(self, alarm_data: dict) -> None:
        tag_name = alarm_data.get("tag_name", "")
        state = alarm_data.get("state", "")

        async with self._session_factory() as session:
            # Find active run
            result = await session.execute(
                select(ProductionRun)
                .where(ProductionRun.end_time.is_(None))
                .order_by(ProductionRun.start_time.desc())
                .limit(1)
            )
            active_run = result.scalar_one_or_none()
            if not active_run:
                return

            # Handle reject fault tags
            if tag_name in self._reject_fault_tags and state == "active_unacked":
                active_run.reject_count += 1
                await session.commit()
                logger.info("Run #%d: reject count incremented to %d (alarm on %s)",
                            active_run.id, active_run.reject_count, tag_name)

            # Handle downtime alarm tags
            if tag_name in self._downtime_alarm_tags:
                if state == "active_unacked":
                    # Create downtime event
                    triggered_at = alarm_data.get("triggered_at")
                    start_time = (
                        datetime.fromisoformat(triggered_at.replace("Z", "+00:00"))
                        if triggered_at else datetime.now(timezone.utc)
                    )
                    # Use alarm tag name as reason code
                    event = DowntimeEvent(
                        production_run_id=active_run.id,
                        start_time=start_time,
                        reason_code=tag_name,
                        reason_text=alarm_data.get("message", ""),
                    )
                    session.add(event)
                    await session.flush()
                    self._open_downtime[tag_name] = event.id
                    await session.commit()
                    logger.info("Run #%d: auto-created downtime event #%d for %s",
                                active_run.id, event.id, tag_name)

                elif state in ("inactive", "inactive_unacked"):
                    # Close the open downtime event
                    event_id = self._open_downtime.pop(tag_name, None)
                    if event_id:
                        event = await session.get(DowntimeEvent, event_id)
                        if event and not event.end_time:
                            event.end_time = datetime.now(timezone.utc)
                            event.duration_seconds = (event.end_time - event.start_time).total_seconds()
                            await session.commit()
                            logger.info("Run #%d: closed downtime event #%d for %s (%.0fs)",
                                        active_run.id, event_id, tag_name, event.duration_seconds)
