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
    reason_code: str | None = None
    reason_text: str | None = None


@router.put("/downtime-periods/{alarm_history_id}/annotate")
async def annotate_downtime(
    alarm_history_id: int,
    body: AnnotateBody,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.OPERATOR, UserRole.SUPERVISOR, UserRole.ENGINEER, UserRole.DESIGNER)
    ),
):
    # Look up alarm history entry
    from app.models.alarm import AlarmHistory
    ah = await session.get(AlarmHistory, alarm_history_id)
    if not ah:
        raise HTTPException(status_code=404, detail="Alarm history entry not found")

    # Upsert annotation
    result = await session.execute(
        select(DowntimeAnnotation)
        .where(DowntimeAnnotation.alarm_history_id == alarm_history_id)
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
            alarm_history_id=alarm_history_id,
            tag_name=ah.tag_name,
            start_time=ah.triggered_at,
            end_time=ah.cleared_at,
            reason_code=body.reason_code,
            reason_text=body.reason_text,
            annotated_by=current_user.username,
            annotated_at=now,
        )
        session.add(annotation)

    await session.commit()
    return {"status": "ok", "alarm_history_id": alarm_history_id}


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
