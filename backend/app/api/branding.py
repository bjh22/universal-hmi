"""Branding API — site title, favicon, and theme configuration."""

import base64
import re
from typing import Optional

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_role
from app.core.database import get_db
from app.models.app_setting import AppSetting
from app.models.user import UserRole

router = APIRouter(prefix="/api/branding", tags=["branding"])

DEFAULT_SITE_TITLE = "Industrial HMI"
DEFAULT_NAV_TITLE = "HMI"
DEFAULT_THEME_ACCENT = "#2563eb"
DEFAULT_THEME_PRESET = "slate"
VALID_PRESETS = {"slate", "zinc", "neutral", "midnight", "charcoal"}


class BrandingResponse(BaseModel):
    site_title: str
    nav_title: str
    has_favicon: bool
    theme_accent: str
    theme_preset: str


class BrandingUpdate(BaseModel):
    site_title: Optional[str] = None
    nav_title: Optional[str] = None
    favicon: Optional[str] = None  # base64 data URI, or empty string to clear
    theme_accent: Optional[str] = None
    theme_preset: Optional[str] = None

    @field_validator("theme_accent")
    @classmethod
    def validate_accent(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not re.match(r"^#[0-9a-fA-F]{6}$", v):
            raise ValueError("theme_accent must be a hex color like #2563eb")
        return v

    @field_validator("theme_preset")
    @classmethod
    def validate_preset(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_PRESETS:
            raise ValueError(f"theme_preset must be one of {sorted(VALID_PRESETS)}")
        return v


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


async def _read_branding(session: AsyncSession) -> BrandingResponse:
    title = await _get_setting(session, "site_title")
    nav_title = await _get_setting(session, "nav_title")
    favicon = await _get_setting(session, "favicon")
    accent = await _get_setting(session, "theme_accent")
    preset = await _get_setting(session, "theme_preset")
    return BrandingResponse(
        site_title=title or DEFAULT_SITE_TITLE,
        nav_title=nav_title or DEFAULT_NAV_TITLE,
        has_favicon=bool(favicon),
        theme_accent=accent or DEFAULT_THEME_ACCENT,
        theme_preset=preset if preset in VALID_PRESETS else DEFAULT_THEME_PRESET,
    )


@router.get("/", response_model=BrandingResponse)
async def get_branding(session: AsyncSession = Depends(get_db)):
    """Get current branding settings. No auth required (needed before login)."""
    return await _read_branding(session)


@router.put("/", response_model=BrandingResponse)
async def update_branding(
    body: BrandingUpdate,
    session: AsyncSession = Depends(get_db),
    _user=Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    """Update branding settings. Requires engineer or designer role."""
    if body.site_title is not None:
        await _set_setting(session, "site_title", body.site_title or None)
    if body.nav_title is not None:
        await _set_setting(session, "nav_title", body.nav_title or None)
    if body.favicon is not None:
        await _set_setting(session, "favicon", body.favicon or None)
    if body.theme_accent is not None:
        await _set_setting(session, "theme_accent", body.theme_accent)
    if body.theme_preset is not None:
        await _set_setting(session, "theme_preset", body.theme_preset)

    return await _read_branding(session)


@router.get("/favicon")
async def get_favicon(session: AsyncSession = Depends(get_db)):
    """Serve the custom favicon image. Returns 404 if none set."""
    data_uri = await _get_setting(session, "favicon")
    if not data_uri:
        return Response(status_code=404)

    # Parse data URI: "data:<mime>;base64,<data>"
    try:
        header, encoded = data_uri.split(",", 1)
        mime = header.split(":")[1].split(";")[0]
        image_bytes = base64.b64decode(encoded)
    except Exception:
        return Response(status_code=404)

    return Response(content=image_bytes, media_type=mime)
