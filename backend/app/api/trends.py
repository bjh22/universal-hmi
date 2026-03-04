from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.trend import TrendData, TrendView

router = APIRouter(prefix="/api/trends", tags=["trends"])


@router.get("/data/{tag_id}")
async def get_trend_data(
    tag_id: int,
    hours: float = 1,
    limit: int = 1000,
    session: AsyncSession = Depends(get_db),
):
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    result = await session.execute(
        select(TrendData)
        .where(TrendData.tag_id == tag_id, TrendData.timestamp >= since)
        .order_by(TrendData.timestamp.asc())
        .limit(limit)
    )
    rows = result.scalars().all()
    return [
        {
            "timestamp": r.timestamp.isoformat(),
            "value": r.value,
            "string_value": r.string_value,
        }
        for r in rows
    ]


class TrendViewCreate(BaseModel):
    name: str
    config: str = "{}"


class TrendViewOut(BaseModel):
    id: int
    name: str
    config: str

    model_config = {"from_attributes": True}


@router.get("/views", response_model=list[TrendViewOut])
async def list_trend_views(session: AsyncSession = Depends(get_db)):
    result = await session.execute(select(TrendView).order_by(TrendView.name))
    return result.scalars().all()


@router.post("/views", response_model=TrendViewOut, status_code=201)
async def create_trend_view(body: TrendViewCreate, session: AsyncSession = Depends(get_db)):
    view = TrendView(**body.model_dump())
    session.add(view)
    await session.flush()
    return view


@router.delete("/views/{view_id}", status_code=204)
async def delete_trend_view(view_id: int, session: AsyncSession = Depends(get_db)):
    view = await session.get(TrendView, view_id)
    if not view:
        raise HTTPException(status_code=404, detail="Trend view not found")
    await session.delete(view)
