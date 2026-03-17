"""
Database models for alarms and alarm history. The Alarm table tracks currently
active alarms; AlarmHistory stores completed alarm records for compliance and
post-incident analysis. In industrial systems, alarm management is critical
for safety — operators must be notified of abnormal conditions promptly.
"""

import enum
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AlarmSeverity(str, enum.Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


# The four states of the alarm state machine (see alarm_service.py for transition logic):
#   active_unacked   — alarm triggered, operator hasn't acknowledged it yet
#   active_acked     — alarm still active, but operator has acknowledged awareness
#   inactive_unacked — alarm condition cleared, but operator hasn't acknowledged yet
#   inactive         — fully resolved (cleared and acknowledged)
class AlarmState(str, enum.Enum):
    ACTIVE_UNACKED = "active_unacked"
    ACTIVE_ACKED = "active_acked"
    INACTIVE_UNACKED = "inactive_unacked"
    INACTIVE = "inactive"


class Alarm(Base):
    __tablename__ = "alarms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # ForeignKey links this alarm to the tag that triggered it
    tag_id: Mapped[int] = mapped_column(ForeignKey("tags.id"), nullable=False, index=True)
    message: Mapped[str] = mapped_column(String(500), nullable=False)
    severity: Mapped[AlarmSeverity] = mapped_column(Enum(AlarmSeverity), nullable=False)
    state: Mapped[AlarmState] = mapped_column(
        Enum(AlarmState), default=AlarmState.ACTIVE_UNACKED, index=True
    )
    triggered_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    acknowledged_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    cleared_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    trigger_value: Mapped[str | None] = mapped_column(String(100), nullable=True)


# AlarmHistory is a denormalized copy — it stores tag_name directly instead of
# just tag_id, so historical records remain readable even if the original tag
# is deleted or renamed later. This is important for compliance audits that
# may look back months or years after the fact.
class AlarmHistory(Base):
    __tablename__ = "alarm_history"
    __table_args__ = (
        Index("ix_alarm_history_tag_name", "tag_name"),
        Index("ix_alarm_history_triggered_at", "triggered_at"),
        Index("ix_alarm_history_cleared_at", "cleared_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # Not a ForeignKey — intentionally decoupled so history survives tag deletion
    tag_id: Mapped[int] = mapped_column(Integer, nullable=False)
    tag_name: Mapped[str] = mapped_column(String(300), nullable=False)
    tag_display_name: Mapped[str | None] = mapped_column(String(300), nullable=True)
    message: Mapped[str] = mapped_column(String(500), nullable=False)
    severity: Mapped[AlarmSeverity] = mapped_column(Enum(AlarmSeverity), nullable=False)
    triggered_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    acknowledged_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    cleared_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    trigger_value: Mapped[str | None] = mapped_column(String(100), nullable=True)
    clear_value: Mapped[str | None] = mapped_column(String(100), nullable=True)
