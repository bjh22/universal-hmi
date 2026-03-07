from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class MachineProfile(Base):
    __tablename__ = "machine_profiles"
    __table_args__ = (
        UniqueConstraint("project_id", "name", name="uq_profile_project_name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # JSON: {"MainPLC": {"config": {"host": "192.168.1.100", "port": 502}}}
    data_source_overrides: Mapped[str] = mapped_column(
        Text, nullable=False, default="{}"
    )

    # JSON: {"Machine.Speed": {"address": "DB100.DBD0"}}
    tag_overrides: Mapped[str] = mapped_column(Text, nullable=False, default="{}")

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
