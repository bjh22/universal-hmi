"""
Centralized application configuration using pydantic-settings.

All settings can be overridden via environment variables prefixed with HMI_
(e.g., HMI_SECRET_KEY, HMI_PORT) or through a .env file — no code changes
needed. This is a 12-factor app best practice: keep config in the environment.
"""

import logging
import subprocess
from pydantic_settings import BaseSettings

from app.core.paths import data_dir

_logger = logging.getLogger(__name__)


def _dev_version() -> str:
    """Build a dev version string from git branch + last commit date."""
    try:
        branch = subprocess.check_output(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            stderr=subprocess.DEVNULL, text=True,
        ).strip()
        commit_date = subprocess.check_output(
            ["git", "log", "-1", "--format=%cs"],
            stderr=subprocess.DEVNULL, text=True,
        ).strip()
        return f"dev ({branch}@{commit_date})"
    except Exception:
        return "dev"


# BaseSettings (from pydantic-settings) automatically reads environment
# variables and converts them to the declared Python types. For example,
# the env var HMI_ACCESS_TOKEN_EXPIRE_MINUTES="480" (a string) becomes
# the integer 480. Invalid values raise clear validation errors at startup.
class Settings(BaseSettings):
    app_name: str = "Industrial HMI"
    app_version: str = _dev_version()
    debug: bool = False

    # Database — resolve relative to the backend/ directory so the same DB is used
    # regardless of which directory the server is launched from.
    database_url: str = f"sqlite+aiosqlite:///{data_dir() / 'hmi.db'}"

    # Authentication
    # IMPORTANT: The default secret_key is only for development convenience.
    # In production, always set HMI_SECRET_KEY to a long random string —
    # anyone who knows this key can forge authentication tokens.
    secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 480  # 8 hours — a typical factory shift
    auto_logout_minutes: int = 30

    # WebSocket
    ws_update_interval_ms: int = 500  # How often tag values are pushed to clients

    # Server
    host: str = "0.0.0.0"  # Listen on all network interfaces
    port: int = 8080

    # Data retention (days) — older records are purged automatically
    trend_retention_days: int = 90
    audit_retention_days: int = 365
    alarm_retention_days: int = 365

    # Projects — override to point at a shared git repo (e.g., a cloned hmi-projects repo)
    projects_dir: str | None = None

    # Scripting
    script_timeout_seconds: int = 5  # Max execution time for user scripts

    # env_prefix: look for HMI_* environment variables (e.g., HMI_PORT=9000)
    # env_file: check both backend/.env and project-root .env so it works
    # regardless of whether the server is started from backend/ or the project root
    model_config = {"env_prefix": "HMI_", "env_file": [".env", "../.env"]}


# Create a single global instance — imported by other modules as `settings`
settings = Settings()

# Warn developers who forgot to set a real secret key. This runs once at
# import time so the warning appears immediately in the server logs.
if settings.secret_key == "change-me-in-production":
    _logger.warning(
        "SECURITY WARNING: Using default JWT secret key. "
        "Set HMI_SECRET_KEY environment variable for production deployments."
    )
