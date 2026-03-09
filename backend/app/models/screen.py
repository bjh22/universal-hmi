"""
Database models for HMI screens, screen versions (history), and screen templates.
Screens are the visual pages that operators interact with — each screen contains
a layout of widgets (gauges, buttons, indicators) defined as JSON.
"""

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Screen(Base):
    __tablename__ = "screens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    # slug: a URL-friendly name (e.g., "main-overview") used in the browser's
    # address bar instead of numeric IDs, making URLs human-readable.
    slug: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    # The widget layout is stored as a JSON string. This is flexible — the frontend
    # can evolve the layout format (add new widget types, properties) without
    # requiring database schema changes or migrations.
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


# ScreenVersion provides a version history for every screen save, enabling
# rollback to previous layouts. Each time a screen is updated, the old layout
# is copied here before the new one is written (see screens.py update_screen).
class ScreenVersion(Base):
    __tablename__ = "screen_versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # CASCADE: if the parent screen is deleted, its version history is deleted too
    screen_id: Mapped[int] = mapped_column(ForeignKey("screens.id", ondelete="CASCADE"), nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    layout: Mapped[str] = mapped_column(Text, nullable=False)
    saved_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    saved_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )


# Screen templates are reusable screen layouts with placeholder bindings.
# For example, a "Motor Control" template can be instantiated for each motor
# on the factory floor, with placeholders replaced by actual tag names.
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
