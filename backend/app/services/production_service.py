"""
Production Service: Monitors active production runs against live machine data.

Integrates with the TagEngine (for good count tracking) and AlarmService
(for reject counting and automatic downtime event creation).

Runs as a background service started in the app lifespan.
"""

import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models.production import DowntimeEvent, ProductionRun
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

        # Track open downtime events by alarm tag name -> downtime event id
        self._open_downtime: dict[str, int] = {}

    async def start(self):
        global production_service
        production_service = self

        # Load settings
        async with self._session_factory() as session:
            await self.reload_settings(session)

        # Register alarm callback
        self._alarm_service.add_alarm_callback(self._on_alarm_event)
        logger.info("ProductionService started")

    async def stop(self):
        global production_service
        self._alarm_service.remove_alarm_callback(self._on_alarm_event)
        production_service = None
        logger.info("ProductionService stopped")

    async def reload_settings(self, session):
        from app.api.production_settings import load_production_settings
        settings = await load_production_settings(session)
        self._good_count_tag = settings["good_count_tag"]
        self._reject_fault_tags = settings["reject_fault_tags"]
        self._downtime_alarm_tags = settings["downtime_alarm_tags"]
        logger.info(
            "Production settings loaded: good_count_tag=%s, reject_tags=%d, downtime_tags=%d",
            self._good_count_tag, len(self._reject_fault_tags), len(self._downtime_alarm_tags),
        )

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

    def _on_alarm_event(self, alarm_data: dict) -> None:
        """Callback from AlarmService on alarm state changes. Runs synchronously —
        schedule async work via the event loop."""
        import asyncio
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
