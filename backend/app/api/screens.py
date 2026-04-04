"""
CRUD (Create, Read, Update, Delete) endpoints for HMI screens.
Screens contain widget layouts stored as JSON. Only users with the
"designer" role can create, edit, or delete screens.
"""

import json

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_role
from app.core.database import get_db
from app.models.audit import AuditAction
from app.models.screen import Screen, ScreenTemplate, ScreenVersion
from app.models.user import User, UserRole
from app.services.audit_service import log_audit

router = APIRouter(prefix="/api/screens", tags=["screens"])


# --- Pydantic models for request validation and response serialization ---
# ScreenCreate defines the JSON shape accepted when creating/updating a screen.
# FastAPI validates incoming requests against this model automatically.
class ScreenCreate(BaseModel):
    name: str
    slug: str
    layout: list = []
    layout_mode: str = "grid"
    target_resolution: str | None = None
    is_default: bool = False
    sort_order: int = 0


# ScreenOut defines the JSON shape sent back in responses.
# from_attributes=True tells Pydantic to read data directly from SQLAlchemy
# model attributes (e.g., screen.name) instead of requiring a dict.
class ScreenOut(BaseModel):
    id: int
    name: str
    slug: str
    layout: str
    layout_mode: str
    target_resolution: str | None
    version: int
    is_default: bool
    sort_order: int

    model_config = {"from_attributes": True}


@router.get("/", response_model=list[ScreenOut])
async def list_screens(
    session: AsyncSession = Depends(get_db),
    _user: User | None = Depends(get_current_user),
):
    result = await session.execute(select(Screen).order_by(Screen.sort_order, Screen.name))
    return result.scalars().all()


class ScreenOrderItem(BaseModel):
    id: int
    sort_order: int


@router.put("/reorder")
async def reorder_screens(
    items: list[ScreenOrderItem],
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.DESIGNER)),
):
    for item in items:
        screen = await session.get(Screen, item.id)
        if screen:
            screen.sort_order = item.sort_order
    await session.flush()
    result = await session.execute(select(Screen).order_by(Screen.sort_order, Screen.name))
    return result.scalars().all()


@router.get("/{screen_id}")
async def get_screen(screen_id: int, session: AsyncSession = Depends(get_db)):
    screen = await session.get(Screen, screen_id)
    if not screen:
        raise HTTPException(status_code=404, detail="Screen not found")
    return screen


@router.get("/by-slug/{slug}")
async def get_screen_by_slug(slug: str, session: AsyncSession = Depends(get_db)):
    result = await session.execute(select(Screen).where(Screen.slug == slug))
    screen = result.scalar_one_or_none()
    if not screen:
        raise HTTPException(status_code=404, detail="Screen not found")
    return screen


# Only designers can create screens — enforced by require_role(UserRole.DESIGNER)
@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_screen(
    body: ScreenCreate,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.DESIGNER)),
):
    existing = await session.execute(select(Screen).where(Screen.slug == body.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A screen with slug '{body.slug}' already exists. Choose a different name.",
        )
    screen = Screen(
        name=body.name,
        slug=body.slug,
        layout=json.dumps(body.layout),
        layout_mode=body.layout_mode,
        target_resolution=body.target_resolution,
        is_default=body.is_default,
        sort_order=body.sort_order,
    )
    session.add(screen)
    await session.flush()
    # Record who created what and when, for compliance and troubleshooting
    await log_audit(
        session, AuditAction.SCREEN_SAVE, user=current_user.username,
        details=f"Created screen '{body.name}'",
    )
    return screen


@router.put("/{screen_id}")
async def update_screen(
    screen_id: int,
    body: ScreenCreate,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.DESIGNER)),
):
    screen = await session.get(Screen, screen_id)
    if not screen:
        raise HTTPException(status_code=404, detail="Screen not found")

    # Save the current version before updating, so we can roll back if needed.
    # This creates a version history entry — like a simple "undo" at the database level.
    version = ScreenVersion(
        screen_id=screen.id,
        version=screen.version,
        layout=screen.layout,
        saved_by=current_user.username,
    )
    session.add(version)

    screen.name = body.name
    screen.slug = body.slug
    screen.layout = json.dumps(body.layout)
    screen.layout_mode = body.layout_mode
    screen.target_resolution = body.target_resolution
    screen.is_default = body.is_default
    screen.sort_order = body.sort_order
    screen.version += 1
    await session.flush()
    # Audit log records who changed what and when, for compliance and troubleshooting
    await log_audit(
        session, AuditAction.SCREEN_SAVE, user=current_user.username,
        details=f"Updated screen '{body.name}' to v{screen.version}",
    )
    return screen


@router.delete("/{screen_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_screen(
    screen_id: int,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.DESIGNER)),
):
    screen = await session.get(Screen, screen_id)
    if not screen:
        raise HTTPException(status_code=404, detail="Screen not found")
    await log_audit(
        session, AuditAction.SCREEN_DELETE, user=current_user.username,
        details=f"Deleted screen '{screen.name}'",
    )
    await session.delete(screen)


@router.get("/{screen_id}/versions")
async def get_screen_versions(screen_id: int, session: AsyncSession = Depends(get_db)):
    result = await session.execute(
        select(ScreenVersion)
        .where(ScreenVersion.screen_id == screen_id)
        .order_by(ScreenVersion.version.desc())
    )
    return result.scalars().all()


# --- Screen Templates ---
# Reusable screen layouts with placeholder bindings that can be instantiated
# for different equipment (e.g., one "Motor Control" template used for many motors).
class TemplateCreate(BaseModel):
    name: str
    description: str | None = None
    layout: list = []
    placeholders: list = []


@router.get("/templates/list")
async def list_templates(session: AsyncSession = Depends(get_db)):
    result = await session.execute(select(ScreenTemplate).order_by(ScreenTemplate.name))
    return result.scalars().all()


@router.post("/templates", status_code=status.HTTP_201_CREATED)
async def create_template(
    body: TemplateCreate,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.DESIGNER)),
):
    template = ScreenTemplate(
        name=body.name,
        description=body.description,
        layout=json.dumps(body.layout),
        placeholders=json.dumps(body.placeholders),
    )
    session.add(template)
    await session.flush()
    return template


class TemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    layout: list | None = None
    placeholders: list | None = None


@router.get("/templates/{template_id}")
async def get_template(template_id: int, session: AsyncSession = Depends(get_db)):
    result = await session.execute(
        select(ScreenTemplate).where(ScreenTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@router.put("/templates/{template_id}")
async def update_template(
    template_id: int,
    body: TemplateUpdate,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.DESIGNER)),
):
    result = await session.execute(
        select(ScreenTemplate).where(ScreenTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    if body.name is not None:
        template.name = body.name
    if body.description is not None:
        template.description = body.description
    if body.layout is not None:
        template.layout = json.dumps(body.layout)
    if body.placeholders is not None:
        template.placeholders = json.dumps(body.placeholders)
    await session.flush()
    return template


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: int,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.DESIGNER)),
):
    result = await session.execute(
        select(ScreenTemplate).where(ScreenTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    await session.delete(template)
    await session.flush()
