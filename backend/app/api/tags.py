import json

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_role
from app.core.database import get_db
from app.models.tag import Tag, TagAccessMode, TagDataType, TagTemplate
from app.models.user import User, UserRole
from app.services.tag_engine import tag_engine

router = APIRouter(prefix="/api/tags", tags=["tags"])


class TagCreate(BaseModel):
    name: str
    description: str | None = None
    group_name: str | None = None
    data_source_id: int | None = None
    address: str | None = None
    data_type: TagDataType = TagDataType.FLOAT
    access_mode: TagAccessMode = TagAccessMode.READ
    engineering_units: str | None = None
    display_format: str | None = None
    min_value: float | None = None
    max_value: float | None = None
    deadband: float | None = None
    trending_enabled: bool = False
    trending_sample_rate_ms: int | None = None
    alarm_enabled: bool = False
    alarm_config: str | None = None
    simulation_enabled: bool = False
    simulation_behavior: str | None = None
    simulation_config: str | None = None
    enum_mapping: str | None = None


class TagOut(BaseModel):
    id: int
    name: str
    description: str | None
    group_name: str | None
    data_source_id: int | None
    address: str | None
    data_type: TagDataType
    access_mode: TagAccessMode
    engineering_units: str | None
    display_format: str | None
    min_value: float | None
    max_value: float | None
    trending_enabled: bool
    alarm_enabled: bool
    simulation_enabled: bool

    model_config = {"from_attributes": True}


class TagValueOut(BaseModel):
    tag_id: int
    name: str
    value: object
    quality: str
    timestamp: str


@router.get("/", response_model=list[TagOut])
async def list_tags(
    group: str | None = None,
    session: AsyncSession = Depends(get_db),
):
    query = select(Tag).order_by(Tag.group_name, Tag.name)
    if group:
        query = query.where(Tag.group_name == group)
    result = await session.execute(query)
    return result.scalars().all()


@router.post("/", response_model=TagOut, status_code=status.HTTP_201_CREATED)
async def create_tag(
    body: TagCreate,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    tag = Tag(**body.model_dump())
    session.add(tag)
    await session.flush()
    return tag


@router.put("/{tag_id}", response_model=TagOut)
async def update_tag(
    tag_id: int,
    body: TagCreate,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    tag = await session.get(Tag, tag_id)
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    for key, val in body.model_dump().items():
        setattr(tag, key, val)
    await session.flush()
    return tag


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tag(
    tag_id: int,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    tag = await session.get(Tag, tag_id)
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    await session.delete(tag)


@router.get("/values")
async def get_all_tag_values():
    return tag_engine.get_all_values()


@router.get("/values/{tag_name}")
async def get_tag_value(tag_name: str):
    tv = tag_engine.get_value(tag_name)
    if tv is None:
        raise HTTPException(status_code=404, detail="Tag not found")
    return tv.to_dict()


@router.post("/values/{tag_name}/write")
async def write_tag_value(tag_name: str, body: dict):
    value = body.get("value")
    if value is None:
        raise HTTPException(status_code=400, detail="Missing 'value' in body")
    success = tag_engine.set_value(tag_name, value)
    if not success:
        raise HTTPException(status_code=404, detail="Tag not found")
    return {"success": True}


@router.post("/import/csv")
async def import_tags_csv(
    body: dict,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    """Import tags from CSV data. Body: {"tags": [...tag dicts...]}"""
    tags_data = body.get("tags", [])
    created = []
    for td in tags_data:
        tag = Tag(
            name=td["name"],
            description=td.get("description"),
            group_name=td.get("group_name"),
            data_type=TagDataType(td.get("data_type", "float")),
            address=td.get("address"),
            data_source_id=td.get("data_source_id"),
            access_mode=TagAccessMode(td.get("access_mode", "read")),
            engineering_units=td.get("engineering_units"),
        )
        session.add(tag)
        created.append(td["name"])
    await session.flush()
    return {"imported": len(created), "names": created}


# Tag Templates
class TemplateCreate(BaseModel):
    name: str
    description: str | None = None
    fields: str = "[]"


class TemplateOut(BaseModel):
    id: int
    name: str
    description: str | None
    fields: str

    model_config = {"from_attributes": True}


@router.get("/templates", response_model=list[TemplateOut])
async def list_templates(session: AsyncSession = Depends(get_db)):
    result = await session.execute(select(TagTemplate).order_by(TagTemplate.name))
    return result.scalars().all()


@router.post("/templates", response_model=TemplateOut, status_code=status.HTTP_201_CREATED)
async def create_template(
    body: TemplateCreate,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    template = TagTemplate(**body.model_dump())
    session.add(template)
    await session.flush()
    return template
