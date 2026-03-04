import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.production import DowntimeEvent, ProductionRun

router = APIRouter(prefix="/api/production", tags=["production"])


class ProductionRunOut(BaseModel):
    id: int
    job_name: str | None
    start_time: str
    end_time: str | None
    good_count: int
    reject_count: int
    oee: float | None
    shift: str | None

    model_config = {"from_attributes": True}


@router.get("/runs")
async def list_runs(
    limit: int = 50,
    session: AsyncSession = Depends(get_db),
):
    result = await session.execute(
        select(ProductionRun).order_by(ProductionRun.start_time.desc()).limit(limit)
    )
    runs = result.scalars().all()
    return [
        {
            "id": r.id,
            "job_name": r.job_name,
            "start_time": r.start_time.isoformat(),
            "end_time": r.end_time.isoformat() if r.end_time else None,
            "good_count": r.good_count,
            "reject_count": r.reject_count,
            "availability": r.availability,
            "performance": r.performance,
            "quality": r.quality,
            "oee": r.oee,
            "shift": r.shift,
        }
        for r in runs
    ]


@router.get("/runs/{run_id}")
async def get_run(run_id: int, session: AsyncSession = Depends(get_db)):
    run = await session.get(ProductionRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Production run not found")
    return run


@router.get("/runs/{run_id}/downtime")
async def get_downtime(run_id: int, session: AsyncSession = Depends(get_db)):
    result = await session.execute(
        select(DowntimeEvent)
        .where(DowntimeEvent.production_run_id == run_id)
        .order_by(DowntimeEvent.start_time)
    )
    return result.scalars().all()
