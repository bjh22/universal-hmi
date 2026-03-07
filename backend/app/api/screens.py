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


class ScreenCreate(BaseModel):
    name: str
    slug: str
    layout: list = []
    layout_mode: str = "absolute"
    target_resolution: str | None = '{"width": 1920, "height": 1080}'
    is_default: bool = False
    sort_order: int = 0


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
async def list_screens(session: AsyncSession = Depends(get_db)):
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


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_screen(
    body: ScreenCreate,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.DESIGNER)),
):
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

    # Save version before updating
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


# Screen Templates
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
