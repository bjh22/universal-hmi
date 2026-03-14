from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import case, func, literal_column, select
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

def _utc_iso(dt: datetime | None) -> str | None:
    """Format a datetime as ISO 8601 with Z suffix so JS treats it as UTC."""
    if dt is None:
        return None
    return dt.isoformat() + ("" if dt.tzinfo else "Z")


def _run_out(r: ProductionRun) -> dict:
    good_count = r.good_count

    # Compute live good count for active runs with tag-driven tracking
    if not r.end_time and r.good_count_tag and r.start_good_count is not None:
        from app.services.production_service import production_service
        if production_service:
            tv = production_service._tag_engine.get_value(r.good_count_tag)
            if tv:
                try:
                    good_count = max(0, int(tv.value) - r.start_good_count)
                except (ValueError, TypeError):
                    pass

    return {
        "id": r.id,
        "job_name": r.job_name,
        "start_time": _utc_iso(r.start_time),
        "end_time": _utc_iso(r.end_time),
        "good_count": good_count,
        "reject_count": r.reject_count,
        "target_count": r.target_count,
        "availability": r.availability,
        "performance": r.performance,
        "quality": r.quality,
        "oee": r.oee,
        "shift": r.shift,
        "start_good_count": r.start_good_count,
        "good_count_tag": r.good_count_tag,
    }


def _downtime_out(e: DowntimeEvent) -> dict:
    return {
        "id": e.id,
        "production_run_id": e.production_run_id,
        "start_time": _utc_iso(e.start_time),
        "end_time": _utc_iso(e.end_time),
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
    # Block manual start when in automatic shift mode
    from app.services.production_service import production_service
    if production_service and production_service.shift_mode == "automatic":
        raise HTTPException(
            status_code=409,
            detail="Cannot manually start a run in automatic shift mode. Switch to manual mode in Settings first.",
        )

    run = ProductionRun(
        job_name=body.job_name,
        shift=body.shift,
        target_count=body.target_count,
        start_time=datetime.now(timezone.utc),
    )
    session.add(run)
    await session.flush()

    # Capture initial counter value from tag engine
    if production_service:
        await production_service.on_run_start(run, session)

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

    # Let production service compute tag-driven counts
    from app.services.production_service import production_service
    if production_service:
        await production_service.on_run_stop(run, session)

    # Manual overrides (if provided and non-zero, they take precedence)
    if body.good_count > 0 or not run.good_count_tag:
        run.good_count = body.good_count
    if body.reject_count > 0:
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


# ---------------------------------------------------------------------------
# Time-series analytics
# ---------------------------------------------------------------------------

_GRANULARITY_FMT = {
    "day": "%Y-%m-%d",
    "week": "%Y-W%W",
    "month": "%Y-%m",
}


@router.get("/analytics/time-series")
async def time_series(
    granularity: str = "day",
    start: str | None = None,
    end: str | None = None,
    session: AsyncSession = Depends(get_db),
):
    fmt = _GRANULARITY_FMT.get(granularity, "%Y-%m-%d")
    period_expr = func.strftime(fmt, ProductionRun.start_time)

    query = (
        select(
            period_expr.label("period"),
            func.count(ProductionRun.id).label("run_count"),
            func.coalesce(func.sum(ProductionRun.good_count), 0).label("total_good"),
            func.coalesce(func.sum(ProductionRun.reject_count), 0).label("total_reject"),
            func.avg(
                case(
                    (ProductionRun.oee.isnot(None), ProductionRun.oee),
                    else_=None,
                )
            ).label("avg_oee"),
            func.avg(
                case(
                    (ProductionRun.availability.isnot(None), ProductionRun.availability),
                    else_=None,
                )
            ).label("avg_availability"),
            func.avg(
                case(
                    (ProductionRun.performance.isnot(None), ProductionRun.performance),
                    else_=None,
                )
            ).label("avg_performance"),
            func.avg(
                case(
                    (ProductionRun.quality.isnot(None), ProductionRun.quality),
                    else_=None,
                )
            ).label("avg_quality"),
        )
        .group_by(literal_column("period"))
        .order_by(literal_column("period"))
    )

    if start:
        query = query.where(ProductionRun.start_time >= _parse_iso(start))
    if end:
        query = query.where(ProductionRun.start_time <= _parse_iso(end))

    result = await session.execute(query)
    rows = result.all()

    # Get downtime totals per period
    dt_query = (
        select(
            func.strftime(fmt, ProductionRun.start_time).label("period"),
            func.coalesce(func.sum(DowntimeEvent.duration_seconds), 0).label("total_downtime"),
        )
        .join(ProductionRun, DowntimeEvent.production_run_id == ProductionRun.id)
        .group_by(literal_column("period"))
    )
    if start:
        dt_query = dt_query.where(ProductionRun.start_time >= _parse_iso(start))
    if end:
        dt_query = dt_query.where(ProductionRun.start_time <= _parse_iso(end))

    dt_result = await session.execute(dt_query)
    downtime_map = {r.period: r.total_downtime for r in dt_result}

    # Get shift breakdown per period
    shift_query = (
        select(
            func.strftime(fmt, ProductionRun.start_time).label("period"),
            func.coalesce(ProductionRun.shift, literal_column("'Unassigned'")).label("shift"),
            func.sum(ProductionRun.good_count).label("good"),
            func.sum(ProductionRun.reject_count).label("reject"),
            func.avg(
                case(
                    (ProductionRun.oee.isnot(None), ProductionRun.oee),
                    else_=None,
                )
            ).label("avg_oee"),
        )
        .group_by(literal_column("period"), literal_column("shift"))
        .order_by(literal_column("period"))
    )
    if start:
        shift_query = shift_query.where(ProductionRun.start_time >= _parse_iso(start))
    if end:
        shift_query = shift_query.where(ProductionRun.start_time <= _parse_iso(end))

    shift_result = await session.execute(shift_query)
    shift_map: dict[str, dict] = {}
    for r in shift_result:
        if r.period not in shift_map:
            shift_map[r.period] = {}
        shift_map[r.period][r.shift or "Unassigned"] = {
            "good": int(r.good or 0),
            "reject": int(r.reject or 0),
            "avg_oee": round(float(r.avg_oee), 4) if r.avg_oee is not None else None,
        }

    return [
        {
            "period": r.period,
            "run_count": r.run_count,
            "total_good": int(r.total_good),
            "total_reject": int(r.total_reject),
            "avg_oee": round(float(r.avg_oee), 4) if r.avg_oee is not None else None,
            "avg_availability": round(float(r.avg_availability), 4) if r.avg_availability is not None else None,
            "avg_performance": round(float(r.avg_performance), 4) if r.avg_performance is not None else None,
            "avg_quality": round(float(r.avg_quality), 4) if r.avg_quality is not None else None,
            "total_downtime_seconds": downtime_map.get(r.period, 0),
            "shifts": shift_map.get(r.period, {}),
        }
        for r in rows
    ]
