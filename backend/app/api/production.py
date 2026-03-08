from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.audit import AuditAction
from app.models.production import DowntimeEvent, ProductionRun
from app.models.user import User, UserRole
from app.api.deps import require_role
from app.services.audit_service import log_audit

router = APIRouter(prefix="/api/production", tags=["production"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class ProductionRunCreate(BaseModel):
    job_name: str | None = None
    shift: str | None = None
    target_count: int | None = None


class ProductionRunStop(BaseModel):
    good_count: int = 0
    reject_count: int = 0
    target_count: int | None = None


class ProductionRunUpdate(BaseModel):
    job_name: str | None = None
    shift: str | None = None
    target_count: int | None = None
    good_count: int | None = None
    reject_count: int | None = None
    availability: float | None = None
    performance: float | None = None
    quality: float | None = None
    oee: float | None = None


class DowntimeEventCreate(BaseModel):
    production_run_id: int
    start_time: str
    end_time: str | None = None
    reason_code: str | None = None
    reason_text: str | None = None


class DowntimeEventUpdate(BaseModel):
    start_time: str | None = None
    end_time: str | None = None
    reason_code: str | None = None
    reason_text: str | None = None


# ---------------------------------------------------------------------------
# Serialization helpers
# ---------------------------------------------------------------------------

def _run_out(r: ProductionRun) -> dict:
    return {
        "id": r.id,
        "job_name": r.job_name,
        "start_time": r.start_time.isoformat(),
        "end_time": r.end_time.isoformat() if r.end_time else None,
        "good_count": r.good_count,
        "reject_count": r.reject_count,
        "target_count": r.target_count,
        "availability": r.availability,
        "performance": r.performance,
        "quality": r.quality,
        "oee": r.oee,
        "shift": r.shift,
    }


def _downtime_out(e: DowntimeEvent) -> dict:
    return {
        "id": e.id,
        "production_run_id": e.production_run_id,
        "start_time": e.start_time.isoformat(),
        "end_time": e.end_time.isoformat() if e.end_time else None,
        "reason_code": e.reason_code,
        "reason_text": e.reason_text,
        "duration_seconds": e.duration_seconds,
    }


def _parse_iso(value: str) -> datetime:
    """Parse ISO datetime, handling Z suffix for Python 3.10 compat."""
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


# ---------------------------------------------------------------------------
# OEE calculation
# ---------------------------------------------------------------------------

async def _calculate_oee(run: ProductionRun, session: AsyncSession) -> None:
    total_parts = run.good_count + run.reject_count

    # Quality
    if total_parts > 0:
        run.quality = run.good_count / total_parts
    else:
        run.quality = None

    # Availability (based on downtime)
    if run.end_time and run.start_time:
        run_duration = (run.end_time - run.start_time).total_seconds()
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

    # Performance
    if run.target_count and run.target_count > 0 and total_parts > 0:
        run.performance = min(total_parts / run.target_count, 1.0)
    else:
        run.performance = None

    # OEE composite
    if run.availability is not None and run.performance is not None and run.quality is not None:
        run.oee = run.availability * run.performance * run.quality
    else:
        run.oee = None


# ---------------------------------------------------------------------------
# Production run endpoints
# ---------------------------------------------------------------------------

@router.get("/runs")
async def list_runs(
    limit: int = 100,
    start: str | None = None,
    end: str | None = None,
    session: AsyncSession = Depends(get_db),
):
    query = select(ProductionRun).order_by(ProductionRun.start_time.desc())
    if start:
        query = query.where(ProductionRun.start_time >= _parse_iso(start))
    if end:
        query = query.where(ProductionRun.start_time <= _parse_iso(end))
    query = query.limit(limit)
    result = await session.execute(query)
    return [_run_out(r) for r in result.scalars().all()]


@router.get("/runs/{run_id}")
async def get_run(run_id: int, session: AsyncSession = Depends(get_db)):
    run = await session.get(ProductionRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Production run not found")
    return _run_out(run)


@router.post("/runs", status_code=201)
async def start_run(
    body: ProductionRunCreate,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.OPERATOR, UserRole.SUPERVISOR, UserRole.ENGINEER, UserRole.DESIGNER)
    ),
):
    run = ProductionRun(
        job_name=body.job_name,
        shift=body.shift,
        target_count=body.target_count,
        start_time=datetime.now(timezone.utc),
    )
    session.add(run)
    await session.flush()
    await log_audit(
        session, AuditAction.PRODUCTION_START,
        user=current_user.username,
        details=f"Started run #{run.id} job='{body.job_name}' shift='{body.shift}'",
    )
    await session.commit()
    return _run_out(run)


@router.post("/runs/{run_id}/stop")
async def stop_run(
    run_id: int,
    body: ProductionRunStop,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.OPERATOR, UserRole.SUPERVISOR, UserRole.ENGINEER, UserRole.DESIGNER)
    ),
):
    run = await session.get(ProductionRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Production run not found")
    if run.end_time:
        raise HTTPException(status_code=400, detail="Run already stopped")

    run.end_time = datetime.now(timezone.utc)
    run.good_count = body.good_count
    run.reject_count = body.reject_count
    if body.target_count is not None:
        run.target_count = body.target_count

    await _calculate_oee(run, session)

    await log_audit(
        session, AuditAction.PRODUCTION_STOP,
        user=current_user.username,
        details=f"Stopped run #{run.id} good={body.good_count} reject={body.reject_count}",
    )
    await session.commit()
    return _run_out(run)


@router.put("/runs/{run_id}")
async def update_run(
    run_id: int,
    body: ProductionRunUpdate,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.SUPERVISOR, UserRole.ENGINEER, UserRole.DESIGNER)
    ),
):
    run = await session.get(ProductionRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Production run not found")

    for field in ("job_name", "shift", "target_count", "good_count", "reject_count",
                  "availability", "performance", "quality", "oee"):
        value = getattr(body, field)
        if value is not None:
            setattr(run, field, value)

    await log_audit(
        session, AuditAction.PRODUCTION_UPDATE,
        user=current_user.username,
        details=f"Updated run #{run.id}",
    )
    await session.commit()
    return _run_out(run)


@router.delete("/runs/{run_id}", status_code=204)
async def delete_run(
    run_id: int,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.ENGINEER, UserRole.DESIGNER)
    ),
):
    run = await session.get(ProductionRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Production run not found")

    # Delete associated downtime events
    result = await session.execute(
        select(DowntimeEvent).where(DowntimeEvent.production_run_id == run_id)
    )
    for event in result.scalars().all():
        await session.delete(event)

    await session.delete(run)
    await log_audit(
        session, AuditAction.PRODUCTION_DELETE,
        user=current_user.username,
        details=f"Deleted run #{run.id} job='{run.job_name}'",
    )
    await session.commit()


# ---------------------------------------------------------------------------
# Downtime event endpoints
# ---------------------------------------------------------------------------

@router.get("/runs/{run_id}/downtime")
async def get_downtime(run_id: int, session: AsyncSession = Depends(get_db)):
    result = await session.execute(
        select(DowntimeEvent)
        .where(DowntimeEvent.production_run_id == run_id)
        .order_by(DowntimeEvent.start_time)
    )
    return [_downtime_out(e) for e in result.scalars().all()]


@router.post("/downtime", status_code=201)
async def create_downtime(
    body: DowntimeEventCreate,
    session: AsyncSession = Depends(get_db),
    _current_user: User = Depends(
        require_role(UserRole.OPERATOR, UserRole.SUPERVISOR, UserRole.ENGINEER, UserRole.DESIGNER)
    ),
):
    run = await session.get(ProductionRun, body.production_run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Production run not found")

    start = _parse_iso(body.start_time)
    end = _parse_iso(body.end_time) if body.end_time else None
    duration = (end - start).total_seconds() if end else None

    event = DowntimeEvent(
        production_run_id=body.production_run_id,
        start_time=start,
        end_time=end,
        reason_code=body.reason_code or "",
        reason_text=body.reason_text or "",
        duration_seconds=duration,
    )
    session.add(event)
    await session.commit()
    return _downtime_out(event)


@router.put("/downtime/{event_id}")
async def update_downtime(
    event_id: int,
    body: DowntimeEventUpdate,
    session: AsyncSession = Depends(get_db),
    _current_user: User = Depends(
        require_role(UserRole.SUPERVISOR, UserRole.ENGINEER, UserRole.DESIGNER)
    ),
):
    event = await session.get(DowntimeEvent, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Downtime event not found")

    if body.start_time is not None:
        event.start_time = _parse_iso(body.start_time)
    if body.end_time is not None:
        event.end_time = _parse_iso(body.end_time)
    if body.reason_code is not None:
        event.reason_code = body.reason_code
    if body.reason_text is not None:
        event.reason_text = body.reason_text

    # Recalculate duration
    if event.end_time and event.start_time:
        event.duration_seconds = (event.end_time - event.start_time).total_seconds()

    await session.commit()
    return _downtime_out(event)


@router.delete("/downtime/{event_id}", status_code=204)
async def delete_downtime(
    event_id: int,
    session: AsyncSession = Depends(get_db),
    _current_user: User = Depends(
        require_role(UserRole.SUPERVISOR, UserRole.ENGINEER, UserRole.DESIGNER)
    ),
):
    event = await session.get(DowntimeEvent, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Downtime event not found")
    await session.delete(event)
    await session.commit()


@router.get("/downtime/summary")
async def downtime_summary(
    start: str | None = None,
    end: str | None = None,
    session: AsyncSession = Depends(get_db),
):
    query = (
        select(
            DowntimeEvent.reason_code,
            func.count(DowntimeEvent.id).label("count"),
            func.coalesce(func.sum(DowntimeEvent.duration_seconds), 0).label("total_duration"),
        )
        .group_by(DowntimeEvent.reason_code)
    )

    if start or end:
        query = query.join(ProductionRun, DowntimeEvent.production_run_id == ProductionRun.id)
        if start:
            query = query.where(ProductionRun.start_time >= _parse_iso(start))
        if end:
            query = query.where(ProductionRun.start_time <= _parse_iso(end))

    query = query.order_by(func.sum(DowntimeEvent.duration_seconds).desc())
    result = await session.execute(query)
    return [
        {"reason_code": r.reason_code or "Unknown", "count": r.count, "total_duration": r.total_duration or 0}
        for r in result
    ]
