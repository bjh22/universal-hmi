"""Branding API — site title and favicon configuration."""

import base64
from typing import Optional

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_role
from app.core.database import get_db
from app.models.app_setting import AppSetting
from app.models.user import UserRole

router = APIRouter(prefix="/api/branding", tags=["branding"])

DEFAULT_SITE_TITLE = "Industrial HMI"
DEFAULT_NAV_TITLE = "HMI"


class BrandingResponse(BaseModel):
    site_title: str
    nav_title: str
    has_favicon: bool


class BrandingUpdate(BaseModel):
    site_title: Optional[str] = None
    nav_title: Optional[str] = None
    favicon: Optional[str] = None  # base64 data URI, or empty string to clear


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


@router.get("/", response_model=BrandingResponse)
async def get_branding(session: AsyncSession = Depends(get_db)):
    """Get current branding settings. No auth required (needed before login)."""
    title = await _get_setting(session, "site_title")
    nav_title = await _get_setting(session, "nav_title")
    favicon = await _get_setting(session, "favicon")
    return BrandingResponse(
        site_title=title or DEFAULT_SITE_TITLE,
        nav_title=nav_title or DEFAULT_NAV_TITLE,
        has_favicon=bool(favicon),
    )


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

    title = await _get_setting(session, "site_title")
    nav_title = await _get_setting(session, "nav_title")
    favicon = await _get_setting(session, "favicon")
    return BrandingResponse(
        site_title=title or DEFAULT_SITE_TITLE,
        nav_title=nav_title or DEFAULT_NAV_TITLE,
        has_favicon=bool(favicon),
    )


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
