import json

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.app_setting import AppSetting
from app.models.user import User, UserRole
from app.api.deps import require_role

router = APIRouter(prefix="/api/service/config", tags=["service-config"])

_KEY = "service.config"


class ServiceTagOverride(BaseModel):
    mode: str = "momentary"  # "momentary" or "toggle"


class ServiceConfigBody(BaseModel):
    overrides: dict[str, ServiceTagOverride] = {}
    order: dict[str, list[str]] = {}  # group name -> ordered tag names


@router.get("/")
async def get_service_config(session: AsyncSession = Depends(get_db)):
    result = await session.execute(select(AppSetting).where(AppSetting.key == _KEY))
    row = result.scalar_one_or_none()
    if row and row.value:
        return json.loads(row.value)
    return {"overrides": {}, "order": {}}


@router.put("/")
async def update_service_config(
    body: ServiceConfigBody,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    value = json.dumps(body.model_dump())
    result = await session.execute(select(AppSetting).where(AppSetting.key == _KEY))
    row = result.scalar_one_or_none()
    if row:
        row.value = value
    else:
        session.add(AppSetting(key=_KEY, value=value))
    await session.commit()
    return json.loads(value)
