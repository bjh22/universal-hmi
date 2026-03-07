import json
import xml.etree.ElementTree as ET

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_role
from app.core.database import get_db
from app.models.tag import Tag, TagAccessMode, TagDataType, TagLabel, TagTemplate
from app.models.user import User, UserRole
from app.services.tag_engine import tag_engine

router = APIRouter(prefix="/api/tags", tags=["tags"])


class TagCreate(BaseModel):
    name: str
    description: str | None = None
    long_description: str | None = None
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


class TagLabelOut(BaseModel):
    id: int
    name: str
    color: str | None
    description: str | None

    model_config = {"from_attributes": True}


class TagOut(BaseModel):
    id: int
    name: str
    description: str | None
    long_description: str | None
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
    labels: list[TagLabelOut] = []

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
    await session.refresh(tag, ["labels"])
    tag_engine.register_tag(tag)
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
    await session.refresh(tag, ["labels"])
    tag_engine.register_tag(tag)
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
):
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
        created.append(tag)
    await session.flush()
    for tag in created:
        await session.refresh(tag)
        tag_engine.register_tag(tag)
    return {"imported": len(created), "names": [t.name for t in created]}


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


def _codesys_resolve_typeclass(type_name: str, type_map: dict[str, dict]) -> str | None:
    """Resolve a CODESYS type name to its typeclass via the TypeList."""
    info = type_map.get(type_name)
    if not info:
        return None
    tc = info.get("typeclass")
    if tc and tc != "Enum":
        return tc
    # Enums map to their base type
    if tc == "Enum":
        base = info.get("basetype")
        if base:
            return _codesys_resolve_typeclass(base, type_map)
    return tc


def _codesys_parse_nodes(
    node_el: ET.Element,
    path_parts: list[str],
    type_map: dict[str, dict],
    ns: dict[str, str],
) -> list[dict]:
    """Recursively walk CODESYS Node elements, collecting leaf tags."""
    tags: list[dict] = []
    name = node_el.get("name", "")
    current_path = path_parts + [name] if name else path_parts
    type_attr = node_el.get("type")
    access = node_el.get("access", "ReadWrite")

    children = node_el.findall("sc:Node", ns) if ns else node_el.findall("Node")
    if not children and type_attr:
        # Check if this is a struct with child fields via type_map
        type_info = type_map.get(type_attr, {})
        typeclass = type_info.get("typeclass")

        # Skip complex FB types and arrays
        if typeclass in ("Array",) or (
            typeclass == "Userdef"
            and type_info.get("pouclass") == "STRUCTURE"
        ):
            return tags

        resolved = _codesys_resolve_typeclass(type_attr, type_map)
        data_type = CODESYS_TYPE_MAP.get(resolved or "", TagDataType.FLOAT)

        access_mode = TagAccessMode.READ_WRITE
        if access == "Read":
            access_mode = TagAccessMode.READ
        elif access == "Write":
            access_mode = TagAccessMode.WRITE

        tag_name = ".".join(current_path)
        comment_el = node_el.find("sc:Comment", ns) if ns else node_el.find("Comment")
        description = comment_el.text.strip() if comment_el is not None and comment_el.text else None

        # Use second path part as group (first is usually "Application")
        group = current_path[1] if len(current_path) > 2 else None

        tags.append({
            "name": tag_name,
            "description": description,
            "group_name": group,
            "data_type": data_type,
            "access_mode": access_mode,
        })
    else:
        for child in children:
            tags.extend(_codesys_parse_nodes(child, current_path, type_map, ns))

    return tags


@router.post("/import/codesys")
async def import_tags_codesys(
    body: dict,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    """Import tags from a CODESYS symbol configuration XML string.

    Body: {"xml": "<Symbolconfiguration>...</Symbolconfiguration>", "prefix": "optional_prefix"}
    """
    xml_str = body.get("xml", "")
    prefix = body.get("prefix", "")
    if not xml_str:
        raise HTTPException(status_code=400, detail="Missing 'xml' in body")

    try:
        root = ET.fromstring(xml_str)
    except ET.ParseError as e:
        raise HTTPException(status_code=400, detail=f"Invalid XML: {e}")

    # Build type lookup from TypeList
    type_map: dict[str, dict] = {}
    ns = CODESYS_NS
    type_list = root.find("sc:TypeList", ns)
    if type_list is None:
        # Try without namespace
        ns = {}
        type_list = root.find("TypeList")

    if type_list is not None:
        for tel in type_list:
            tname = tel.get("name", "")
            type_map[tname] = {
                "typeclass": tel.get("typeclass", ""),
                "iecname": tel.get("iecname", ""),
                "basetype": tel.get("basetype", ""),
                "pouclass": tel.get("pouclass", ""),
            }

    # Walk NodeList
    node_list = root.find("sc:NodeList", ns) or root.find("NodeList")
    if node_list is None:
        raise HTTPException(status_code=400, detail="No NodeList found in XML")

    parsed_tags: list[dict] = []
    for top_node in (node_list.findall("sc:Node", ns) if ns else node_list.findall("Node")):
        parsed_tags.extend(_codesys_parse_nodes(top_node, [], type_map, ns if ns else {}))

    created = []
    for td in parsed_tags:
        tag_name = f"{prefix}.{td['name']}" if prefix else td["name"]
        tag = Tag(
            name=tag_name,
            description=td.get("description"),
            group_name=td.get("group_name"),
            data_type=td["data_type"],
            access_mode=td["access_mode"],
        )
        session.add(tag)
        created.append(tag)

    await session.flush()
    for tag in created:
        await session.refresh(tag)
        tag_engine.register_tag(tag)
    return {"imported": len(created), "names": [t.name for t in created]}


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


def _rslogix_build_description(fields: list[str]) -> str:
    """Build description from RSLogix 500 CSV descriptor columns (columns 3-7)."""
    parts = [f.strip().strip('"') for f in fields if f.strip().strip('"')]
    return " ".join(parts)


@router.post("/import/rslogix500")
async def import_tags_rslogix500(
    body: dict,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    """Import tags from RSLogix 500 CSV export.

    Body: {"csv": "raw CSV text", "prefix": "optional_prefix"}

    RSLogix 500 CSV format (no header row):
    address, scope, symbol, desc1, desc2, desc3, desc4, desc5, ...
    """
    csv_str = body.get("csv", "")
    prefix = body.get("prefix", "")
    if not csv_str:
        raise HTTPException(status_code=400, detail="Missing 'csv' in body")

    lines = csv_str.strip().split("\n")
    parsed_tags: list[dict] = []
    seen_names: set[str] = set()

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Split CSV fields (respecting quoted fields)
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
        if not address:
            continue

        # Skip data file descriptors (DFILE, PFILE) and header-only entries
        if address.startswith("DFILE") or address.startswith("PFILE"):
            continue

        symbol = fields[2].strip().strip('"')
        description = _rslogix_build_description(fields[3:8]) if len(fields) > 3 else ""

        file_letter, _ = _rslogix_parse_address(address)
        data_type = RSLOGIX_FILE_TYPE_MAP.get(file_letter, TagDataType.INT)

        # Use symbol as tag name if available, otherwise use address
        tag_name = symbol if symbol else address
        # Replace characters not suitable for tag names
        tag_name = tag_name.replace("/", "_").replace(":", "_").replace(".", "_")

        if tag_name in seen_names:
            continue
        seen_names.add(tag_name)

        # Skip entries with no symbol and no description (metadata rows)
        if not symbol and not description:
            continue

        # Determine group from file type
        group_map: dict[str, str] = {
            "B": "Bits", "N": "Integers", "F": "Floats",
            "T": "Timers", "C": "Counters", "R": "Control",
            "O": "Outputs", "I": "Inputs", "S": "Status",
            "ST": "Strings", "L": "Long Integers", "A": "ASCII",
        }
        group = group_map.get(file_letter, "Other")

        parsed_tags.append({
            "name": tag_name,
            "description": description or None,
            "group_name": group,
            "data_type": data_type,
            "access_mode": TagAccessMode.READ_WRITE,
            "address": address,
        })

    created = []
    for td in parsed_tags:
        tag_name = f"{prefix}.{td['name']}" if prefix else td["name"]
        tag = Tag(
            name=tag_name,
            description=td.get("description"),
            group_name=td.get("group_name"),
            data_type=td["data_type"],
            access_mode=td["access_mode"],
            address=td.get("address"),
        )
        session.add(tag)
        created.append(tag)

    await session.flush()
    for tag in created:
        await session.refresh(tag)
        tag_engine.register_tag(tag)
    return {"imported": len(created), "names": [t.name for t in created]}


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
