from datetime import datetime, timezone

from sqlalchemy import DateTime, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class DowntimeAnnotation(Base):
    __tablename__ = "downtime_annotations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    alarm_history_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tag_name: Mapped[str] = mapped_column(String(300), nullable=False)
    start_time: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    end_time: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reason_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    reason_text: Mapped[str | None] = mapped_column(String(500), nullable=True)
    annotated_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    annotated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (
        Index("ix_downtime_annotations_time_range", "start_time", "end_time"),
        Index("ix_downtime_annotations_alarm_history_id", "alarm_history_id"),
    )
