import json

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_role
from app.core.database import get_db
from app.drivers.driver_manager import driver_manager
from app.models.datasource import DataSource, ProtocolType
from app.models.user import User, UserRole

router = APIRouter(prefix="/api/datasources", tags=["datasources"])


class DataSourceCreate(BaseModel):
    name: str
    protocol: ProtocolType
    enabled: bool = True
    config: dict = {}


class DataSourceOut(BaseModel):
    id: int
    name: str
    protocol: ProtocolType
    enabled: bool
    connected: bool
    config: dict = {}

    @field_validator("config", mode="before")
    @classmethod
    def parse_config(cls, v):
        if isinstance(v, str):
            return json.loads(v)
        return v

    model_config = {"from_attributes": True}


@router.get("/", response_model=list[DataSourceOut])
async def list_datasources(
    project_id: int | None = None,
    session: AsyncSession = Depends(get_db),
):
    query = select(DataSource).order_by(DataSource.name)
    if project_id is not None:
        query = query.where(DataSource.project_id == project_id)
    result = await session.execute(query)
    sources = result.scalars().all()
    # Update connected status from driver manager
    for ds in sources:
        driver = driver_manager.get_driver(ds.id)
        if driver:
            ds.connected = driver.connected
    return sources


@router.post("/", response_model=DataSourceOut, status_code=status.HTTP_201_CREATED)
async def create_datasource(
    body: DataSourceCreate,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    ds = DataSource(
        name=body.name,
        protocol=body.protocol,
        enabled=body.enabled,
        config=json.dumps(body.config),
    )
    session.add(ds)
    await session.flush()
    return ds


@router.put("/{ds_id}", response_model=DataSourceOut)
async def update_datasource(
    ds_id: int,
    body: DataSourceCreate,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    ds = await session.get(DataSource, ds_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Data source not found")
    ds.name = body.name
    ds.protocol = body.protocol
    ds.enabled = body.enabled
    ds.config = json.dumps(body.config)
    await session.flush()
    return ds


@router.delete("/{ds_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_datasource(
    ds_id: int,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    ds = await session.get(DataSource, ds_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Data source not found")
    await session.delete(ds)


@router.post("/{ds_id}/connect")
async def connect_datasource(
    ds_id: int,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    ds = await session.get(DataSource, ds_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Data source not found")
    await driver_manager.connect_source(ds)
    driver = driver_manager.get_driver(ds_id)
    connected = driver.connected if driver else False
    address_prefix = None

    # Auto-detect OPC UA address prefix after successful connection
    if connected and driver and hasattr(driver, "detect_address_prefix"):
        address_prefix = await driver.detect_address_prefix()
        if address_prefix:
            config = json.loads(ds.config) if isinstance(ds.config, str) else ds.config
            config["address_prefix"] = address_prefix
            ds.config = json.dumps(config)
            await session.flush()

    return {"connected": connected, "address_prefix": address_prefix}


@router.post("/{ds_id}/browse")
async def browse_datasource(
    ds_id: int,
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    driver = driver_manager.get_driver(ds_id)
    if not driver or not driver.connected:
        raise HTTPException(status_code=400, detail="Data source not connected")
    tags = await driver.browse()
    return {"tags": tags, "address_prefix": driver.address_prefix}


class BrowseLevelRequest(BaseModel):
    parent_node_id: str | None = None


@router.post("/{ds_id}/browse-level")
async def browse_datasource_level(
    ds_id: int,
    body: BrowseLevelRequest | None = None,
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    """Browse a single level of the tag tree (lazy/incremental browsing).

    Much faster than full browse for large OPC UA servers since it only
    fetches one level at a time. Results are cached for 30 seconds.
    """
    driver = driver_manager.get_driver(ds_id)
    if not driver or not driver.connected:
        raise HTTPException(status_code=400, detail="Data source not connected")
    parent = body.parent_node_id if body else None
    nodes = await driver.browse_level(parent)
    return {"nodes": nodes, "address_prefix": driver.address_prefix}


@router.post("/{ds_id}/browse-cache-clear")
async def clear_browse_cache(
    ds_id: int,
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    """Clear cached browse results for a datasource."""
    driver = driver_manager.get_driver(ds_id)
    if not driver:
        raise HTTPException(status_code=400, detail="Data source not found")
    driver.clear_browse_cache()
    return {"status": "ok"}
