import json
import time

from fastapi import APIRouter, Depends
from pydantic import BaseModel
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
    "cycling_tag": "production.cycling_tag",
    "downtime_exception_tags": "production.downtime_exception_tags",
    "target_rate": "production.target_rate",
    "machine_status_tag": "production.machine_status_tag",
    "cycle_start_tag": "production.cycle_start_tag",
    "reset_tag": "production.reset_tag",
    "alarm_marquee_speed": "production.alarm_marquee_speed",
}


class ProductionSettingsBody(BaseModel):
    good_count_tag: str | None = None
    reject_fault_tags: list[str] = []
    cycling_tag: str | None = None
    downtime_exception_tags: list[str] = []
    target_rate: float | None = None
    machine_status_tag: str | None = None
    cycle_start_tag: str | None = None
    reset_tag: str | None = None
    alarm_marquee_speed: int | None = None


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


# In-memory cache to avoid 6 SELECTs per reporting endpoint call.
# Invalidated on settings update; TTL prevents stale data if updated externally.
_settings_cache: dict | None = None
_settings_cache_time: float = 0.0
_SETTINGS_CACHE_TTL = 30.0  # seconds


async def load_production_settings(session: AsyncSession) -> dict:
    global _settings_cache, _settings_cache_time
    if _settings_cache is not None and (time.monotonic() - _settings_cache_time) < _SETTINGS_CACHE_TTL:
        return dict(_settings_cache)

    good_count_tag = await _get_setting(session, _KEYS["good_count_tag"])
    reject_raw = await _get_setting(session, _KEYS["reject_fault_tags"])
    cycling_tag = await _get_setting(session, _KEYS["cycling_tag"])
    exception_raw = await _get_setting(session, _KEYS["downtime_exception_tags"])
    target_rate_raw = await _get_setting(session, _KEYS["target_rate"])
    machine_status_tag = await _get_setting(session, _KEYS["machine_status_tag"])
    cycle_start_tag = await _get_setting(session, _KEYS["cycle_start_tag"])
    reset_tag = await _get_setting(session, _KEYS["reset_tag"])
    alarm_marquee_speed_raw = await _get_setting(session, _KEYS["alarm_marquee_speed"])
    result = {
        "good_count_tag": good_count_tag,
        "reject_fault_tags": json.loads(reject_raw) if reject_raw else [],
        "cycling_tag": cycling_tag,
        "downtime_exception_tags": json.loads(exception_raw) if exception_raw else [],
        "target_rate": float(target_rate_raw) if target_rate_raw else None,
        "machine_status_tag": machine_status_tag,
        "cycle_start_tag": cycle_start_tag,
        "reset_tag": reset_tag,
        "alarm_marquee_speed": int(alarm_marquee_speed_raw) if alarm_marquee_speed_raw else None,
    }
    _settings_cache = result
    _settings_cache_time = time.monotonic()
    return dict(result)


def invalidate_production_settings_cache():
    global _settings_cache, _settings_cache_time
    _settings_cache = None
    _settings_cache_time = 0.0


@router.get("/")
async def get_production_settings(session: AsyncSession = Depends(get_db)):
    return await load_production_settings(session)


@router.put("/")
async def update_production_settings(
    body: ProductionSettingsBody,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    await _set_setting(session, _KEYS["good_count_tag"], body.good_count_tag)
    await _set_setting(session, _KEYS["reject_fault_tags"], json.dumps(body.reject_fault_tags))
    await _set_setting(session, _KEYS["cycling_tag"], body.cycling_tag)
    await _set_setting(session, _KEYS["downtime_exception_tags"], json.dumps(body.downtime_exception_tags))
    await _set_setting(session, _KEYS["target_rate"], str(body.target_rate) if body.target_rate is not None else None)
    await _set_setting(session, _KEYS["machine_status_tag"], body.machine_status_tag)
    await _set_setting(session, _KEYS["cycle_start_tag"], body.cycle_start_tag)
    await _set_setting(session, _KEYS["reset_tag"], body.reset_tag)
    await _set_setting(session, _KEYS["alarm_marquee_speed"], str(body.alarm_marquee_speed) if body.alarm_marquee_speed is not None else None)
    await session.commit()
    invalidate_production_settings_cache()
    return await load_production_settings(session)
