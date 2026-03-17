import csv
import io
import json
import xml.etree.ElementTree as ET

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import require_role
from app.core.database import get_db
from app.models.datasource import DataSource
from app.models.screen import Screen
from app.models.tag import Tag, TagAccessMode, TagDataType, TagLabel, TagTemplate
from app.models.user import User, UserRole
from app.services.tag_engine import tag_engine

router = APIRouter(prefix="/api/tags", tags=["tags"])


class TagCreate(BaseModel):
    name: str
    display_name: str | None = None
    description: str | None = None
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


class TagLabelOut(BaseModel):
    id: int
    name: str
    color: str | None
    description: str | None

    model_config = {"from_attributes": True}


class TagOut(BaseModel):
    id: int
    name: str
    display_name: str | None
    description: str | None
    data_source_id: int | None
    address: str | None
    data_type: TagDataType
    access_mode: TagAccessMode
    engineering_units: str | None
    display_format: str | None
    min_value: float | None
    max_value: float | None
    deadband: float | None
    trending_enabled: bool
    trending_sample_rate_ms: int | None
    alarm_enabled: bool
    alarm_config: str | None
    simulation_enabled: bool
    simulation_behavior: str | None
    simulation_config: str | None
    enum_mapping: str | None
    labels: list[TagLabelOut] = []
    is_system: bool = False

    model_config = {"from_attributes": True}


class TagValueOut(BaseModel):
    tag_id: int
    name: str
    value: object
    quality: str
    timestamp: str


@router.get("/", response_model=list[TagOut])
async def list_tags(
    project_id: int | None = None,
    session: AsyncSession = Depends(get_db),
):
    query = select(Tag).options(selectinload(Tag.labels)).order_by(Tag.name)
    if project_id is not None:
        query = query.where(Tag.project_id == project_id)
    result = await session.execute(query)
    return result.scalars().all()


@router.post("/", response_model=TagOut, status_code=status.HTTP_201_CREATED)
async def create_tag(
    request: Request,
    body: TagCreate,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    if body.name.startswith("$"):
        raise HTTPException(status_code=400, detail="Tag names starting with '$' are reserved for system tags")
    tag = Tag(**body.model_dump())
    session.add(tag)
    await session.flush()
    await session.refresh(tag, ["labels"])
    tag_engine.register_tag(tag)
    needs_commit = tag.alarm_enabled or tag.trending_enabled
    if needs_commit:
        await session.commit()
    if tag.alarm_enabled:
        await request.app.state.alarm_service.reload_alarm_configs()
    if tag.trending_enabled:
        await request.app.state.trend_service.reload_trending_tags()
    return tag


@router.put("/{tag_id}", response_model=TagOut)
async def update_tag(
    request: Request,
    tag_id: int,
    body: TagCreate,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    tag = await session.get(Tag, tag_id)
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    if tag.is_system:
        raise HTTPException(status_code=403, detail="System tags cannot be modified")
    alarm_changed = (tag.alarm_enabled != body.alarm_enabled or
                     tag.alarm_config != body.alarm_config)
    trending_changed = (tag.trending_enabled != body.trending_enabled or
                        tag.trending_sample_rate_ms != body.trending_sample_rate_ms or
                        tag.deadband != body.deadband)
    for key, val in body.model_dump().items():
        setattr(tag, key, val)
    # Clear persisted value when tag is no longer internal (nonvolatile)
    if tag.data_source_id is not None or tag.simulation_enabled:
        tag.persisted_value = None
    await session.flush()
    await session.refresh(tag, ["labels"])
    tag_engine.register_tag(tag)
    if alarm_changed or trending_changed:
        await session.commit()
    if alarm_changed:
        await request.app.state.alarm_service.reload_alarm_configs()
    if trending_changed:
        await request.app.state.trend_service.reload_trending_tags()
    return tag


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tag(
    request: Request,
    tag_id: int,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    tag = await session.get(Tag, tag_id)
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    if tag.is_system:
        raise HTTPException(status_code=403, detail="System tags cannot be deleted")
    had_alarm = tag.alarm_enabled
    had_trending = tag.trending_enabled
    tag_name = tag.name
    await session.delete(tag)
    tag_engine.unregister_tag(tag_name)
    if had_alarm or had_trending:
        await session.commit()
    if had_alarm:
        await request.app.state.alarm_service.reload_alarm_configs()
    if had_trending:
        await request.app.state.trend_service.reload_trending_tags()


@router.get("/by-name/{tag_name}", response_model=TagOut)
async def get_tag_by_name(tag_name: str, session: AsyncSession = Depends(get_db)):
    result = await session.execute(
        select(Tag).where(Tag.name == tag_name).options(selectinload(Tag.labels))
    )
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    return tag


@router.get("/values")
async def get_all_tag_values(
    _user: User = Depends(require_role(
        UserRole.UNAUTHENTICATED, UserRole.OPERATOR, UserRole.SUPERVISOR,
        UserRole.ENGINEER, UserRole.DESIGNER,
    )),
):
    return tag_engine.get_all_values()


@router.get("/values/{tag_name}")
async def get_tag_value(tag_name: str, session: AsyncSession = Depends(get_db)):
    tv = tag_engine.get_value(tag_name)
    if tv is None:
        # Try loading from DB
        result = await session.execute(select(Tag).where(Tag.name == tag_name))
        tag = result.scalar_one_or_none()
        if tag is None:
            raise HTTPException(status_code=404, detail="Tag not found")
        tag_engine.register_tag(tag)
        tv = tag_engine.get_value(tag_name)
    return tv.to_dict()


@router.post("/values/{tag_name}/write")
async def write_tag_value(
    tag_name: str,
    body: dict,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(
        UserRole.OPERATOR, UserRole.SUPERVISOR,
        UserRole.ENGINEER, UserRole.DESIGNER,
    )),
):
    if tag_name.startswith("$"):
        raise HTTPException(status_code=403, detail="System tag values cannot be written")
    value = body.get("value")
    if value is None:
        raise HTTPException(status_code=400, detail="Missing 'value' in body")
    # If tag is not yet in the engine, try loading it from the DB
    if tag_engine.get_tag(tag_name) is None:
        result = await session.execute(select(Tag).where(Tag.name == tag_name))
        tag = result.scalar_one_or_none()
        if tag is None:
            raise HTTPException(status_code=404, detail="Tag not found")
        tag_engine.register_tag(tag)
    success = await tag_engine.write_value(tag_name, value)
    if not success:
        raise HTTPException(status_code=404, detail="Tag not found")
    return {"success": True}


@router.get("/export/csv")
async def export_tags_csv(
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    """Export all tags as a CSV file."""
    result = await session.execute(
        select(Tag).options(selectinload(Tag.labels)).order_by(Tag.name)
    )
    tags = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "name", "display_name", "description", "data_type", "access_mode",
        "engineering_units", "display_format", "min_value", "max_value",
        "deadband", "address", "data_source_id",
        "trending_enabled", "trending_sample_rate_ms",
        "alarm_enabled", "alarm_config",
        "simulation_enabled", "simulation_behavior", "simulation_config",
        "enum_mapping", "labels",
    ])
    for tag in tags:
        label_names = ";".join(l.name for l in tag.labels) if tag.labels else ""
        writer.writerow([
            tag.name,
            tag.display_name or "",
            tag.description or "",
            tag.data_type.value if tag.data_type else "",
            tag.access_mode.value if tag.access_mode else "",
            tag.engineering_units or "",
            tag.display_format or "",
            tag.min_value if tag.min_value is not None else "",
            tag.max_value if tag.max_value is not None else "",
            tag.deadband if tag.deadband is not None else "",
            tag.address or "",
            tag.data_source_id if tag.data_source_id is not None else "",
            tag.trending_enabled,
            tag.trending_sample_rate_ms if tag.trending_sample_rate_ms is not None else "",
            tag.alarm_enabled,
            tag.alarm_config or "",
            tag.simulation_enabled,
            tag.simulation_behavior or "",
            tag.simulation_config or "",
            tag.enum_mapping or "",
            label_names,
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=tags_export.csv"},
    )


@router.post("/import/csv")
async def import_tags_csv(
    body: dict,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    """Import tags from CSV data.

    Body: {"tags": [...], "data_source_id": int, "on_conflict": "skip"|"update", "update_fields": ["display_name", ...]}
    """
    tags_data = body.get("tags", [])
    default_ds_id = body.get("data_source_id")
    on_conflict = body.get("on_conflict", "skip")
    update_fields = set(body.get("update_fields", []))
    if default_ds_id is not None:
        ds = await session.get(DataSource, default_ds_id)
        if not ds:
            raise HTTPException(status_code=400, detail=f"Data source {default_ds_id} not found")

    import_names = [td["name"] for td in tags_data]
    existing_q = await session.execute(select(Tag).where(Tag.name.in_(import_names)))
    existing_map = {t.name: t for t in existing_q.scalars().all()}

    created, updated, skipped = [], [], []
    for td in tags_data:
        existing = existing_map.get(td["name"])
        if existing:
            if on_conflict != "update":
                skipped.append(existing)
                continue
            if not update_fields or "display_name" in update_fields:
                existing.display_name = td.get("display_name") or td.get("description") or existing.display_name
            if not update_fields or "data_type" in update_fields:
                existing.data_type = TagDataType(td.get("data_type", "float"))
            if not update_fields or "access_mode" in update_fields:
                existing.access_mode = TagAccessMode(td.get("access_mode", "read"))
            if not update_fields or "address" in update_fields:
                existing.address = td.get("address") or existing.address
            if not update_fields or "engineering_units" in update_fields:
                existing.engineering_units = td.get("engineering_units") or existing.engineering_units
            ds = td.get("data_source_id") or default_ds_id
            if ds is not None:
                existing.data_source_id = ds
            updated.append(existing)
        else:
            tag = Tag(
                name=td["name"],
                display_name=td.get("display_name") or td.get("description"),
                data_type=TagDataType(td.get("data_type", "float")),
                address=td.get("address"),
                data_source_id=td.get("data_source_id") or default_ds_id,
                access_mode=TagAccessMode(td.get("access_mode", "read")),
                engineering_units=td.get("engineering_units"),
            )
            session.add(tag)
            created.append(tag)
    await session.flush()
    for tag in created:
        await session.refresh(tag)
    for tag in created + updated:
        tag_engine.register_tag(tag)
    return {"imported": len(created), "updated": len(updated), "skipped": len(skipped)}


# ─── CODESYS Symbol Configuration XML Import ───

CODESYS_TYPE_MAP: dict[str, TagDataType] = {
    "Bool": TagDataType.BOOL,
    "Int": TagDataType.INT,
    "UInt": TagDataType.INT,
    "DInt": TagDataType.INT,
    "UDInt": TagDataType.INT,
    "Real": TagDataType.FLOAT,
    "LReal": TagDataType.FLOAT,
    "String": TagDataType.STRING,
    "Word": TagDataType.INT,
    "DWord": TagDataType.INT,
    "Byte": TagDataType.INT,
    "Time": TagDataType.INT,
}

CODESYS_NS = {"sc": "http://www.3s-software.com/schemas/Symbolconfiguration.xsd"}


def _codesys_build_type_registry(type_list: ET.Element, ns: dict[str, str]) -> dict[str, dict]:
    """Build a rich type registry from the CODESYS TypeList.

    Stores typeclass, iecname, basetype, pouclass, and for structs/FBs
    the list of UserDefElement children. For enums, stores the value mapping.
    """
    ns_prefix = "{" + ns["sc"] + "}" if ns.get("sc") else ""
    registry: dict[str, dict] = {}
    for tel in type_list:
        tname = tel.get("name", "")
        info: dict = {
            "typeclass": tel.get("typeclass", ""),
            "iecname": tel.get("iecname", ""),
            "basetype": tel.get("basetype", ""),
            "pouclass": tel.get("pouclass", ""),
        }
        # Collect struct/FB/enum fields (try namespaced first, then bare)
        elements = tel.findall(f"{ns_prefix}UserDefElement") if ns_prefix else tel.findall("UserDefElement")
        if not elements:
            elements = tel.findall("UserDefElement")
        if elements:
            info["elements"] = []
            for el in elements:
                elem: dict = {
                    "iecname": el.get("iecname", ""),
                    "type": el.get("type", ""),
                    "access": el.get("access", "ReadWrite"),
                    "vartype": el.get("vartype", ""),
                }
                # Enum value entries have enumvalue attribute
                ev = el.get("enumvalue")
                if ev is not None:
                    elem["enumvalue"] = ev
                info["elements"].append(elem)
        registry[tname] = info
    return registry


def _codesys_get_enum_mapping(type_name: str, registry: dict[str, dict]) -> dict[str, str] | None:
    """Extract enum value-to-label mapping from the type registry."""
    info = registry.get(type_name)
    if not info or info.get("typeclass") != "Enum":
        return None
    elements = info.get("elements", [])
    if not elements:
        return None
    mapping: dict[str, str] = {}
    for el in elements:
        ev = el.get("enumvalue")
        label = el.get("iecname", "")
        if ev is not None and label:
            mapping[str(ev)] = label
    return mapping if mapping else None


def _codesys_resolve_type(
    type_name: str,
    registry: dict[str, dict],
    _depth: int = 0,
) -> TagDataType:
    """Resolve a CODESYS type name to an HMI TagDataType."""
    if _depth > 10:
        return TagDataType.FLOAT
    info = registry.get(type_name)
    if not info:
        return TagDataType.FLOAT
    tc = info.get("typeclass", "")
    # Direct primitive mapping
    if tc in CODESYS_TYPE_MAP:
        return CODESYS_TYPE_MAP[tc]
    # Enum -> resolve base type (always int-backed)
    if tc == "Enum":
        return TagDataType.INT
    return TagDataType.FLOAT


def _codesys_expand_type(
    type_name: str,
    path_parts: list[str],
    access: str,
    registry: dict[str, dict],
    group: str | None,
    _depth: int = 0,
) -> list[dict]:
    """Expand a complex CODESYS type (struct/FB) into flattened tag dicts.

    For primitive types and enums, returns a single tag entry.
    For structs/FBs, recursively expands each UserDefElement field.
    Arrays are expanded element-by-element up to a reasonable limit.
    """
    if _depth > 10:
        return []

    info = registry.get(type_name, {})
    tc = info.get("typeclass", "")
    pouclass = info.get("pouclass", "")

    # Structs and Function Blocks: expand each field
    if tc == "Userdef" and pouclass in ("STRUCTURE", "FUNCTION_BLOCK"):
        elements = info.get("elements", [])
        if not elements:
            return []
        tags: list[dict] = []
        for el in elements:
            field_name = el.get("iecname", "")
            field_type = el.get("type", "")
            field_access = el.get("access", access)
            if not field_name or not field_type:
                continue
            child_path = path_parts + [field_name]
            tags.extend(_codesys_expand_type(
                field_type, child_path, field_access, registry, group, _depth + 1
            ))
        return tags

    # Arrays: expand with index suffixes
    if tc == "Array":
        base = info.get("basetype", "")
        iecname = info.get("iecname", "")
        # Parse array bounds from iecname like "ARRAY [0..10] OF TIME"
        import re
        m = re.search(r"\[(\d+)\.\.(\d+)\]", iecname)
        if m and base:
            lo, hi = int(m.group(1)), int(m.group(2))
            # Cap expansion to avoid huge arrays
            if (hi - lo) > 50:
                return []
            tags = []
            for idx in range(lo, hi + 1):
                child_path = path_parts[:-1] + [f"{path_parts[-1]}[{idx}]"] if path_parts else [f"[{idx}]"]
                tags.extend(_codesys_expand_type(
                    base, child_path, access, registry, group, _depth + 1
                ))
            return tags
        return []

    # Enum: single tag with enum_mapping
    if tc == "Enum":
        access_mode = TagAccessMode.READ_WRITE
        if access == "Read":
            access_mode = TagAccessMode.READ
        elif access == "Write":
            access_mode = TagAccessMode.WRITE
        return [{
            "name": ".".join(path_parts),
            "display_name": None,
            "group": group,
            "data_type": TagDataType.INT,
            "access_mode": access_mode,
            "enum_mapping": _codesys_get_enum_mapping(type_name, registry),
        }]

    # Primitive: single tag
    data_type = _codesys_resolve_type(type_name, registry)
    access_mode = TagAccessMode.READ_WRITE
    if access == "Read":
        access_mode = TagAccessMode.READ
    elif access == "Write":
        access_mode = TagAccessMode.WRITE
    return [{
        "name": ".".join(path_parts),
        "display_name": None,
        "group": group,
        "data_type": data_type,
        "access_mode": access_mode,
    }]


def _codesys_parse_nodes(
    node_el: ET.Element,
    path_parts: list[str],
    registry: dict[str, dict],
    ns: dict[str, str],
    group: str | None = None,
    address_parts: list[str] | None = None,
) -> list[dict]:
    """Recursively walk CODESYS Node elements, collecting leaf tags.

    Container nodes (with child <Node> elements) are not included in the tag
    name — only leaf variable names form the dot-path.  This strips OPC-UA
    prefixes like Application, GVL names (Globals, HMIData, IO), etc.
    The most recent container name is passed as *group* for categorisation.

    *address_parts* accumulates the full container hierarchy for building
    OPC UA addresses (e.g. ``HMIData.auxIOSource.Physical``).
    """
    if address_parts is None:
        address_parts = []
    tags: list[dict] = []
    name = node_el.get("name", "")
    type_attr = node_el.get("type")
    access = node_el.get("access", "ReadWrite")

    children = node_el.findall("sc:Node", ns) if ns else node_el.findall("Node")
    if children:
        # Container node — recurse without adding this node's name to the tag path,
        # but DO accumulate it in address_parts for OPC UA addressing
        child_address = address_parts + ([name] if name else [])
        for child in children:
            tags.extend(_codesys_parse_nodes(
                child, path_parts, registry, ns, group=name, address_parts=child_address,
            ))
    elif type_attr:
        # Leaf node — only leaf names form the tag path
        current_path = path_parts + [name] if name else path_parts

        comment_el = node_el.find("sc:Comment", ns) if ns else node_el.find("Comment")
        display_name = comment_el.text.strip() if comment_el is not None and comment_el.text else None

        expanded = _codesys_expand_type(
            type_attr, current_path, access, registry, group
        )

        # Build OPC UA address for each expanded tag from the container
        # hierarchy (address_parts) plus the tag's own dot-path name
        for tag in expanded:
            tag["address"] = ".".join(address_parts + [tag["name"]])

        # Apply the node-level comment as display name to all expanded tags
        # (only if they don't already have one, and only for single-expansion)
        if display_name and len(expanded) == 1:
            expanded[0]["display_name"] = display_name
        elif display_name and expanded:
            # For struct expansion, set display name on the first field
            expanded[0]["display_name"] = display_name

        tags.extend(expanded)

    return tags


@router.post("/import/codesys")
async def import_tags_codesys(
    body: dict,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    """Import tags from a CODESYS symbol configuration XML string.

    Body: {"xml": "...", "prefix": "", "names": [...], "data_source_id": int,
           "on_conflict": "skip"|"update", "update_fields": ["address", ...]}
    """
    xml_str = body.get("xml", "")
    prefix = body.get("prefix", "")
    selected_names = body.get("names")
    ds_id = body.get("data_source_id")
    on_conflict = body.get("on_conflict", "skip")
    update_fields = set(body.get("update_fields", []))
    if ds_id is not None:
        ds = await session.get(DataSource, ds_id)
        if not ds:
            raise HTTPException(status_code=400, detail=f"Data source {ds_id} not found")
    if not xml_str:
        raise HTTPException(status_code=400, detail="Missing 'xml' in body")

    try:
        parsed_tags = _parse_codesys_xml(xml_str, prefix)
    except ET.ParseError as e:
        raise HTTPException(status_code=400, detail=f"Invalid XML: {e}")

    if not parsed_tags:
        raise HTTPException(status_code=400, detail="No NodeList found in XML")

    if selected_names is not None:
        name_set = set(selected_names)
        parsed_tags = [t for t in parsed_tags if t["name"] in name_set]

    import_names = [td["name"] for td in parsed_tags]
    existing_q = await session.execute(select(Tag).where(Tag.name.in_(import_names)))
    existing_map = {t.name: t for t in existing_q.scalars().all()}

    created, updated, skipped = [], [], []
    for td in parsed_tags:
        enum_mapping_raw = td.get("enum_mapping")
        enum_json = json.dumps(enum_mapping_raw) if enum_mapping_raw else None
        existing = existing_map.get(td["name"])
        if existing:
            if on_conflict != "update":
                skipped.append(existing)
                continue
            if not update_fields or "display_name" in update_fields:
                existing.display_name = td.get("display_name") or existing.display_name
            if not update_fields or "data_type" in update_fields:
                existing.data_type = TagDataType(td["data_type"])
            if not update_fields or "access_mode" in update_fields:
                existing.access_mode = TagAccessMode(td["access_mode"])
            if not update_fields or "address" in update_fields:
                existing.address = td.get("address") or existing.address
            if not update_fields or "enum_mapping" in update_fields:
                existing.enum_mapping = enum_json if enum_json is not None else existing.enum_mapping
            if ds_id is not None:
                existing.data_source_id = ds_id
            updated.append(existing)
        else:
            tag = Tag(
                name=td["name"],
                display_name=td.get("display_name"),
                data_type=TagDataType(td["data_type"]),
                access_mode=TagAccessMode(td["access_mode"]),
                enum_mapping=enum_json,
                address=td.get("address"),
                data_source_id=ds_id,
            )
            session.add(tag)
            created.append(tag)

    await session.flush()
    for tag in created:
        await session.refresh(tag)
    for tag in created + updated:
        tag_engine.register_tag(tag)
    return {"imported": len(created), "updated": len(updated), "skipped": len(skipped)}


# ─── RSLogix 500 CSV Import ───

RSLOGIX_FILE_TYPE_MAP: dict[str, TagDataType] = {
    "B": TagDataType.BOOL,
    "N": TagDataType.INT,
    "F": TagDataType.FLOAT,
    "T": TagDataType.INT,
    "C": TagDataType.INT,
    "R": TagDataType.INT,
    "S": TagDataType.STRING,
    "ST": TagDataType.STRING,
    "O": TagDataType.INT,
    "I": TagDataType.INT,
    "L": TagDataType.INT,
    "A": TagDataType.INT,
}

RSLOGIX_GROUP_MAP: dict[str, str] = {
    "B": "Bits", "N": "Integers", "F": "Floats",
    "T": "Timers", "C": "Counters", "R": "Control",
    "O": "Outputs", "I": "Inputs", "S": "Status",
    "ST": "Strings", "L": "Long Integers", "A": "ASCII",
}


def _rslogix_parse_address(address: str) -> tuple[str, str]:
    """Extract file type letter and base address from RSLogix 500 address.

    e.g. 'B3:0/1' -> ('B', 'B3:0/1'), 'N7:0' -> ('N', 'N7:0'), 'F8:0' -> ('F', 'F8:0')
    """
    file_letter = ""
    for ch in address:
        if ch.isalpha():
            file_letter += ch
        else:
            break
    return file_letter.upper(), address


def _rslogix_build_display_name(fields: list[str]) -> str:
    """Build display name from RSLogix 500 CSV descriptor columns (columns 3-7)."""
    parts = [f.strip().strip('"') for f in fields if f.strip().strip('"')]
    return " ".join(parts)


@router.post("/import/rslogix500")
async def import_tags_rslogix500(
    body: dict,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    """Import tags from RSLogix 500 CSV export.

    Body: {"csv": "...", "prefix": "", "names": [...], "data_source_id": int,
           "on_conflict": "skip"|"update", "update_fields": ["address", ...]}
    """
    csv_str = body.get("csv", "")
    prefix = body.get("prefix", "")
    selected_names = body.get("names")
    ds_id = body.get("data_source_id")
    on_conflict = body.get("on_conflict", "skip")
    update_fields = set(body.get("update_fields", []))
    if ds_id is not None:
        ds = await session.get(DataSource, ds_id)
        if not ds:
            raise HTTPException(status_code=400, detail=f"Data source {ds_id} not found")
    if not csv_str:
        raise HTTPException(status_code=400, detail="Missing 'csv' in body")

    parsed_tags = _parse_rslogix500_csv(csv_str, prefix)
    if selected_names is not None:
        name_set = set(selected_names)
        parsed_tags = [t for t in parsed_tags if t["name"] in name_set]

    import_names = [td["name"] for td in parsed_tags]
    existing_q = await session.execute(select(Tag).where(Tag.name.in_(import_names)))
    existing_map = {t.name: t for t in existing_q.scalars().all()}

    created, updated, skipped = [], [], []
    for td in parsed_tags:
        existing = existing_map.get(td["name"])
        if existing:
            if on_conflict != "update":
                skipped.append(existing)
                continue
            if not update_fields or "display_name" in update_fields:
                existing.display_name = td.get("display_name") or existing.display_name
            if not update_fields or "data_type" in update_fields:
                existing.data_type = TagDataType(td["data_type"])
            if not update_fields or "access_mode" in update_fields:
                existing.access_mode = TagAccessMode(td["access_mode"])
            if not update_fields or "address" in update_fields:
                existing.address = td.get("address") or existing.address
            if ds_id is not None:
                existing.data_source_id = ds_id
            updated.append(existing)
        else:
            tag = Tag(
                name=td["name"],
                display_name=td.get("display_name"),
                data_type=TagDataType(td["data_type"]),
                access_mode=TagAccessMode(td["access_mode"]),
                address=td.get("address"),
                data_source_id=ds_id,
            )
            session.add(tag)
            created.append(tag)

    await session.flush()
    for tag in created:
        await session.refresh(tag)
    for tag in created + updated:
        tag_engine.register_tag(tag)
    return {"imported": len(created), "updated": len(updated), "skipped": len(skipped)}


# ─── Import Preview Endpoints ───

def _parse_codesys_xml(xml_str: str, prefix: str = "") -> list[dict]:
    """Parse CODESYS XML and return list of tag dicts (no DB operations)."""
    root = ET.fromstring(xml_str)
    ns: dict[str, str] = CODESYS_NS
    type_list = root.find("sc:TypeList", ns)
    if type_list is None:
        ns = {}
        type_list = root.find("TypeList")

    registry: dict[str, dict] = {}
    if type_list is not None:
        registry = _codesys_build_type_registry(type_list, ns if ns else {})

    node_list = root.find("sc:NodeList", ns) or root.find("NodeList")
    if node_list is None:
        return []

    parsed: list[dict] = []
    ns_or_empty = ns if ns else {}
    for top_node in (node_list.findall("sc:Node", ns) if ns else node_list.findall("Node")):
        # Skip the top-level container name (typically "Application") from OPC UA
        # address paths — the driver's address_prefix already includes it.
        top_children = top_node.findall("sc:Node", ns) if ns else top_node.findall("Node")
        if top_children:
            top_name = top_node.get("name", "")
            for child in top_children:
                parsed.extend(_codesys_parse_nodes(
                    child, [], registry, ns_or_empty, group=top_name, address_parts=[],
                ))
        else:
            parsed.extend(_codesys_parse_nodes(
                top_node, [], registry, ns_or_empty, address_parts=[],
            ))

    result = []
    for td in parsed:
        tag_name = f"{prefix}.{td['name']}" if prefix else td["name"]
        enum_mapping = td.get("enum_mapping")
        result.append({
            "name": tag_name,
            "display_name": td.get("display_name"),
            "group": td.get("group"),
            "data_type": td["data_type"].value,
            "access_mode": td["access_mode"].value,
            "address": td.get("address"),
            "enum_mapping": enum_mapping,
            "has_enum": bool(enum_mapping),
            "enum_values": len(enum_mapping) if enum_mapping else 0,
        })
    return result


def _parse_rslogix500_csv(csv_str: str, prefix: str = "") -> list[dict]:
    """Parse RSLogix 500 CSV and return list of tag dicts (no DB operations)."""
    lines = csv_str.strip().split("\n")
    result: list[dict] = []
    seen_names: set[str] = set()

    for line in lines:
        line = line.strip()
        if not line:
            continue
        fields: list[str] = []
        current = ""
        in_quotes = False
        for ch in line:
            if ch == '"':
                in_quotes = not in_quotes
            elif ch == ',' and not in_quotes:
                fields.append(current)
                current = ""
                continue
            current += ch
        fields.append(current)

        if len(fields) < 3:
            continue
        address = fields[0].strip()
        if not address or address.startswith("DFILE") or address.startswith("PFILE"):
            continue

        symbol = fields[2].strip().strip('"')
        display_name = _rslogix_build_display_name(fields[3:8]) if len(fields) > 3 else ""
        file_letter, _ = _rslogix_parse_address(address)
        data_type = RSLOGIX_FILE_TYPE_MAP.get(file_letter, TagDataType.INT)

        tag_name = symbol if symbol else address
        tag_name = tag_name.replace("/", "_").replace(":", "_").replace(".", "_")
        if tag_name in seen_names:
            continue
        seen_names.add(tag_name)
        if not symbol and not display_name:
            continue

        full_name = f"{prefix}.{tag_name}" if prefix else tag_name
        result.append({
            "name": full_name,
            "display_name": display_name or None,
            "group": RSLOGIX_GROUP_MAP.get(file_letter, "Other"),
            "data_type": data_type.value,
            "access_mode": TagAccessMode.READ_WRITE.value,
            "address": address,
        })
    return result


@router.post("/import/codesys/preview")
async def preview_codesys_import(
    body: dict,
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    """Preview tags that would be imported from CODESYS XML without creating them."""
    xml_str = body.get("xml", "")
    prefix = body.get("prefix", "")
    if not xml_str:
        raise HTTPException(status_code=400, detail="Missing 'xml' in body")
    try:
        tags = _parse_codesys_xml(xml_str, prefix)
    except ET.ParseError as e:
        raise HTTPException(status_code=400, detail=f"Invalid XML: {e}")
    # Group summary
    groups: dict[str, int] = {}
    enum_count = 0
    for t in tags:
        g = t.get("group") or "Ungrouped"
        groups[g] = groups.get(g, 0) + 1
        if t.get("has_enum"):
            enum_count += 1
    return {"total": len(tags), "tags": tags, "groups": groups, "enum_count": enum_count}


@router.post("/import/rslogix500/preview")
async def preview_rslogix500_import(
    body: dict,
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    """Preview tags that would be imported from RSLogix 500 CSV without creating them."""
    csv_str = body.get("csv", "")
    prefix = body.get("prefix", "")
    if not csv_str:
        raise HTTPException(status_code=400, detail="Missing 'csv' in body")
    tags = _parse_rslogix500_csv(csv_str, prefix)
    groups: dict[str, int] = {}
    for t in tags:
        g = t.get("group") or "Ungrouped"
        groups[g] = groups.get(g, 0) + 1
    return {"total": len(tags), "tags": tags, "groups": groups}


# ─── Rename Tag References in Screen Layouts ───

# Top-level widget fields that hold tag names
_WIDGET_TAG_FIELDS = {"visibleTag", "enabledTag"}
# Props fields that hold tag names (simple string values)
_PROPS_TAG_FIELDS = {"tag", "availabilityTag", "performanceTag", "qualityTag", "oeeTag"}
# Props fields that are arrays of objects with a .tag field
_PROPS_TAG_ARRAY_FIELDS = {"controls", "tags"}


def _rename_tag_in_widget(widget: dict, old_name: str, new_name: str) -> bool:
    """Replace old_name with new_name in a widget's tag fields. Returns True if changed."""
    changed = False
    for field in _WIDGET_TAG_FIELDS:
        if widget.get(field) == old_name:
            widget[field] = new_name
            changed = True
    props = widget.get("props", {})
    for field in _PROPS_TAG_FIELDS:
        if props.get(field) == old_name:
            props[field] = new_name
            changed = True
    for field in _PROPS_TAG_ARRAY_FIELDS:
        arr = props.get(field)
        if isinstance(arr, list):
            for item in arr:
                if isinstance(item, dict) and item.get("tag") == old_name:
                    item["tag"] = new_name
                    changed = True
    return changed


@router.post("/rename-references")
async def rename_tag_references(
    body: dict,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    """Update all screen widget references from old_name to new_name.

    Body: {"old_name": "X", "new_name": "Y"}
    """
    old_name = body.get("old_name", "")
    new_name = body.get("new_name", "")
    if not old_name or not new_name or old_name == new_name:
        raise HTTPException(status_code=400, detail="old_name and new_name are required and must differ")

    # Only load screens whose layout JSON contains the old tag name
    result = await session.execute(
        select(Screen).where(Screen.layout.contains(old_name))
    )
    screens = result.scalars().all()

    updated_screens = 0
    for screen in screens:
        try:
            widgets = json.loads(screen.layout)
        except (json.JSONDecodeError, TypeError):
            continue
        if not isinstance(widgets, list):
            continue
        screen_changed = False
        for widget in widgets:
            if _rename_tag_in_widget(widget, old_name, new_name):
                screen_changed = True
        if screen_changed:
            screen.layout = json.dumps(widgets)
            updated_screens += 1

    return {"updated_screens": updated_screens}


# ─── Bulk Tag Operations ───


class BulkTagIds(BaseModel):
    tag_ids: list[int]


class BulkLabelOp(BaseModel):
    tag_ids: list[int]
    label_ids: list[int]


class BulkFieldUpdate(BaseModel):
    tag_ids: list[int]
    fields: dict[str, object]


@router.post("/bulk/delete", status_code=status.HTTP_200_OK)
async def bulk_delete_tags(
    body: BulkTagIds,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    if not body.tag_ids:
        return {"deleted": 0}
    result = await session.execute(select(Tag).where(Tag.id.in_(body.tag_ids)))
    tags_to_delete = [t for t in result.scalars().all() if not t.is_system]
    for tag in tags_to_delete:
        await session.delete(tag)
        tag_engine.unregister_tag(tag.name)
    await session.flush()
    return {"deleted": len(tags_to_delete)}


@router.post("/bulk/add-labels", status_code=status.HTTP_200_OK)
async def bulk_add_labels(
    body: BulkLabelOp,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    if not body.tag_ids or not body.label_ids:
        return {"updated": 0}
    result = await session.execute(
        select(Tag).options(selectinload(Tag.labels)).where(Tag.id.in_(body.tag_ids))
    )
    tags = result.scalars().all()
    label_result = await session.execute(select(TagLabel).where(TagLabel.id.in_(body.label_ids)))
    labels = label_result.scalars().all()
    count = 0
    for tag in tags:
        for label in labels:
            if label not in tag.labels:
                tag.labels.append(label)
                count += 1
    await session.flush()
    return {"updated": count}


@router.post("/bulk/remove-labels", status_code=status.HTTP_200_OK)
async def bulk_remove_labels(
    body: BulkLabelOp,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    if not body.tag_ids or not body.label_ids:
        return {"updated": 0}
    result = await session.execute(
        select(Tag).options(selectinload(Tag.labels)).where(Tag.id.in_(body.tag_ids))
    )
    tags = result.scalars().all()
    label_result = await session.execute(select(TagLabel).where(TagLabel.id.in_(body.label_ids)))
    labels = label_result.scalars().all()
    count = 0
    for tag in tags:
        for label in labels:
            if label in tag.labels:
                tag.labels.remove(label)
                count += 1
    await session.flush()
    return {"updated": count}


@router.post("/bulk/update", status_code=status.HTTP_200_OK)
async def bulk_update_tags(
    request: Request,
    body: BulkFieldUpdate,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    if not body.tag_ids or not body.fields:
        return {"updated": 0}
    allowed = {
        "data_type", "access_mode", "engineering_units",
        "display_format", "min_value", "max_value", "deadband",
        "trending_enabled", "trending_sample_rate_ms",
        "alarm_enabled", "simulation_enabled",
        "simulation_behavior", "data_source_id", "alarm_config",
    }
    fields = {k: v for k, v in body.fields.items() if k in allowed}
    if not fields:
        return {"updated": 0}
    # alarm_config is handled specially: merge provided keys into each tag's
    # existing config so that bulk-edit of e.g. severity does not wipe the
    # tag's existing message or help settings.
    alarm_config_patch = None
    if "alarm_config" in fields:
        raw = fields.pop("alarm_config")
        if isinstance(raw, dict):
            alarm_config_patch = raw
        elif isinstance(raw, str):
            try:
                alarm_config_patch = json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                pass
    result = await session.execute(select(Tag).where(Tag.id.in_(body.tag_ids)))
    tags = [t for t in result.scalars().all() if not t.is_system]
    for tag in tags:
        for key, val in fields.items():
            setattr(tag, key, val)
        if alarm_config_patch is not None:
            existing = {}
            if tag.alarm_config:
                try:
                    existing = json.loads(tag.alarm_config) if isinstance(tag.alarm_config, str) else tag.alarm_config
                except (json.JSONDecodeError, TypeError):
                    pass
            existing.update(alarm_config_patch)
            tag.alarm_config = json.dumps(existing)
        tag_engine.register_tag(tag)
    await session.flush()
    reload_alarms = "alarm_enabled" in fields or alarm_config_patch is not None
    reload_trends = any(k in fields for k in ("trending_enabled", "trending_sample_rate_ms", "deadband"))
    if reload_alarms or reload_trends:
        await session.commit()
    if reload_alarms:
        await request.app.state.alarm_service.reload_alarm_configs()
    if reload_trends:
        await request.app.state.trend_service.reload_trending_tags()
    return {"updated": len(tags)}


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


# ─── Tag Labels ───


class LabelCreate(BaseModel):
    name: str
    color: str | None = None
    description: str | None = None


@router.get("/labels", response_model=list[TagLabelOut])
async def list_labels(session: AsyncSession = Depends(get_db)):
    result = await session.execute(select(TagLabel).order_by(TagLabel.name))
    return result.scalars().all()


@router.post("/labels", response_model=TagLabelOut, status_code=status.HTTP_201_CREATED)
async def create_label(
    body: LabelCreate,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    label = TagLabel(**body.model_dump())
    session.add(label)
    await session.flush()
    return label


@router.put("/labels/{label_id}", response_model=TagLabelOut)
async def update_label(
    label_id: int,
    body: LabelCreate,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    label = await session.get(TagLabel, label_id)
    if not label:
        raise HTTPException(status_code=404, detail="Label not found")
    label.name = body.name
    label.color = body.color
    label.description = body.description
    await session.flush()
    return label


@router.delete("/labels/{label_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_label(
    label_id: int,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    label = await session.get(TagLabel, label_id)
    if not label:
        raise HTTPException(status_code=404, detail="Label not found")
    await session.delete(label)


@router.post("/{tag_id}/labels/{label_id}", status_code=status.HTTP_204_NO_CONTENT)
async def assign_label(
    tag_id: int,
    label_id: int,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    tag = await session.get(Tag, tag_id)
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    label = await session.get(TagLabel, label_id)
    if not label:
        raise HTTPException(status_code=404, detail="Label not found")
    if label not in tag.labels:
        tag.labels.append(label)
        await session.flush()


@router.delete("/{tag_id}/labels/{label_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_label(
    tag_id: int,
    label_id: int,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    tag = await session.get(Tag, tag_id)
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    label = await session.get(TagLabel, label_id)
    if not label:
        raise HTTPException(status_code=404, detail="Label not found")
    if label in tag.labels:
        tag.labels.remove(label)
        await session.flush()
