"""Application Preferences API — default screen layout and other app-wide settings."""

from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_role
from app.core.database import get_db
from app.models.app_setting import AppSetting
from app.models.user import UserRole

router = APIRouter(prefix="/api/preferences", tags=["preferences"])

DEFAULT_SCREEN_LAYOUT = "grid"
DEFAULT_SCREEN_RESOLUTION = "1920x1080"


class PreferencesResponse(BaseModel):
    default_screen_layout: str
    default_screen_resolution: str


class PreferencesUpdate(BaseModel):
    default_screen_layout: Optional[str] = None
    default_screen_resolution: Optional[str] = None


async def _get_setting(session: AsyncSession, key: str) -> str | None:
    result = await session.execute(select(AppSetting).where(AppSetting.key == key))
    row = result.scalar_one_or_none()
    return row.value if row else None


async def _set_setting(session: AsyncSession, key: str, value: str | None):
    result = await session.execute(select(AppSetting).where(AppSetting.key == key))
    row = result.scalar_one_or_none()
    if row:
        row.value = value
    else:
        session.add(AppSetting(key=key, value=value))


@router.get("/", response_model=PreferencesResponse)
async def get_preferences(session: AsyncSession = Depends(get_db)):
    """Get application preferences. No auth required."""
    layout = await _get_setting(session, "default_screen_layout")
    resolution = await _get_setting(session, "default_screen_resolution")
    return PreferencesResponse(
        default_screen_layout=layout or DEFAULT_SCREEN_LAYOUT,
        default_screen_resolution=resolution or DEFAULT_SCREEN_RESOLUTION,
    )


@router.put("/", response_model=PreferencesResponse)
async def update_preferences(
    body: PreferencesUpdate,
    session: AsyncSession = Depends(get_db),
    _user=Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    """Update application preferences. Requires engineer or designer role."""
    if body.default_screen_layout is not None:
        if body.default_screen_layout in ("grid", "absolute"):
            await _set_setting(session, "default_screen_layout", body.default_screen_layout)
    if body.default_screen_resolution is not None:
        await _set_setting(session, "default_screen_resolution", body.default_screen_resolution)

    layout = await _get_setting(session, "default_screen_layout")
    resolution = await _get_setting(session, "default_screen_resolution")
    return PreferencesResponse(
        default_screen_layout=layout or DEFAULT_SCREEN_LAYOUT,
        default_screen_resolution=resolution or DEFAULT_SCREEN_RESOLUTION,
    )
