import json
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.app_setting import AppSetting
from app.models.user import User, UserRole
from app.api.deps import require_role

router = APIRouter(prefix="/api/production/settings", tags=["production-settings"])

_KEYS = {
    "good_count_tag": "production.good_count_tag",
    "reject_fault_tags": "production.reject_fault_tags",
    "downtime_alarm_tags": "production.downtime_alarm_tags",
    "shift_mode": "production.shift_mode",
    "shifts": "production.shifts",
}

_TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


class ShiftDefinition(BaseModel):
    name: str
    start_time: str
    end_time: str
    target_count: int | None = None

    @field_validator("start_time", "end_time")
    @classmethod
    def validate_time(cls, v: str) -> str:
        if not _TIME_RE.match(v):
            raise ValueError(f"Invalid time format '{v}', expected HH:MM (24-hour)")
        return v


class ProductionSettingsBody(BaseModel):
    good_count_tag: str | None = None
    reject_fault_tags: list[str] = []
    downtime_alarm_tags: list[str] = []
    shift_mode: str = "manual"
    shifts: list[ShiftDefinition] = []

    @field_validator("shift_mode")
    @classmethod
    def validate_shift_mode(cls, v: str) -> str:
        if v not in ("manual", "automatic"):
            raise ValueError("shift_mode must be 'manual' or 'automatic'")
        return v


async def _get_setting(session: AsyncSession, key: str) -> str | None:
    result = await session.execute(select(AppSetting).where(AppSetting.key == key))
    row = result.scalar_one_or_none()
    return row.value if row else None


async def _set_setting(session: AsyncSession, key: str, value: str | None) -> None:
    result = await session.execute(select(AppSetting).where(AppSetting.key == key))
    row = result.scalar_one_or_none()
    if row:
        row.value = value
    else:
        session.add(AppSetting(key=key, value=value))


async def load_production_settings(session: AsyncSession) -> dict:
    good_count_tag = await _get_setting(session, _KEYS["good_count_tag"])
    reject_raw = await _get_setting(session, _KEYS["reject_fault_tags"])
    downtime_raw = await _get_setting(session, _KEYS["downtime_alarm_tags"])
    shift_mode = await _get_setting(session, _KEYS["shift_mode"])
    shifts_raw = await _get_setting(session, _KEYS["shifts"])
    return {
        "good_count_tag": good_count_tag,
        "reject_fault_tags": json.loads(reject_raw) if reject_raw else [],
        "downtime_alarm_tags": json.loads(downtime_raw) if downtime_raw else [],
        "shift_mode": shift_mode or "manual",
        "shifts": json.loads(shifts_raw) if shifts_raw else [],
    }


@router.get("/")
async def get_production_settings(session: AsyncSession = Depends(get_db)):
    return await load_production_settings(session)


@router.put("/")
async def update_production_settings(
    body: ProductionSettingsBody,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    # Validate shift config
    if body.shift_mode == "automatic" and len(body.shifts) == 0:
        raise HTTPException(
            status_code=422,
            detail="At least one shift must be defined when using automatic mode",
        )
    names = [s.name for s in body.shifts]
    if len(names) != len(set(names)):
        raise HTTPException(status_code=422, detail="Shift names must be unique")

    await _set_setting(session, _KEYS["good_count_tag"], body.good_count_tag)
    await _set_setting(session, _KEYS["reject_fault_tags"], json.dumps(body.reject_fault_tags))
    await _set_setting(session, _KEYS["downtime_alarm_tags"], json.dumps(body.downtime_alarm_tags))
    await _set_setting(session, _KEYS["shift_mode"], body.shift_mode)
    await _set_setting(
        session, _KEYS["shifts"],
        json.dumps([s.model_dump() for s in body.shifts]) if body.shifts else None,
    )
    await session.commit()

    # Notify production service if running
    from app.services.production_service import production_service
    if production_service:
        async with session.begin():
            await production_service.reload_settings(session)

    return await load_production_settings(session)
