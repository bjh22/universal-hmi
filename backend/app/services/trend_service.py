"""
Trend Service: Periodically samples tag values and stores them for historical trending.

Samples are collected in memory each second and flushed to the database in bulk
every FLUSH_INTERVAL_S seconds to reduce SQLite write pressure.

Records tag values over time so operators can view historical charts/graphs (e.g.,
"show me the tank temperature for the last 8 hours"). This is essential for
troubleshooting: when something goes wrong, operators need to see what values
looked like leading up to the event.

Key design decisions:
- Samples every 1 second but buffers in memory and flushes to the database every
  10 seconds. SQLite can bottleneck on frequent small writes, so batching is critical.
- Deadband filtering skips recording values that haven't changed significantly,
  saving storage space (a stable sensor doesn't need a new row every second).
- Retention cleanup runs hourly to delete data older than the configured period
  (default 90 days), preventing the database from growing indefinitely.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import async_session
from app.models.alarm import AlarmHistory, AlarmState, Alarm
from app.models.audit import AuditLog
from app.models.tag import Tag
from app.models.trend import TrendData
from app.services.tag_engine import TagEngine

logger = logging.getLogger(__name__)

FLUSH_INTERVAL_S = 10
CLEANUP_INTERVAL_S = 3600  # Run retention cleanup once per hour


class TrendService:
    def __init__(self, tag_engine: TagEngine):
        self._tag_engine = tag_engine
        self._running = False
        self._task: asyncio.Task | None = None
        self._trending_tags: list[dict] = []
        self._buffer: list[dict] = []
        self._last_values: dict[int, float | str | None] = {}  # tag_id -> last recorded value

    async def load_trending_tags(self, session: AsyncSession):
        result = await session.execute(
            select(Tag).where(Tag.trending_enabled == True)  # noqa: E712
        )
        tags = result.scalars().all()
        self._trending_tags = [
            {
                "tag_id": t.id,
                "name": t.name,
                "sample_rate_ms": t.trending_sample_rate_ms or 1000,
                "deadband": t.deadband,
            }
            for t in tags
        ]

    async def reload_trending_tags(self):
        """Reload trending tag configs from DB (call after tag trending settings change)."""
        async with async_session() as session:
            await self.load_trending_tags(session)

    async def start(self):
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._sample_loop())
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())

    async def stop(self):
        self._running = False
        for task in [self._task, getattr(self, '_cleanup_task', None)]:
            if task:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
        # Graceful shutdown: flush any remaining buffered samples to the database
        # so we don't lose the last few seconds of data when the service stops
        await self._flush()

    async def _flush(self):
        """Bulk-insert buffered samples into the database."""
        if not self._buffer:
            return
        batch = self._buffer
        self._buffer = []
        try:
            async with async_session() as session:
                await session.execute(insert(TrendData), batch)
                await session.commit()
        except Exception:
            logger.exception("Failed to flush %d trend samples", len(batch))

    async def _sample_loop(self):
        ticks_since_flush = 0
        while self._running:
            if self._trending_tags:
                now = datetime.now(timezone.utc)
                for tc in self._trending_tags:
                    tv = self._tag_engine.get_value(tc["name"])
                    if tv is None:
                        continue
                    # Dual value storage: try to store as a float for efficient
                    # querying and charting. If the value isn't numeric (e.g., a
                    # string like "Running" or "Idle"), store it in string_value instead.
                    try:
                        numeric_value = float(tv.value) if tv.value is not None else None
                        string_value = None
                    except (TypeError, ValueError):
                        numeric_value = None
                        string_value = str(tv.value)

                    # Deadband: skip if value hasn't changed enough
                    tag_id = tc["tag_id"]
                    deadband = tc.get("deadband")
                    if deadband and numeric_value is not None and tag_id in self._last_values:
                        last = self._last_values[tag_id]
                        if isinstance(last, (int, float)) and abs(numeric_value - last) < deadband:
                            continue

                    self._last_values[tag_id] = numeric_value if numeric_value is not None else string_value
                    self._buffer.append({
                        "tag_id": tag_id,
                        "timestamp": now,
                        "value": numeric_value,
                        "string_value": string_value,
                    })

                ticks_since_flush += 1
                if ticks_since_flush >= FLUSH_INTERVAL_S:
                    await self._flush()
                    ticks_since_flush = 0

            await asyncio.sleep(1.0)

    async def _cleanup_loop(self):
        """Periodically delete old data to prevent the database from growing indefinitely.
        Runs once per hour. Cleans up trends, audit logs, and resolved alarm history
        based on their configured retention periods.
        """
        while self._running:
            await asyncio.sleep(CLEANUP_INTERVAL_S)
            try:
                now = datetime.now(timezone.utc)
                async with async_session() as session:
                    # Trend data cleanup
                    trend_cutoff = now - timedelta(days=settings.trend_retention_days)
                    result = await session.execute(
                        delete(TrendData).where(TrendData.timestamp < trend_cutoff)
                    )
                    if result.rowcount:
                        logger.info("Cleaned up %d trend records older than %d days", result.rowcount, settings.trend_retention_days)

                    # Audit log cleanup
                    audit_cutoff = now - timedelta(days=settings.audit_retention_days)
                    result = await session.execute(
                        delete(AuditLog).where(AuditLog.timestamp < audit_cutoff)
                    )
                    if result.rowcount:
                        logger.info("Cleaned up %d audit log records older than %d days", result.rowcount, settings.audit_retention_days)

                    # Alarm history cleanup
                    alarm_cutoff = now - timedelta(days=settings.alarm_retention_days)
                    result = await session.execute(
                        delete(AlarmHistory).where(AlarmHistory.triggered_at < alarm_cutoff)
                    )
                    if result.rowcount:
                        logger.info("Cleaned up %d alarm history records older than %d days", result.rowcount, settings.alarm_retention_days)

                    # Clean up fully resolved alarms (INACTIVE) older than 7 days
                    inactive_cutoff = now - timedelta(days=7)
                    result = await session.execute(
                        delete(Alarm).where(
                            Alarm.state == AlarmState.INACTIVE,
                            Alarm.cleared_at < inactive_cutoff,
                        )
                    )
                    if result.rowcount:
                        logger.info("Cleaned up %d resolved alarm records", result.rowcount)

                    await session.commit()
            except Exception:
                logger.exception("Failed to clean up old data")
