import enum
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AlarmSeverity(str, enum.Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class AlarmState(str, enum.Enum):
    ACTIVE_UNACKED = "active_unacked"
    ACTIVE_ACKED = "active_acked"
    INACTIVE_UNACKED = "inactive_unacked"
    INACTIVE = "inactive"


class Alarm(Base):
    __tablename__ = "alarms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tag_id: Mapped[int] = mapped_column(ForeignKey("tags.id"), nullable=False)
    message: Mapped[str] = mapped_column(String(500), nullable=False)
    severity: Mapped[AlarmSeverity] = mapped_column(Enum(AlarmSeverity), nullable=False)
    state: Mapped[AlarmState] = mapped_column(
        Enum(AlarmState), default=AlarmState.ACTIVE_UNACKED
    )
    triggered_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    acknowledged_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    cleared_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    trigger_value: Mapped[str | None] = mapped_column(String(100), nullable=True)


class AlarmHistory(Base):
    __tablename__ = "alarm_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tag_id: Mapped[int] = mapped_column(Integer, nullable=False)
    tag_name: Mapped[str] = mapped_column(String(300), nullable=False)
    message: Mapped[str] = mapped_column(String(500), nullable=False)
    severity: Mapped[AlarmSeverity] = mapped_column(Enum(AlarmSeverity), nullable=False)
    triggered_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    acknowledged_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    cleared_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    trigger_value: Mapped[str | None] = mapped_column(String(100), nullable=True)
    clear_value: Mapped[str | None] = mapped_column(String(100), nullable=True)
