"""
Trend Service: Periodically samples tag values and stores them for historical trending.
"""

import asyncio
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session
from app.models.tag import Tag
from app.models.trend import TrendData
from app.services.tag_engine import TagEngine


class TrendService:
    def __init__(self, tag_engine: TagEngine):
        self._tag_engine = tag_engine
        self._running = False
        self._task: asyncio.Task | None = None
        self._trending_tags: list[dict] = []

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
            }
            for t in tags
        ]

    async def start(self):
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._sample_loop())

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _sample_loop(self):
        while self._running:
            if self._trending_tags:
                async with async_session() as session:
                    for tc in self._trending_tags:
                        tv = self._tag_engine.get_value(tc["name"])
                        if tv is None:
                            continue
                        try:
                            numeric_value = float(tv.value) if tv.value is not None else None
                            string_value = None
                        except (TypeError, ValueError):
                            numeric_value = None
                            string_value = str(tv.value)

                        record = TrendData(
                            tag_id=tc["tag_id"],
                            timestamp=datetime.now(timezone.utc),
                            value=numeric_value,
                            string_value=string_value,
                        )
                        session.add(record)
                    await session.commit()
            await asyncio.sleep(1.0)
