import enum
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AuditAction(str, enum.Enum):
    CONTROL_WRITE = "control_write"
    JOB_DOWNLOAD = "job_download"
    JOB_UPLOAD = "job_upload"
    JOB_CREATE = "job_create"
    JOB_UPDATE = "job_update"
    JOB_DELETE = "job_delete"
    ALARM_ACK = "alarm_ack"
    LOGIN = "login"
    LOGOUT = "logout"
    USER_CREATE = "user_create"
    USER_UPDATE = "user_update"
    USER_DELETE = "user_delete"
    SCREEN_SAVE = "screen_save"
    SCREEN_DELETE = "screen_delete"
    CONFIG_CHANGE = "config_change"
    SCRIPT_EXECUTE = "script_execute"
    PRODUCTION_START = "production_start"
    PRODUCTION_STOP = "production_stop"
    PRODUCTION_UPDATE = "production_update"
    PRODUCTION_DELETE = "production_delete"


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, index=True, default=lambda: datetime.now(timezone.utc)
    )
    user: Mapped[str | None] = mapped_column(String(100), nullable=True)
    action: Mapped[AuditAction] = mapped_column(Enum(AuditAction), nullable=False)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_ip: Mapped[str | None] = mapped_column(String(50), nullable=True)
