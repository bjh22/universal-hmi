from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Screen(Base):
    __tablename__ = "screens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    # JSON: full screen layout definition (widgets, positions, bindings)
    layout: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    version: Mapped[int] = mapped_column(Integer, default=1)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    layout_mode: Mapped[str] = mapped_column(String(20), nullable=False, default="absolute")
    # JSON: {"width": 1920, "height": 1080} or null for grid mode
    target_resolution: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class ScreenVersion(Base):
    __tablename__ = "screen_versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    screen_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    layout: Mapped[str] = mapped_column(Text, nullable=False)
    saved_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    saved_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )


class ScreenTemplate(Base):
    __tablename__ = "screen_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # JSON: layout with placeholder bindings
    layout: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    # JSON: placeholder definitions [{"key": "motor", "label": "Motor Tag Prefix"}]
    placeholders: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
