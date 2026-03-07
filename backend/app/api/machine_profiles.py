import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_role
from app.core.database import get_db
from app.models.machine_profile import MachineProfile
from app.models.project import Project
from app.models.user import User, UserRole

router = APIRouter(prefix="/api/projects/{project_id}/profiles", tags=["machine-profiles"])


# ─── Pydantic schemas ───


class MachineProfileCreate(BaseModel):
    name: str
    description: str | None = None


class MachineProfileUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    data_source_overrides: dict | None = None
    tag_overrides: dict | None = None


class MachineProfileOut(BaseModel):
    id: int
    project_id: int
    name: str
    description: str | None
    data_source_overrides: dict
    tag_overrides: dict
    created_at: datetime
    updated_at: datetime

    @field_validator("data_source_overrides", "tag_overrides", mode="before")
    @classmethod
    def parse_json(cls, v):
        if isinstance(v, str):
            return json.loads(v)
        return v

    model_config = {"from_attributes": True}


class MachineProfileClone(BaseModel):
    name: str


# ─── Helpers ───


async def _get_project(project_id: int, session: AsyncSession) -> Project:
    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


async def _get_profile(
    project_id: int, profile_id: int, session: AsyncSession
) -> MachineProfile:
    profile = await session.get(MachineProfile, profile_id)
    if not profile or profile.project_id != project_id:
        raise HTTPException(status_code=404, detail="Machine profile not found")
    return profile


# ─── Endpoints ───


@router.get("/", response_model=list[MachineProfileOut])
async def list_profiles(
    project_id: int,
    session: AsyncSession = Depends(get_db),
):
    await _get_project(project_id, session)
    result = await session.execute(
        select(MachineProfile)
        .where(MachineProfile.project_id == project_id)
        .order_by(MachineProfile.name)
    )
    return result.scalars().all()


@router.post("/", response_model=MachineProfileOut, status_code=status.HTTP_201_CREATED)
async def create_profile(
    project_id: int,
    body: MachineProfileCreate,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    await _get_project(project_id, session)
    existing = await session.execute(
        select(MachineProfile).where(
            MachineProfile.project_id == project_id,
            MachineProfile.name == body.name,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=409, detail="A profile with this name already exists in the project"
        )
    profile = MachineProfile(
        project_id=project_id,
        name=body.name,
        description=body.description,
    )
    session.add(profile)
    await session.flush()
    return profile


@router.get("/{profile_id}", response_model=MachineProfileOut)
async def get_profile(
    project_id: int,
    profile_id: int,
    session: AsyncSession = Depends(get_db),
):
    return await _get_profile(project_id, profile_id, session)


@router.put("/{profile_id}", response_model=MachineProfileOut)
async def update_profile(
    project_id: int,
    profile_id: int,
    body: MachineProfileUpdate,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    profile = await _get_profile(project_id, profile_id, session)
    updates = body.model_dump(exclude_unset=True)

    # Check name uniqueness if changing
    if "name" in updates and updates["name"] != profile.name:
        existing = await session.execute(
            select(MachineProfile).where(
                MachineProfile.project_id == project_id,
                MachineProfile.name == updates["name"],
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=409, detail="A profile with this name already exists in the project"
            )

    for key, val in updates.items():
        if key in ("data_source_overrides", "tag_overrides"):
            setattr(profile, key, json.dumps(val))
        else:
            setattr(profile, key, val)

    await session.flush()
    await session.refresh(profile)
    return profile


@router.delete("/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_profile(
    project_id: int,
    profile_id: int,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    profile = await _get_profile(project_id, profile_id, session)
    await session.delete(profile)


@router.post("/{profile_id}/clone", response_model=MachineProfileOut, status_code=status.HTTP_201_CREATED)
async def clone_profile(
    project_id: int,
    profile_id: int,
    body: MachineProfileClone,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    source = await _get_profile(project_id, profile_id, session)

    existing = await session.execute(
        select(MachineProfile).where(
            MachineProfile.project_id == project_id,
            MachineProfile.name == body.name,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=409, detail="A profile with this name already exists in the project"
        )

    clone = MachineProfile(
        project_id=project_id,
        name=body.name,
        description=source.description,
        data_source_overrides=source.data_source_overrides,
        tag_overrides=source.tag_overrides,
    )
    session.add(clone)
    await session.flush()
    return clone
