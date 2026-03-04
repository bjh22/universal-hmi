import enum
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class TagDataType(str, enum.Enum):
    BOOL = "bool"
    INT = "int"
    FLOAT = "float"
    STRING = "string"


class TagAccessMode(str, enum.Enum):
    READ = "read"
    WRITE = "write"
    READ_WRITE = "read_write"


class SimulationBehavior(str, enum.Enum):
    STATIC = "static"
    RAMP = "ramp"
    SINE = "sine"
    RANDOM = "random"
    TOGGLE = "toggle"
    ENUM_CYCLE = "enum_cycle"
    SCRIPT = "script"


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(300), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    group_name: Mapped[str | None] = mapped_column(String(200), nullable=True)

    data_source_id: Mapped[int | None] = mapped_column(
        ForeignKey("data_sources.id"), nullable=True
    )
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)

    data_type: Mapped[TagDataType] = mapped_column(
        Enum(TagDataType), nullable=False, default=TagDataType.FLOAT
    )
    access_mode: Mapped[TagAccessMode] = mapped_column(
        Enum(TagAccessMode), nullable=False, default=TagAccessMode.READ
    )

    engineering_units: Mapped[str | None] = mapped_column(String(50), nullable=True)
    display_format: Mapped[str | None] = mapped_column(String(50), nullable=True)
    min_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    deadband: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Trending
    trending_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    trending_sample_rate_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Alarm config (JSON-encoded)
    alarm_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    alarm_config: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Simulation
    simulation_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    simulation_behavior: Mapped[SimulationBehavior | None] = mapped_column(
        Enum(SimulationBehavior), nullable=True
    )
    simulation_config: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Enum mapping (JSON-encoded: {"0": "Stopped", "1": "Running", ...})
    enum_mapping: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Template reference
    template_id: Mapped[int | None] = mapped_column(
        ForeignKey("tag_templates.id"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class TagTemplate(Base):
    __tablename__ = "tag_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # JSON array of field definitions: [{"name": "Speed", "data_type": "float", ...}]
    fields: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
