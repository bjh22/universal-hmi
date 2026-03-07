"""
API routes for managing integrations (CRUD, enable/disable).
"""

import json

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_role
from app.core.database import get_db
from app.models.integration import Integration, IntegrationStatus
from app.models.user import User, UserRole

router = APIRouter(prefix="/api/integrations", tags=["integrations"])


class IntegrationCreate(BaseModel):
    type_name: str
    name: str
    enabled: bool = False
    config: dict = {}


class IntegrationUpdate(BaseModel):
    name: str
    enabled: bool = False
    config: dict = {}


class IntegrationOut(BaseModel):
    id: int
    type_name: str
    name: str
    enabled: bool
    config: dict = {}
    status: str
    status_message: str | None = None

    @field_validator("config", mode="before")
    @classmethod
    def parse_config(cls, v):
        if isinstance(v, str):
            return json.loads(v)
        return v

    model_config = {"from_attributes": True}


@router.get("/types")
async def list_integration_types(request: Request):
    """List all discovered integration types."""
    manager = request.app.state.integration_manager
    return manager.get_available_types()


@router.get("/", response_model=list[IntegrationOut])
async def list_integrations(
    request: Request,
    session: AsyncSession = Depends(get_db),
):
    result = await session.execute(select(Integration).order_by(Integration.name))
    integrations = list(result.scalars().all())
    manager = request.app.state.integration_manager
    for integ in integrations:
        runtime = manager.get_status(integ.id)
        integ.status = runtime["status"]
        integ.status_message = runtime.get("status_message")
    return integrations


@router.post("/", response_model=IntegrationOut, status_code=status.HTTP_201_CREATED)
async def create_integration(
    body: IntegrationCreate,
    request: Request,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    manager = request.app.state.integration_manager
    available = [t["type_name"] for t in manager.get_available_types()]
    if body.type_name not in available:
        raise HTTPException(400, f"Unknown integration type: {body.type_name}")

    integ = Integration(
        type_name=body.type_name,
        name=body.name,
        enabled=body.enabled,
        config=json.dumps(body.config),
    )
    session.add(integ)
    await session.flush()

    if body.enabled:
        await manager.enable_integration(integ, request.app, session)

    return integ


@router.put("/{int_id}", response_model=IntegrationOut)
async def update_integration(
    int_id: int,
    body: IntegrationUpdate,
    request: Request,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    integ = await session.get(Integration, int_id)
    if not integ:
        raise HTTPException(404, "Integration not found")

    manager = request.app.state.integration_manager
    was_enabled = integ.enabled

    integ.name = body.name
    integ.config = json.dumps(body.config)
    integ.enabled = body.enabled

    # Handle enable/disable transitions
    if was_enabled and not body.enabled:
        await manager.disable_integration(int_id)
        integ.status = IntegrationStatus.STOPPED.value
    elif body.enabled:
        await manager.disable_integration(int_id)
        await manager.enable_integration(integ, request.app, session)

    await session.flush()
    # Refresh runtime status
    runtime = manager.get_status(int_id)
    integ.status = runtime["status"]
    integ.status_message = runtime.get("status_message")
    return integ


@router.delete("/{int_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_integration(
    int_id: int,
    request: Request,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    integ = await session.get(Integration, int_id)
    if not integ:
        raise HTTPException(404, "Integration not found")
    manager = request.app.state.integration_manager
    await manager.disable_integration(int_id)
    await session.delete(integ)
