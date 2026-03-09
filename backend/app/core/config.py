import logging
from pydantic_settings import BaseSettings
from pathlib import Path

_logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    app_name: str = "Industrial HMI"
    app_version: str = "0.1.0"
    debug: bool = False

    # Database
    database_url: str = "sqlite+aiosqlite:///./hmi.db"

    # Authentication
    secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 480
    auto_logout_minutes: int = 30

    # WebSocket
    ws_update_interval_ms: int = 500

    # Server
    host: str = "0.0.0.0"
    port: int = 8080

    # Data retention (days)
    trend_retention_days: int = 90
    audit_retention_days: int = 365
    alarm_retention_days: int = 365

    # Scripting
    script_timeout_seconds: int = 5

    model_config = {"env_prefix": "HMI_", "env_file": ".env"}


settings = Settings()

if settings.secret_key == "change-me-in-production":
    _logger.warning(
        "SECURITY WARNING: Using default JWT secret key. "
        "Set HMI_SECRET_KEY environment variable for production deployments."
    )
