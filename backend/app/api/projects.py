import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_role
from app.core.database import get_db
from app.models.datasource import DataSource
from app.models.job import Job
from app.models.machine_profile import MachineProfile
from app.models.project import Project
from app.models.screen import Screen, ScreenTemplate
from app.models.tag import Tag, TagLabel, TagTemplate, tag_label_assignments
from app.models.user import User, UserRole

router = APIRouter(prefix="/api/projects", tags=["projects"])

EXPORT_FORMAT_VERSION = "1.0"


# ─── Pydantic schemas ───


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None
    version: str = "1.0.0"


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    version: str | None = None


class ProjectOut(BaseModel):
    id: int
    name: str
    description: str | None
    version: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectDetail(ProjectOut):
    tag_count: int = 0
    screen_count: int = 0
    data_source_count: int = 0
    job_count: int = 0
    profile_count: int = 0


class ImportOptions(BaseModel):
    name_override: str | None = None
    on_conflict: str = "skip"  # "skip" or "overwrite"


# ─── CRUD endpoints ───


@router.get("/", response_model=list[ProjectOut])
async def list_projects(session: AsyncSession = Depends(get_db)):
    result = await session.execute(select(Project).order_by(Project.name))
    return result.scalars().all()


@router.post("/", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
async def create_project(
    body: ProjectCreate,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    existing = await session.execute(select(Project).where(Project.name == body.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Project name already exists")
    project = Project(**body.model_dump())
    session.add(project)
    await session.flush()
    return project


@router.get("/active", response_model=ProjectOut | None)
async def get_active_project(session: AsyncSession = Depends(get_db)):
    result = await session.execute(select(Project).where(Project.is_active == True))
    return result.scalar_one_or_none()


@router.get("/{project_id}", response_model=ProjectDetail)
async def get_project(project_id: int, session: AsyncSession = Depends(get_db)):
    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    tag_count = len((await session.execute(
        select(Tag.id).where(Tag.project_id == project_id)
    )).all())
    screen_count = len((await session.execute(
        select(Screen.id).where(Screen.project_id == project_id)
    )).all())
    ds_count = len((await session.execute(
        select(DataSource.id).where(DataSource.project_id == project_id)
    )).all())
    job_count = len((await session.execute(
        select(Job.id).where(Job.project_id == project_id)
    )).all())
    profile_count = len((await session.execute(
        select(MachineProfile.id).where(MachineProfile.project_id == project_id)
    )).all())

    return ProjectDetail(
        id=project.id,
        name=project.name,
        description=project.description,
        version=project.version,
        is_active=project.is_active,
        created_at=project.created_at,
        updated_at=project.updated_at,
        tag_count=tag_count,
        screen_count=screen_count,
        data_source_count=ds_count,
        job_count=job_count,
        profile_count=profile_count,
    )


@router.put("/{project_id}", response_model=ProjectOut)
async def update_project(
    project_id: int,
    body: ProjectUpdate,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    for key, val in body.model_dump(exclude_unset=True).items():
        setattr(project, key, val)
    await session.flush()
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: int,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.DESIGNER)),
):
    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    # Unlink all resources (set project_id to NULL) rather than deleting them
    for model in [Tag, Screen, DataSource, Job, TagLabel, TagTemplate, ScreenTemplate]:
        await session.execute(
            update(model).where(model.project_id == project_id).values(project_id=None)
        )
    # Delete machine profiles (CASCADE handles this, but be explicit)
    await session.execute(
        delete(MachineProfile).where(MachineProfile.project_id == project_id)
    )
    await session.delete(project)


@router.post("/{project_id}/activate", response_model=ProjectOut)
async def activate_project(
    project_id: int,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    # Deactivate all other projects
    await session.execute(update(Project).values(is_active=False))
    project.is_active = True
    await session.flush()
    return project


@router.post("/{project_id}/deactivate", response_model=ProjectOut)
async def deactivate_project(
    project_id: int,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    project.is_active = False
    await session.flush()
    return project


@router.post("/{project_id}/assign-all", response_model=ProjectOut)
async def assign_unlinked_resources(
    project_id: int,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    """Assign all resources with no project to this project."""
    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    for model in [Tag, Screen, DataSource, Job, TagLabel, TagTemplate, ScreenTemplate]:
        await session.execute(
            update(model).where(model.project_id == None).values(project_id=project_id)
        )
    await session.flush()
    return project


# ─── Export ───


def _safe_json_parse(val: str | None, default=None):
    if val is None:
        return default
    try:
        return json.loads(val)
    except (json.JSONDecodeError, TypeError):
        return default


@router.get("/{project_id}/export")
async def export_project(
    project_id: int,
    profile_id: int | None = None,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Gather data sources
    ds_result = await session.execute(
        select(DataSource).where(DataSource.project_id == project_id)
    )
    data_sources = []
    for ds in ds_result.scalars().all():
        data_sources.append({
            "name": ds.name,
            "protocol": ds.protocol.value,
            "enabled": ds.enabled,
            "config": _safe_json_parse(ds.config, {}),
        })

    # Gather tag labels
    label_result = await session.execute(
        select(TagLabel).where(TagLabel.project_id == project_id)
    )
    tag_labels = []
    for lbl in label_result.scalars().all():
        tag_labels.append({
            "name": lbl.name,
            "color": lbl.color,
            "description": lbl.description,
        })

    # Gather tags with their label names
    tag_result = await session.execute(
        select(Tag).where(Tag.project_id == project_id).order_by(Tag.name)
    )
    tags = []
    # Build data source ID→name map
    ds_id_map = {}
    ds_all = await session.execute(select(DataSource))
    for ds in ds_all.scalars().all():
        ds_id_map[ds.id] = ds.name

    for tag in tag_result.scalars().all():
        tags.append({
            "name": tag.name,
            "description": tag.description,
            "long_description": tag.long_description,
            "data_source_name": ds_id_map.get(tag.data_source_id),
            "address": tag.address,
            "data_type": tag.data_type.value,
            "access_mode": tag.access_mode.value,
            "engineering_units": tag.engineering_units,
            "display_format": tag.display_format,
            "min_value": tag.min_value,
            "max_value": tag.max_value,
            "deadband": tag.deadband,
            "trending_enabled": tag.trending_enabled,
            "trending_sample_rate_ms": tag.trending_sample_rate_ms,
            "alarm_enabled": tag.alarm_enabled,
            "alarm_config": _safe_json_parse(tag.alarm_config),
            "simulation_enabled": tag.simulation_enabled,
            "simulation_behavior": tag.simulation_behavior.value if tag.simulation_behavior else None,
            "simulation_config": _safe_json_parse(tag.simulation_config),
            "enum_mapping": _safe_json_parse(tag.enum_mapping),
            "labels": [lbl.name for lbl in tag.labels],
        })

    # Gather tag templates
    tt_result = await session.execute(
        select(TagTemplate).where(TagTemplate.project_id == project_id)
    )
    tag_templates = []
    for tt in tt_result.scalars().all():
        tag_templates.append({
            "name": tt.name,
            "description": tt.description,
            "fields": _safe_json_parse(tt.fields, []),
        })

    # Gather screens
    scr_result = await session.execute(
        select(Screen).where(Screen.project_id == project_id).order_by(Screen.sort_order)
    )
    screens = []
    for scr in scr_result.scalars().all():
        screens.append({
            "name": scr.name,
            "slug": scr.slug,
            "layout": _safe_json_parse(scr.layout, []),
            "layout_mode": scr.layout_mode,
            "target_resolution": _safe_json_parse(scr.target_resolution),
            "sort_order": scr.sort_order,
            "is_default": scr.is_default,
        })

    # Gather screen templates
    st_result = await session.execute(
        select(ScreenTemplate).where(ScreenTemplate.project_id == project_id)
    )
    screen_templates = []
    for st in st_result.scalars().all():
        screen_templates.append({
            "name": st.name,
            "description": st.description,
            "layout": _safe_json_parse(st.layout, []),
            "placeholders": _safe_json_parse(st.placeholders, []),
        })

    # Gather jobs
    job_result = await session.execute(
        select(Job).where(Job.project_id == project_id)
    )
    jobs = []
    for job in job_result.scalars().all():
        jobs.append({
            "name": job.name,
            "description": job.description,
            "setpoints": _safe_json_parse(job.setpoints, {}),
            "download_conditions": _safe_json_parse(job.download_conditions),
        })

    # Handle machine profile overrides for deployment export
    profile_name = None
    if profile_id is not None:
        profile = await session.get(MachineProfile, profile_id)
        if not profile or profile.project_id != project_id:
            raise HTTPException(status_code=404, detail="Machine profile not found")
        profile_name = profile.name

        # Apply data source overrides
        ds_overrides = _safe_json_parse(profile.data_source_overrides, {})
        for ds in data_sources:
            override = ds_overrides.get(ds["name"])
            if override and "config" in override:
                ds["config"] = {**ds["config"], **override["config"]}

        # Apply tag address overrides
        tag_overrides = _safe_json_parse(profile.tag_overrides, {})
        for tag in tags:
            override = tag_overrides.get(tag["name"])
            if override and "address" in override:
                tag["address"] = override["address"]

    project_meta = {
        "name": project.name,
        "description": project.description,
        "version": project.version,
    }
    if profile_name:
        project_meta["deployed_for"] = profile_name

    export_data = {
        "format_version": EXPORT_FORMAT_VERSION,
        "project": project_meta,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "data_sources": data_sources,
        "tag_labels": tag_labels,
        "tags": tags,
        "tag_templates": tag_templates,
        "screens": screens,
        "screen_templates": screen_templates,
        "jobs": jobs,
    }

    # Include machine profiles in full export (not deployment export)
    if profile_id is None:
        mp_result = await session.execute(
            select(MachineProfile)
            .where(MachineProfile.project_id == project_id)
            .order_by(MachineProfile.name)
        )
        machine_profiles = []
        for mp in mp_result.scalars().all():
            machine_profiles.append({
                "name": mp.name,
                "description": mp.description,
                "data_source_overrides": _safe_json_parse(mp.data_source_overrides, {}),
                "tag_overrides": _safe_json_parse(mp.tag_overrides, {}),
            })
        export_data["machine_profiles"] = machine_profiles

    filename = f"{project.name}-{profile_name}.hmi.json" if profile_name else f"{project.name}.hmi.json"

    return JSONResponse(
        content=export_data,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


# ─── Import ───


@router.post("/import", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
async def import_project(
    body: dict,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    """Import a project from an exported JSON payload."""
    fmt = body.get("format_version")
    if not fmt:
        raise HTTPException(status_code=400, detail="Missing format_version — not a valid HMI project file")

    project_data = body.get("project", {})
    on_conflict = body.get("on_conflict", "skip")
    name = body.get("name_override") or project_data.get("name", "Imported Project")

    # Check for duplicate name
    existing = await session.execute(select(Project).where(Project.name == name))
    if existing.scalar_one_or_none():
        if on_conflict == "skip":
            raise HTTPException(status_code=409, detail=f"Project '{name}' already exists")
        # For overwrite, delete the old project first
        old = (await session.execute(select(Project).where(Project.name == name))).scalar_one()
        for model in [Tag, Screen, DataSource, Job, TagLabel, TagTemplate, ScreenTemplate]:
            await session.execute(
                update(model).where(model.project_id == old.id).values(project_id=None)
            )
        await session.delete(old)
        await session.flush()

    # Create project
    project = Project(
        name=name,
        description=project_data.get("description"),
        version=project_data.get("version", "1.0.0"),
    )
    session.add(project)
    await session.flush()
    pid = project.id

    # Import data sources (build name→id map)
    ds_name_map: dict[str, int] = {}
    for ds_data in body.get("data_sources", []):
        ds = DataSource(
            name=ds_data["name"],
            protocol=ds_data["protocol"],
            enabled=ds_data.get("enabled", True),
            config=json.dumps(ds_data.get("config", {})),
            project_id=pid,
        )
        session.add(ds)
        await session.flush()
        ds_name_map[ds.name] = ds.id

    # Import tag labels (build name→id map)
    label_name_map: dict[str, int] = {}
    for lbl_data in body.get("tag_labels", []):
        lbl = TagLabel(
            name=lbl_data["name"],
            color=lbl_data.get("color"),
            description=lbl_data.get("description"),
            project_id=pid,
        )
        session.add(lbl)
        await session.flush()
        label_name_map[lbl.name] = lbl.id

    # Import tag templates
    for tt_data in body.get("tag_templates", []):
        tt = TagTemplate(
            name=tt_data["name"],
            description=tt_data.get("description"),
            fields=json.dumps(tt_data.get("fields", [])),
            project_id=pid,
        )
        session.add(tt)

    # Import tags
    for tag_data in body.get("tags", []):
        ds_id = ds_name_map.get(tag_data.get("data_source_name")) if tag_data.get("data_source_name") else None
        tag = Tag(
            name=tag_data["name"],
            description=tag_data.get("description"),
            long_description=tag_data.get("long_description"),
            data_source_id=ds_id,
            address=tag_data.get("address"),
            data_type=tag_data.get("data_type", "float"),
            access_mode=tag_data.get("access_mode", "read"),
            engineering_units=tag_data.get("engineering_units"),
            display_format=tag_data.get("display_format"),
            min_value=tag_data.get("min_value"),
            max_value=tag_data.get("max_value"),
            deadband=tag_data.get("deadband"),
            trending_enabled=tag_data.get("trending_enabled", False),
            trending_sample_rate_ms=tag_data.get("trending_sample_rate_ms"),
            alarm_enabled=tag_data.get("alarm_enabled", False),
            alarm_config=json.dumps(tag_data["alarm_config"]) if tag_data.get("alarm_config") else None,
            simulation_enabled=tag_data.get("simulation_enabled", False),
            simulation_behavior=tag_data.get("simulation_behavior"),
            simulation_config=json.dumps(tag_data["simulation_config"]) if tag_data.get("simulation_config") else None,
            enum_mapping=json.dumps(tag_data["enum_mapping"]) if tag_data.get("enum_mapping") else None,
            project_id=pid,
        )
        session.add(tag)
        await session.flush()

        # Assign labels
        for lbl_name in tag_data.get("labels", []):
            lbl_id = label_name_map.get(lbl_name)
            if lbl_id:
                await session.execute(
                    tag_label_assignments.insert().values(tag_id=tag.id, label_id=lbl_id)
                )

    # Import screens
    for scr_data in body.get("screens", []):
        scr = Screen(
            name=scr_data["name"],
            slug=scr_data["slug"],
            layout=json.dumps(scr_data.get("layout", [])),
            layout_mode=scr_data.get("layout_mode", "absolute"),
            target_resolution=json.dumps(scr_data["target_resolution"]) if scr_data.get("target_resolution") else None,
            sort_order=scr_data.get("sort_order", 0),
            is_default=scr_data.get("is_default", False),
            project_id=pid,
        )
        session.add(scr)

    # Import screen templates
    for st_data in body.get("screen_templates", []):
        st = ScreenTemplate(
            name=st_data["name"],
            description=st_data.get("description"),
            layout=json.dumps(st_data.get("layout", [])),
            placeholders=json.dumps(st_data.get("placeholders", [])),
            project_id=pid,
        )
        session.add(st)

    # Import jobs
    for job_data in body.get("jobs", []):
        job = Job(
            name=job_data["name"],
            description=job_data.get("description"),
            setpoints=json.dumps(job_data.get("setpoints", {})),
            download_conditions=json.dumps(job_data["download_conditions"]) if job_data.get("download_conditions") else None,
            project_id=pid,
        )
        session.add(job)

    # Import machine profiles
    for mp_data in body.get("machine_profiles", []):
        mp = MachineProfile(
            name=mp_data["name"],
            description=mp_data.get("description"),
            data_source_overrides=json.dumps(mp_data.get("data_source_overrides", {})),
            tag_overrides=json.dumps(mp_data.get("tag_overrides", {})),
            project_id=pid,
        )
        session.add(mp)

    await session.flush()
    await session.refresh(project)
    return project
