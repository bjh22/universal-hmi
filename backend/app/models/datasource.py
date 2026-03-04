import enum
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ProtocolType(str, enum.Enum):
    OPCUA = "opcua"
    ETHERNET_IP = "ethernet_ip"
    MODBUS_TCP = "modbus_tcp"
    MQTT = "mqtt"
    SIMULATION = "simulation"


class DataSource(Base):
    __tablename__ = "data_sources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    protocol: Mapped[ProtocolType] = mapped_column(Enum(ProtocolType), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    # Connection parameters (JSON-encoded for protocol-specific config)
    config: Mapped[str] = mapped_column(Text, nullable=False, default="{}")

    # Connection state (not persisted via DB, tracked in memory; stored for UI display)
    connected: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
