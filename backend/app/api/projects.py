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


# ─── Import schemas ───

SECTION_KEYS = [
    "data_sources", "tag_labels", "tags", "tag_templates",
    "screens", "screen_templates", "jobs", "machine_profiles",
]

SECTION_LABELS = {
    "data_sources": "Data Sources",
    "tag_labels": "Tag Labels",
    "tags": "Tags",
    "tag_templates": "Tag Templates",
    "screens": "Screens",
    "screen_templates": "Screen Templates",
    "jobs": "Jobs",
    "machine_profiles": "Machine Profiles",
}

SECTION_DEPENDS_ON: dict[str, list[str]] = {
    "data_sources": [],
    "tag_labels": [],
    "tags": ["data_sources", "tag_labels"],
    "tag_templates": [],
    "screens": [],
    "screen_templates": [],
    "jobs": [],
    "machine_profiles": ["data_sources"],
}


class SectionItemPreview(BaseModel):
    name: str
    conflict: bool = False
    conflict_project: str | None = None


class SectionPreview(BaseModel):
    key: str
    label: str
    count: int
    conflict_count: int = 0
    items: list[SectionItemPreview] = []
    depends_on: list[str] = []
    warnings: list[str] = []


class ImportPreviewResponse(BaseModel):
    format_version: str
    project_name: str
    project_version: str
    target_project_name: str | None = None
    sections: list[SectionPreview] = []
    dependency_warnings: list[str] = []


class ImportSectionResult(BaseModel):
    section: str
    created: int = 0
    updated: int = 0
    skipped: int = 0


class ImportResultResponse(BaseModel):
    project_id: int
    project_name: str
    results: list[ImportSectionResult] = []
    warnings: list[str] = []


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


# ─── Import helpers ───


def _extract_tag_names_from_layout(layout: list[dict]) -> set[str]:
    """Extract all tag name references from a screen layout."""
    names: set[str] = set()
    for widget in layout:
        for field in ("visibleTag", "enabledTag"):
            if widget.get(field):
                names.add(widget[field])
        props = widget.get("props", {})
        for field in ("tag", "availabilityTag", "performanceTag", "qualityTag", "oeeTag"):
            if props.get(field):
                names.add(props[field])
        for field in ("controls", "tags"):
            for item in props.get(field, []):
                if isinstance(item, dict) and item.get("tag"):
                    names.add(item["tag"])
    return names


async def _get_existing_names(
    session: AsyncSession,
    model,
    name_col: str,
    names: set[str],
) -> dict[str, tuple[int, str | None]]:
    """Batch-query existing items by name, returning {name: (id, project_name)}."""
    if not names:
        return {}
    col = getattr(model, name_col)
    query = select(model.id, col, Project.name).outerjoin(
        Project, model.project_id == Project.id
    ).where(col.in_(names))
    rows = (await session.execute(query)).all()
    return {getattr(row, name_col) if hasattr(row, name_col) else row[1]: (row[0], row[2]) for row in rows}


async def _get_existing_names_simple(
    session: AsyncSession,
    model,
    names: set[str],
) -> dict[str, tuple[int, str | None]]:
    """Batch-query existing items by name column, returning {name: (id, project_name)}."""
    if not names:
        return {}
    query = select(model.id, model.name, Project.name.label("pname")).outerjoin(
        Project, model.project_id == Project.id
    ).where(model.name.in_(names))
    rows = (await session.execute(query)).all()
    return {row[1]: (row[0], row[2]) for row in rows}


async def _get_existing_screen_slugs(
    session: AsyncSession,
    slugs: set[str],
) -> dict[str, tuple[int, str | None]]:
    """Batch-query existing screens by slug, returning {slug: (id, project_name)}."""
    if not slugs:
        return {}
    query = select(Screen.id, Screen.slug, Project.name.label("pname")).outerjoin(
        Project, Screen.project_id == Project.id
    ).where(Screen.slug.in_(slugs))
    rows = (await session.execute(query)).all()
    return {row[1]: (row[0], row[2]) for row in rows}


async def _get_existing_job_names(
    session: AsyncSession,
    names: set[str],
    project_id: int | None,
) -> dict[str, tuple[int, str | None]]:
    """Batch-query existing jobs by name within a project."""
    if not names or project_id is None:
        return {}
    query = select(Job.id, Job.name, Project.name.label("pname")).outerjoin(
        Project, Job.project_id == Project.id
    ).where(Job.name.in_(names), Job.project_id == project_id)
    rows = (await session.execute(query)).all()
    return {row[1]: (row[0], row[2]) for row in rows}


async def _get_existing_profile_names(
    session: AsyncSession,
    names: set[str],
    project_id: int | None,
) -> dict[str, tuple[int, str | None]]:
    """Batch-query existing machine profiles by name within a project."""
    if not names or project_id is None:
        return {}
    query = select(MachineProfile.id, MachineProfile.name, Project.name.label("pname")).outerjoin(
        Project, MachineProfile.project_id == Project.id
    ).where(MachineProfile.name.in_(names), MachineProfile.project_id == project_id)
    rows = (await session.execute(query)).all()
    return {row[1]: (row[0], row[2]) for row in rows}


# ─── Import: per-section importers ───


async def _import_data_sources(
    items: list[dict], pid: int, session: AsyncSession,
    conflict_mode: str, existing: dict[str, tuple[int, str | None]],
) -> tuple[dict[str, int], ImportSectionResult]:
    result = ImportSectionResult(section="data_sources")
    name_map: dict[str, int] = {}
    for ds_data in items:
        ds_name = ds_data["name"]
        if ds_name in existing:
            ds_id, _ = existing[ds_name]
            if conflict_mode == "overwrite":
                ds = await session.get(DataSource, ds_id)
                if ds:
                    ds.protocol = ds_data["protocol"]
                    ds.enabled = ds_data.get("enabled", True)
                    ds.config = json.dumps(ds_data.get("config", {}))
                    ds.project_id = pid
                    result.updated += 1
                    name_map[ds_name] = ds_id
            else:
                result.skipped += 1
                name_map[ds_name] = ds_id
        else:
            ds = DataSource(
                name=ds_name,
                protocol=ds_data["protocol"],
                enabled=ds_data.get("enabled", True),
                config=json.dumps(ds_data.get("config", {})),
                project_id=pid,
            )
            session.add(ds)
            await session.flush()
            result.created += 1
            name_map[ds_name] = ds.id
    return name_map, result


async def _import_tag_labels(
    items: list[dict], pid: int, session: AsyncSession,
    conflict_mode: str, existing: dict[str, tuple[int, str | None]],
) -> tuple[dict[str, int], ImportSectionResult]:
    result = ImportSectionResult(section="tag_labels")
    name_map: dict[str, int] = {}
    for lbl_data in items:
        lbl_name = lbl_data["name"]
        if lbl_name in existing:
            lbl_id, _ = existing[lbl_name]
            if conflict_mode == "overwrite":
                lbl = await session.get(TagLabel, lbl_id)
                if lbl:
                    lbl.color = lbl_data.get("color")
                    lbl.description = lbl_data.get("description")
                    lbl.project_id = pid
                    result.updated += 1
                    name_map[lbl_name] = lbl_id
            else:
                result.skipped += 1
                name_map[lbl_name] = lbl_id
        else:
            lbl = TagLabel(
                name=lbl_name,
                color=lbl_data.get("color"),
                description=lbl_data.get("description"),
                project_id=pid,
            )
            session.add(lbl)
            await session.flush()
            result.created += 1
            name_map[lbl_name] = lbl.id
    return name_map, result


async def _import_tags(
    items: list[dict], pid: int, session: AsyncSession,
    conflict_mode: str, existing: dict[str, tuple[int, str | None]],
    ds_name_map: dict[str, int], label_name_map: dict[str, int],
) -> ImportSectionResult:
    result = ImportSectionResult(section="tags")
    # Build complete ds name→id map from the import + existing database
    all_ds = dict(ds_name_map)
    if not all_ds:
        # Look up all data sources so we can resolve names
        ds_rows = (await session.execute(select(DataSource.id, DataSource.name))).all()
        for row in ds_rows:
            if row[1] not in all_ds:
                all_ds[row[1]] = row[0]

    # Build complete label name→id map
    all_labels = dict(label_name_map)
    if not all_labels:
        lbl_rows = (await session.execute(select(TagLabel.id, TagLabel.name))).all()
        for row in lbl_rows:
            if row[1] not in all_labels:
                all_labels[row[1]] = row[0]

    for tag_data in items:
        tag_name = tag_data["name"]
        ds_id = all_ds.get(tag_data.get("data_source_name")) if tag_data.get("data_source_name") else None

        if tag_name in existing:
            tag_id, _ = existing[tag_name]
            if conflict_mode == "overwrite":
                tag = await session.get(Tag, tag_id)
                if tag:
                    tag.description = tag_data.get("description")
                    tag.long_description = tag_data.get("long_description")
                    tag.data_source_id = ds_id
                    tag.address = tag_data.get("address")
                    tag.data_type = tag_data.get("data_type", "float")
                    tag.access_mode = tag_data.get("access_mode", "read")
                    tag.engineering_units = tag_data.get("engineering_units")
                    tag.display_format = tag_data.get("display_format")
                    tag.min_value = tag_data.get("min_value")
                    tag.max_value = tag_data.get("max_value")
                    tag.deadband = tag_data.get("deadband")
                    tag.trending_enabled = tag_data.get("trending_enabled", False)
                    tag.trending_sample_rate_ms = tag_data.get("trending_sample_rate_ms")
                    tag.alarm_enabled = tag_data.get("alarm_enabled", False)
                    tag.alarm_config = json.dumps(tag_data["alarm_config"]) if tag_data.get("alarm_config") else None
                    tag.simulation_enabled = tag_data.get("simulation_enabled", False)
                    tag.simulation_behavior = tag_data.get("simulation_behavior")
                    tag.simulation_config = json.dumps(tag_data["simulation_config"]) if tag_data.get("simulation_config") else None
                    tag.enum_mapping = json.dumps(tag_data["enum_mapping"]) if tag_data.get("enum_mapping") else None
                    tag.project_id = pid
                    # Re-assign labels: clear existing, add new
                    await session.execute(
                        tag_label_assignments.delete().where(tag_label_assignments.c.tag_id == tag_id)
                    )
                    for lbl_name in tag_data.get("labels", []):
                        lbl_id = all_labels.get(lbl_name)
                        if lbl_id:
                            await session.execute(
                                tag_label_assignments.insert().values(tag_id=tag_id, label_id=lbl_id)
                            )
                    result.updated += 1
            else:
                result.skipped += 1
        else:
            tag = Tag(
                name=tag_name,
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
            for lbl_name in tag_data.get("labels", []):
                lbl_id = all_labels.get(lbl_name)
                if lbl_id:
                    await session.execute(
                        tag_label_assignments.insert().values(tag_id=tag.id, label_id=lbl_id)
                    )
            result.created += 1
    return result


async def _import_tag_templates(
    items: list[dict], pid: int, session: AsyncSession,
    conflict_mode: str, existing: dict[str, tuple[int, str | None]],
) -> ImportSectionResult:
    result = ImportSectionResult(section="tag_templates")
    for tt_data in items:
        tt_name = tt_data["name"]
        if tt_name in existing:
            tt_id, _ = existing[tt_name]
            if conflict_mode == "overwrite":
                tt = await session.get(TagTemplate, tt_id)
                if tt:
                    tt.description = tt_data.get("description")
                    tt.fields = json.dumps(tt_data.get("fields", []))
                    tt.project_id = pid
                    result.updated += 1
            else:
                result.skipped += 1
        else:
            tt = TagTemplate(
                name=tt_name,
                description=tt_data.get("description"),
                fields=json.dumps(tt_data.get("fields", [])),
                project_id=pid,
            )
            session.add(tt)
            result.created += 1
    await session.flush()
    return result


async def _import_screens(
    items: list[dict], pid: int, session: AsyncSession,
    conflict_mode: str, existing: dict[str, tuple[int, str | None]],
) -> ImportSectionResult:
    result = ImportSectionResult(section="screens")
    for scr_data in items:
        slug = scr_data["slug"]
        if slug in existing:
            scr_id, _ = existing[slug]
            if conflict_mode == "overwrite":
                scr = await session.get(Screen, scr_id)
                if scr:
                    scr.name = scr_data["name"]
                    scr.layout = json.dumps(scr_data.get("layout", []))
                    scr.layout_mode = scr_data.get("layout_mode", "absolute")
                    scr.target_resolution = json.dumps(scr_data["target_resolution"]) if scr_data.get("target_resolution") else None
                    scr.sort_order = scr_data.get("sort_order", 0)
                    scr.is_default = scr_data.get("is_default", False)
                    scr.project_id = pid
                    result.updated += 1
            else:
                result.skipped += 1
        else:
            scr = Screen(
                name=scr_data["name"],
                slug=slug,
                layout=json.dumps(scr_data.get("layout", [])),
                layout_mode=scr_data.get("layout_mode", "absolute"),
                target_resolution=json.dumps(scr_data["target_resolution"]) if scr_data.get("target_resolution") else None,
                sort_order=scr_data.get("sort_order", 0),
                is_default=scr_data.get("is_default", False),
                project_id=pid,
            )
            session.add(scr)
            result.created += 1
    await session.flush()
    return result


async def _import_screen_templates(
    items: list[dict], pid: int, session: AsyncSession,
    conflict_mode: str, existing: dict[str, tuple[int, str | None]],
) -> ImportSectionResult:
    result = ImportSectionResult(section="screen_templates")
    for st_data in items:
        st_name = st_data["name"]
        if st_name in existing:
            st_id, _ = existing[st_name]
            if conflict_mode == "overwrite":
                st = await session.get(ScreenTemplate, st_id)
                if st:
                    st.description = st_data.get("description")
                    st.layout = json.dumps(st_data.get("layout", []))
                    st.placeholders = json.dumps(st_data.get("placeholders", []))
                    st.project_id = pid
                    result.updated += 1
            else:
                result.skipped += 1
        else:
            st = ScreenTemplate(
                name=st_name,
                description=st_data.get("description"),
                layout=json.dumps(st_data.get("layout", [])),
                placeholders=json.dumps(st_data.get("placeholders", [])),
                project_id=pid,
            )
            session.add(st)
            result.created += 1
    await session.flush()
    return result


async def _import_jobs(
    items: list[dict], pid: int, session: AsyncSession,
    conflict_mode: str, existing: dict[str, tuple[int, str | None]],
) -> ImportSectionResult:
    result = ImportSectionResult(section="jobs")
    for job_data in items:
        job_name = job_data["name"]
        if job_name in existing:
            job_id, _ = existing[job_name]
            if conflict_mode == "overwrite":
                job = await session.get(Job, job_id)
                if job:
                    job.description = job_data.get("description")
                    job.setpoints = json.dumps(job_data.get("setpoints", {}))
                    job.download_conditions = json.dumps(job_data["download_conditions"]) if job_data.get("download_conditions") else None
                    job.project_id = pid
                    result.updated += 1
            else:
                result.skipped += 1
        else:
            job = Job(
                name=job_name,
                description=job_data.get("description"),
                setpoints=json.dumps(job_data.get("setpoints", {})),
                download_conditions=json.dumps(job_data["download_conditions"]) if job_data.get("download_conditions") else None,
                project_id=pid,
            )
            session.add(job)
            result.created += 1
    await session.flush()
    return result


async def _import_machine_profiles(
    items: list[dict], pid: int, session: AsyncSession,
    conflict_mode: str, existing: dict[str, tuple[int, str | None]],
) -> ImportSectionResult:
    result = ImportSectionResult(section="machine_profiles")
    for mp_data in items:
        mp_name = mp_data["name"]
        if mp_name in existing:
            mp_id, _ = existing[mp_name]
            if conflict_mode == "overwrite":
                mp = await session.get(MachineProfile, mp_id)
                if mp:
                    mp.description = mp_data.get("description")
                    mp.data_source_overrides = json.dumps(mp_data.get("data_source_overrides", {}))
                    mp.tag_overrides = json.dumps(mp_data.get("tag_overrides", {}))
                    result.updated += 1
            else:
                result.skipped += 1
        else:
            mp = MachineProfile(
                name=mp_name,
                description=mp_data.get("description"),
                data_source_overrides=json.dumps(mp_data.get("data_source_overrides", {})),
                tag_overrides=json.dumps(mp_data.get("tag_overrides", {})),
                project_id=pid,
            )
            session.add(mp)
            result.created += 1
    await session.flush()
    return result


# ─── Import endpoints ───


@router.post("/import/preview")
async def preview_import(
    body: dict,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    """Preview what an import would do, with conflict detection."""
    data = body.get("data", body)
    fmt = data.get("format_version")
    if not fmt:
        raise HTTPException(status_code=400, detail="Missing format_version — not a valid HMI project file")

    target_pid = body.get("target_project_id")
    target_project_name = None
    if target_pid is not None:
        project = await session.get(Project, target_pid)
        if not project:
            raise HTTPException(status_code=404, detail="Target project not found")
        target_project_name = project.name

    project_data = data.get("project", {})
    sections: list[SectionPreview] = []
    dependency_warnings: list[str] = []

    # Collect all names from the import file for dependency analysis
    import_ds_names = {d["name"] for d in data.get("data_sources", [])}
    import_label_names = {l["name"] for l in data.get("tag_labels", [])}
    import_tag_names = {t["name"] for t in data.get("tags", [])}

    # Batch-query existing names for each section
    existing_ds = await _get_existing_names_simple(session, DataSource, import_ds_names)
    existing_labels = await _get_existing_names_simple(session, TagLabel, import_label_names)
    existing_tags = await _get_existing_names_simple(session, Tag, import_tag_names)
    existing_tt = await _get_existing_names_simple(
        session, TagTemplate,
        {t["name"] for t in data.get("tag_templates", [])},
    )
    existing_screens = await _get_existing_screen_slugs(
        session, {s["slug"] for s in data.get("screens", [])},
    )
    existing_st = await _get_existing_names_simple(
        session, ScreenTemplate,
        {s["name"] for s in data.get("screen_templates", [])},
    )
    existing_jobs = await _get_existing_job_names(
        session,
        {j["name"] for j in data.get("jobs", [])},
        target_pid,
    )
    existing_profiles = await _get_existing_profile_names(
        session,
        {m["name"] for m in data.get("machine_profiles", [])},
        target_pid,
    )

    # Also query all existing tag/ds names in the database for dependency checking
    all_db_tag_names = set((await session.execute(select(Tag.name))).scalars().all())
    all_db_ds_names = set((await session.execute(select(DataSource.name))).scalars().all())
    all_db_label_names = set((await session.execute(select(TagLabel.name))).scalars().all())

    # Helper to build section preview
    def build_section(key: str, items: list[dict], existing_map: dict, name_field: str = "name"):
        item_previews = []
        conflict_count = 0
        for item in items:
            n = item[name_field]
            is_conflict = n in existing_map
            proj_name = existing_map[n][1] if is_conflict else None
            if is_conflict:
                conflict_count += 1
            item_previews.append(SectionItemPreview(
                name=n,
                conflict=is_conflict,
                conflict_project=proj_name,
            ))
        return SectionPreview(
            key=key,
            label=SECTION_LABELS[key],
            count=len(items),
            conflict_count=conflict_count,
            items=item_previews,
            depends_on=SECTION_DEPENDS_ON.get(key, []),
        )

    # Build previews for each section
    sections.append(build_section("data_sources", data.get("data_sources", []), existing_ds))
    sections.append(build_section("tag_labels", data.get("tag_labels", []), existing_labels))
    sections.append(build_section("tags", data.get("tags", []), existing_tags))
    sections.append(build_section("tag_templates", data.get("tag_templates", []), existing_tt))
    sections.append(build_section("screens", data.get("screens", []), existing_screens, name_field="slug"))
    sections.append(build_section("screen_templates", data.get("screen_templates", []), existing_st))
    sections.append(build_section("jobs", data.get("jobs", []), existing_jobs))
    sections.append(build_section("machine_profiles", data.get("machine_profiles", []), existing_profiles))

    # Compute dependency warnings
    # Tags → data sources
    for tag_data in data.get("tags", []):
        ds_name = tag_data.get("data_source_name")
        if ds_name and ds_name not in import_ds_names and ds_name not in all_db_ds_names:
            dependency_warnings.append(
                f"Tag '{tag_data['name']}' references data source '{ds_name}' which is not in this file or the database"
            )
    # Tags → labels
    for tag_data in data.get("tags", []):
        for lbl_name in tag_data.get("labels", []):
            if lbl_name not in import_label_names and lbl_name not in all_db_label_names:
                dependency_warnings.append(
                    f"Tag '{tag_data['name']}' references label '{lbl_name}' which is not in this file or the database"
                )
    # Screens → tags
    available_tags = import_tag_names | all_db_tag_names
    for scr_data in data.get("screens", []):
        layout = scr_data.get("layout", [])
        if isinstance(layout, list):
            ref_tags = _extract_tag_names_from_layout(layout)
            missing = ref_tags - available_tags
            if missing:
                dependency_warnings.append(
                    f"Screen '{scr_data.get('name', scr_data['slug'])}' references {len(missing)} tag(s) not found: {', '.join(sorted(missing)[:5])}{'...' if len(missing) > 5 else ''}"
                )
    # Jobs → tags
    for job_data in data.get("jobs", []):
        sp = job_data.get("setpoints", {})
        if isinstance(sp, dict):
            missing = set(sp.keys()) - available_tags
            if missing:
                dependency_warnings.append(
                    f"Job '{job_data['name']}' references {len(missing)} tag(s) not found: {', '.join(sorted(missing)[:5])}{'...' if len(missing) > 5 else ''}"
                )

    # Deduplicate warnings
    dependency_warnings = list(dict.fromkeys(dependency_warnings))

    return ImportPreviewResponse(
        format_version=fmt,
        project_name=project_data.get("name", "Unknown"),
        project_version=project_data.get("version", "?"),
        target_project_name=target_project_name,
        sections=sections,
        dependency_warnings=dependency_warnings,
    )


@router.post("/import", status_code=status.HTTP_201_CREATED)
async def import_project(
    body: dict,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    """Import a project from an exported JSON payload with selective section import."""
    # Support both old format (body IS the export data) and new format (body.data has export data)
    if "data" in body and isinstance(body["data"], dict) and body["data"].get("format_version"):
        data = body["data"]
        target_pid = body.get("target_project_id")
        selected_sections = body.get("sections")  # None = all
        conflict_res = body.get("conflict_resolution", {})
        default_conflict = body.get("default_conflict_resolution", "skip")
        name_override = body.get("name_override")
    else:
        # Legacy format: body IS the export data
        data = body
        target_pid = None
        selected_sections = None
        conflict_res = {}
        default_conflict = body.get("on_conflict", "skip")
        name_override = body.get("name_override")

    fmt = data.get("format_version")
    if not fmt:
        raise HTTPException(status_code=400, detail="Missing format_version — not a valid HMI project file")

    project_data = data.get("project", {})
    warnings: list[str] = []
    results: list[ImportSectionResult] = []

    # Determine which sections to import
    sections_to_import = set(selected_sections) if selected_sections else set(SECTION_KEYS)

    def get_conflict_mode(section: str) -> str:
        return conflict_res.get(section, default_conflict)

    # Determine target project
    if target_pid is not None:
        project = await session.get(Project, target_pid)
        if not project:
            raise HTTPException(status_code=404, detail="Target project not found")
        pid = project.id
    else:
        # Create new project
        name = name_override or project_data.get("name", "Imported Project")
        existing = await session.execute(select(Project).where(Project.name == name))
        if existing.scalar_one_or_none():
            on_conflict = default_conflict
            if on_conflict == "skip":
                raise HTTPException(status_code=409, detail=f"Project '{name}' already exists")
            old = (await session.execute(select(Project).where(Project.name == name))).scalar_one()
            for model in [Tag, Screen, DataSource, Job, TagLabel, TagTemplate, ScreenTemplate]:
                await session.execute(
                    update(model).where(model.project_id == old.id).values(project_id=None)
                )
            await session.delete(old)
            await session.flush()

        project = Project(
            name=name,
            description=project_data.get("description"),
            version=project_data.get("version", "1.0.0"),
        )
        session.add(project)
        await session.flush()
        pid = project.id

    # Batch-query existing names for conflict detection
    ds_items = data.get("data_sources", []) if "data_sources" in sections_to_import else []
    label_items = data.get("tag_labels", []) if "tag_labels" in sections_to_import else []
    tag_items = data.get("tags", []) if "tags" in sections_to_import else []
    tt_items = data.get("tag_templates", []) if "tag_templates" in sections_to_import else []
    scr_items = data.get("screens", []) if "screens" in sections_to_import else []
    st_items = data.get("screen_templates", []) if "screen_templates" in sections_to_import else []
    job_items = data.get("jobs", []) if "jobs" in sections_to_import else []
    mp_items = data.get("machine_profiles", []) if "machine_profiles" in sections_to_import else []

    # Query existing for each section
    existing_ds = await _get_existing_names_simple(session, DataSource, {d["name"] for d in ds_items}) if ds_items else {}
    existing_labels = await _get_existing_names_simple(session, TagLabel, {l["name"] for l in label_items}) if label_items else {}
    existing_tags = await _get_existing_names_simple(session, Tag, {t["name"] for t in tag_items}) if tag_items else {}
    existing_tt = await _get_existing_names_simple(session, TagTemplate, {t["name"] for t in tt_items}) if tt_items else {}
    existing_screens = await _get_existing_screen_slugs(session, {s["slug"] for s in scr_items}) if scr_items else {}
    existing_st = await _get_existing_names_simple(session, ScreenTemplate, {s["name"] for s in st_items}) if st_items else {}
    existing_jobs = await _get_existing_job_names(session, {j["name"] for j in job_items}, pid) if job_items else {}
    existing_profiles = await _get_existing_profile_names(session, {m["name"] for m in mp_items}, pid) if mp_items else {}

    # Import in dependency order
    ds_name_map: dict[str, int] = {}
    label_name_map: dict[str, int] = {}

    if ds_items:
        ds_name_map, ds_result = await _import_data_sources(
            ds_items, pid, session, get_conflict_mode("data_sources"), existing_ds,
        )
        results.append(ds_result)

    if label_items:
        label_name_map, label_result = await _import_tag_labels(
            label_items, pid, session, get_conflict_mode("tag_labels"), existing_labels,
        )
        results.append(label_result)

    if tag_items:
        tag_result = await _import_tags(
            tag_items, pid, session, get_conflict_mode("tags"), existing_tags,
            ds_name_map, label_name_map,
        )
        results.append(tag_result)

    if tt_items:
        tt_result = await _import_tag_templates(
            tt_items, pid, session, get_conflict_mode("tag_templates"), existing_tt,
        )
        results.append(tt_result)

    if scr_items:
        scr_result = await _import_screens(
            scr_items, pid, session, get_conflict_mode("screens"), existing_screens,
        )
        results.append(scr_result)

    if st_items:
        st_result = await _import_screen_templates(
            st_items, pid, session, get_conflict_mode("screen_templates"), existing_st,
        )
        results.append(st_result)

    if job_items:
        job_result = await _import_jobs(
            job_items, pid, session, get_conflict_mode("jobs"), existing_jobs,
        )
        results.append(job_result)

    if mp_items:
        mp_result = await _import_machine_profiles(
            mp_items, pid, session, get_conflict_mode("machine_profiles"), existing_profiles,
        )
        results.append(mp_result)

    await session.flush()
    await session.refresh(project)

    return ImportResultResponse(
        project_id=project.id,
        project_name=project.name,
        results=results,
        warnings=warnings,
    )
