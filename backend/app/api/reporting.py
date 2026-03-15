from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.downtime_annotation import DowntimeAnnotation
from app.models.user import User, UserRole
from app.api.deps import require_role
from app.api.production_settings import load_production_settings
from app.services import reporting_service

router = APIRouter(prefix="/api/reporting", tags=["reporting"])


def _parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _default_range(
    start: str | None, end: str | None,
) -> tuple[datetime, datetime]:
    """Default to last 8 hours if no range specified."""
    if start:
        frame_start = _parse_iso(start)
    else:
        frame_start = datetime.now(timezone.utc) - timedelta(hours=8)
    if end:
        frame_end = _parse_iso(end)
    else:
        frame_end = datetime.now(timezone.utc)
    return frame_start, frame_end


@router.get("/summary")
async def get_summary(
    start: str | None = None,
    end: str | None = None,
    session: AsyncSession = Depends(get_db),
):
    frame_start, frame_end = _default_range(start, end)
    settings = await load_production_settings(session)
    return await reporting_service.compute_report(session, settings, frame_start, frame_end)


@router.get("/time-series")
async def get_time_series(
    start: str | None = None,
    end: str | None = None,
    granularity: str = "day",
    session: AsyncSession = Depends(get_db),
):
    if granularity not in ("day", "week", "month"):
        raise HTTPException(status_code=422, detail="granularity must be day, week, or month")
    frame_start, frame_end = _default_range(start, end)
    settings = await load_production_settings(session)
    return await reporting_service.compute_time_series(
        session, settings, frame_start, frame_end, granularity,
    )


@router.get("/downtime-periods")
async def get_downtime_periods(
    start: str | None = None,
    end: str | None = None,
    session: AsyncSession = Depends(get_db),
):
    frame_start, frame_end = _default_range(start, end)
    settings = await load_production_settings(session)
    return await reporting_service.get_downtime_periods(
        session, settings, frame_start, frame_end,
    )


class AnnotateBody(BaseModel):
    start_time: str
    reason_code: str | None = None
    reason_text: str | None = None


@router.put("/downtime-periods/annotate")
async def annotate_downtime(
    body: AnnotateBody,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.OPERATOR, UserRole.SUPERVISOR, UserRole.ENGINEER, UserRole.DESIGNER)
    ),
):
    start_dt = _parse_iso(body.start_time)

    # Upsert annotation keyed on start_time (merged downtime period key)
    result = await session.execute(
        select(DowntimeAnnotation)
        .where(DowntimeAnnotation.start_time == start_dt)
    )
    existing = result.scalar_one_or_none()

    now = datetime.now(timezone.utc)
    if existing:
        existing.reason_code = body.reason_code
        existing.reason_text = body.reason_text
        existing.annotated_by = current_user.username
        existing.annotated_at = now
    else:
        annotation = DowntimeAnnotation(
            tag_name="",
            start_time=start_dt,
            reason_code=body.reason_code,
            reason_text=body.reason_text,
            annotated_by=current_user.username,
            annotated_at=now,
        )
        session.add(annotation)

    await session.commit()
    return {"status": "ok"}


@router.get("/downtime-summary")
async def get_downtime_summary(
    start: str | None = None,
    end: str | None = None,
    session: AsyncSession = Depends(get_db),
):
    frame_start, frame_end = _default_range(start, end)
    settings = await load_production_settings(session)
    return await reporting_service.get_downtime_summary(
        session, settings, frame_start, frame_end,
    )
