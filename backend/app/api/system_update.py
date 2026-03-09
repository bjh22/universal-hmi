"""
System Update API — Upload and apply HMI software update packages.

Accepts .tar.gz or .zip deployment archives (produced by deploy.sh).
Extracts the package, validates structure, replaces application code
and frontend assets, and triggers a process restart.

Data preservation:
  - .env (configuration) is NEVER overwritten
  - data/hmi.db (database: trends, jobs, screens, alarms, users, audit) is NEVER touched
  - venv/ is updated only if new wheels are bundled
"""

import asyncio
import hashlib
import logging
import os
import platform
import shutil
import signal
import subprocess
import sys
import tarfile
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_role
from app.core.config import settings
from app.core.database import get_db
from app.models.user import User, UserRole
from app.services.audit_service import log_audit
from app.models.audit import AuditAction

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/system", tags=["system"])

# The install root is the directory containing run.py (one level above app/)
_app_root = Path(__file__).resolve().parent.parent.parent  # backend/


class SystemInfoResponse(BaseModel):
    app_version: str
    platform: str
    python_version: str
    install_path: str
    database_path: str
    uptime_seconds: float | None = None

    model_config = {"from_attributes": True}


class UpdateValidation(BaseModel):
    valid: bool
    version: str | None = None
    has_backend: bool = False
    has_frontend: bool = False
    has_wheels: bool = False
    has_windows_wheels: bool = False
    file_count: int = 0
    package_size_mb: float = 0.0
    error: str | None = None


class UpdateResult(BaseModel):
    success: bool
    message: str
    updated_backend: bool = False
    updated_frontend: bool = False
    updated_dependencies: bool = False
    restart_scheduled: bool = False


_start_time = datetime.now(timezone.utc)


def _get_db_path() -> str:
    """Extract the database file path from the connection URL."""
    url = settings.database_url
    if ":///" in url:
        return url.split(":///", 1)[1]
    return "hmi.db"


def _compute_sha256(path: Path) -> str:
    """Compute SHA-256 hash of a file."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def _find_release_root(extract_dir: Path) -> Path | None:
    """
    Find the actual release root inside an extracted archive.

    Archives may have a top-level directory (e.g. hmi-release/) or
    the files may be directly at the extract root. We look for the
    backend/ directory which is the definitive marker.
    """
    # Direct extraction
    if (extract_dir / "backend" / "app").is_dir():
        return extract_dir

    # One-level nested (e.g. hmi-release/)
    for child in extract_dir.iterdir():
        if child.is_dir() and (child / "backend" / "app").is_dir():
            return child

    return None


def _validate_package(release_root: Path, archive_size: int) -> UpdateValidation:
    """Validate an extracted update package."""
    has_backend = (release_root / "backend" / "app").is_dir()
    has_frontend = (release_root / "backend" / "static" / "index.html").is_file()
    has_wheels = (release_root / "wheels").is_dir()
    has_windows_wheels = (release_root / "wheels-windows").is_dir()

    file_count = sum(1 for _ in release_root.rglob("*") if _.is_file())

    if not has_backend:
        return UpdateValidation(
            valid=False,
            error="Invalid package: missing backend/app/ directory",
            package_size_mb=round(archive_size / (1024 * 1024), 1),
        )

    return UpdateValidation(
        valid=True,
        has_backend=has_backend,
        has_frontend=has_frontend,
        has_wheels=has_wheels,
        has_windows_wheels=has_windows_wheels,
        file_count=file_count,
        package_size_mb=round(archive_size / (1024 * 1024), 1),
    )


@router.get("/info", response_model=SystemInfoResponse)
async def get_system_info(
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    """Get current system information."""
    now = datetime.now(timezone.utc)
    uptime = (now - _start_time).total_seconds()

    return SystemInfoResponse(
        app_version=settings.app_version,
        platform=f"{platform.system()} {platform.release()} ({platform.machine()})",
        python_version=platform.python_version(),
        install_path=str(_app_root),
        database_path=_get_db_path(),
        uptime_seconds=round(uptime, 1),
    )


@router.post("/update/validate")
async def validate_update_package(
    file: UploadFile,
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
) -> UpdateValidation:
    """
    Upload and validate an update package without applying it.

    Accepts .tar.gz or .zip files produced by deploy.sh.
    Returns validation results so the user can review before applying.
    """
    if not file.filename:
        raise HTTPException(400, "No file provided")

    filename = file.filename.lower()
    if not (filename.endswith(".tar.gz") or filename.endswith(".zip")):
        raise HTTPException(400, "Package must be a .tar.gz or .zip file")

    # Save uploaded file to temp
    with tempfile.TemporaryDirectory(prefix="hmi_update_") as tmp_dir:
        tmp_path = Path(tmp_dir) / file.filename
        content = await file.read()
        tmp_path.write_bytes(content)

        extract_dir = Path(tmp_dir) / "extracted"
        extract_dir.mkdir()

        try:
            if filename.endswith(".tar.gz"):
                with tarfile.open(tmp_path, "r:gz") as tf:
                    tf.extractall(extract_dir)
            else:
                with zipfile.ZipFile(tmp_path, "r") as zf:
                    zf.extractall(extract_dir)
        except Exception as e:
            return UpdateValidation(
                valid=False,
                error=f"Failed to extract archive: {e}",
                package_size_mb=round(len(content) / (1024 * 1024), 1),
            )

        release_root = _find_release_root(extract_dir)
        if release_root is None:
            return UpdateValidation(
                valid=False,
                error="Invalid package structure: cannot find backend/app/ directory",
                package_size_mb=round(len(content) / (1024 * 1024), 1),
            )

        return _validate_package(release_root, len(content))


@router.post("/update/apply", response_model=UpdateResult)
async def apply_update_package(
    file: UploadFile,
    request: Request,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
) -> UpdateResult:
    """
    Upload and apply an update package.

    This endpoint:
    1. Extracts and validates the package
    2. Backs up current app/ and static/ directories
    3. Replaces backend code and frontend assets
    4. Installs new Python dependencies if wheels are included
    5. Schedules a process restart (handled by systemd/NSSM)

    PRESERVED (never overwritten):
    - .env configuration file
    - data/ directory (database with trends, jobs, screens, alarms, etc.)
    - venv/ (only updated if new wheels are present)
    """
    if not file.filename:
        raise HTTPException(400, "No file provided")

    filename = file.filename.lower()
    if not (filename.endswith(".tar.gz") or filename.endswith(".zip")):
        raise HTTPException(400, "Package must be a .tar.gz or .zip file")

    # Read the upload
    content = await file.read()
    archive_size = len(content)

    source_ip = request.client.host if request.client else None

    # Extract to temp directory
    tmp_dir = tempfile.mkdtemp(prefix="hmi_update_")
    try:
        tmp_path = Path(tmp_dir) / file.filename
        tmp_path.write_bytes(content)

        extract_dir = Path(tmp_dir) / "extracted"
        extract_dir.mkdir()

        if filename.endswith(".tar.gz"):
            with tarfile.open(tmp_path, "r:gz") as tf:
                tf.extractall(extract_dir)
        else:
            with zipfile.ZipFile(tmp_path, "r") as zf:
                zf.extractall(extract_dir)

        release_root = _find_release_root(extract_dir)
        if release_root is None:
            raise HTTPException(400, "Invalid package: cannot find backend/app/ directory")

        validation = _validate_package(release_root, archive_size)
        if not validation.valid:
            raise HTTPException(400, validation.error or "Invalid package")

        updated_backend = False
        updated_frontend = False
        updated_deps = False

        # --- Update backend code ---
        if validation.has_backend:
            new_app_dir = release_root / "backend" / "app"
            target_app_dir = _app_root / "app"

            # Backup current app directory
            backup_dir = _app_root / "_app_backup"
            if backup_dir.exists():
                shutil.rmtree(backup_dir)
            if target_app_dir.exists():
                shutil.copytree(target_app_dir, backup_dir)

            try:
                # Remove current and copy new
                if target_app_dir.exists():
                    shutil.rmtree(target_app_dir)
                shutil.copytree(new_app_dir, target_app_dir)
                updated_backend = True
                logger.info("Backend code updated successfully")
            except Exception as e:
                # Rollback on failure
                logger.error(f"Backend update failed, rolling back: {e}")
                if target_app_dir.exists():
                    shutil.rmtree(target_app_dir)
                if backup_dir.exists():
                    shutil.copytree(backup_dir, target_app_dir)
                raise HTTPException(500, f"Backend update failed (rolled back): {e}")

            # Copy run.py and requirements.txt if present
            for extra_file in ["run.py", "requirements.txt"]:
                src = release_root / "backend" / extra_file
                if src.is_file():
                    shutil.copy2(src, _app_root / extra_file)

        # --- Update frontend ---
        if validation.has_frontend:
            new_static = release_root / "backend" / "static"
            target_static = _app_root / "static"

            backup_static = _app_root / "_static_backup"
            if backup_static.exists():
                shutil.rmtree(backup_static)
            if target_static.exists():
                shutil.copytree(target_static, backup_static)

            try:
                if target_static.exists():
                    shutil.rmtree(target_static)
                shutil.copytree(new_static, target_static)
                updated_frontend = True
                logger.info("Frontend assets updated successfully")
            except Exception as e:
                logger.error(f"Frontend update failed, rolling back: {e}")
                if target_static.exists():
                    shutil.rmtree(target_static)
                if backup_static.exists():
                    shutil.copytree(backup_static, target_static)
                raise HTTPException(500, f"Frontend update failed (rolled back): {e}")

        # --- Update Python dependencies ---
        if validation.has_wheels:
            venv_dir = _app_root / "venv"
            if venv_dir.is_dir():
                # Determine the correct pip path
                if platform.system() == "Windows":
                    pip_path = venv_dir / "Scripts" / "pip.exe"
                else:
                    pip_path = venv_dir / "bin" / "pip"

                wheels_dir = release_root / "wheels"

                # Use Windows-specific wheels if available on Windows
                if platform.system() == "Windows" and validation.has_windows_wheels:
                    wheels_dir = release_root / "wheels-windows"

                req_file = _app_root / "requirements.txt"
                if pip_path.is_file() and req_file.is_file():
                    try:
                        result = subprocess.run(
                            [
                                str(pip_path), "install",
                                "--no-index",
                                f"--find-links={wheels_dir}",
                                "-r", str(req_file),
                            ],
                            capture_output=True,
                            text=True,
                            timeout=120,
                        )
                        if result.returncode == 0:
                            updated_deps = True
                            logger.info("Dependencies updated successfully")
                        else:
                            logger.warning(f"Dependency update had issues: {result.stderr}")
                    except Exception as e:
                        logger.warning(f"Dependency update failed (non-fatal): {e}")

        # Log the update in audit trail
        details = f"Software update applied from {file.filename} ({validation.package_size_mb} MB)"
        if updated_backend:
            details += " [backend updated]"
        if updated_frontend:
            details += " [frontend updated]"
        if updated_deps:
            details += " [dependencies updated]"
        await log_audit(session, AuditAction.CONFIG_CHANGE, user.username, details, source_ip)
        await session.commit()

        # Schedule restart after response is sent
        restart_scheduled = False
        if updated_backend or updated_frontend:
            restart_scheduled = True
            asyncio.get_event_loop().call_later(2.0, _trigger_restart)

        return UpdateResult(
            success=True,
            message="Update applied successfully" + (". Restarting in 2 seconds..." if restart_scheduled else ""),
            updated_backend=updated_backend,
            updated_frontend=updated_frontend,
            updated_dependencies=updated_deps,
            restart_scheduled=restart_scheduled,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update failed: {e}")
        raise HTTPException(500, f"Update failed: {e}")
    finally:
        # Clean up temp directory (best effort, may fail if still in use)
        try:
            shutil.rmtree(tmp_dir, ignore_errors=True)
        except Exception:
            pass


def _trigger_restart():
    """Trigger a process restart. systemd/NSSM will restart the service automatically."""
    logger.info("Restarting HMI service after software update...")
    os.kill(os.getpid(), signal.SIGTERM)
