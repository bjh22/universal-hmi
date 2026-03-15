"""Media API — upload, serve, and manage fault help images (GIF, PNG, JPG, WEBP)."""

import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.api.deps import require_role
from app.models.user import UserRole

router = APIRouter(prefix="/api/media", tags=["media"])

from app.core.paths import data_dir
MEDIA_DIR = data_dir() / "media" / "fault_help"
ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


class MediaUploadResponse(BaseModel):
    media_id: str
    url: str


class MediaItem(BaseModel):
    media_id: str
    url: str
    size: int


@router.post("/upload", response_model=MediaUploadResponse)
async def upload_media(
    file: UploadFile = File(...),
    _user=Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    """Upload a fault help image. Requires engineer or designer role."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{ext}' not allowed. Use: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 10 MB)")

    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    media_id = f"{uuid.uuid4().hex[:12]}{ext}"
    file_path = MEDIA_DIR / media_id
    file_path.write_bytes(content)

    return MediaUploadResponse(media_id=media_id, url=f"/api/media/{media_id}")


@router.get("/", response_model=list[MediaItem])
async def list_media(
    _user=Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    """List all uploaded fault help images."""
    if not MEDIA_DIR.exists():
        return []
    items = []
    for f in sorted(MEDIA_DIR.iterdir()):
        if f.is_file() and f.suffix.lower() in ALLOWED_EXTENSIONS:
            items.append(MediaItem(
                media_id=f.name,
                url=f"/api/media/{f.name}",
                size=f.stat().st_size,
            ))
    return items


@router.get("/{media_id}")
async def get_media(media_id: str):
    """Serve a fault help image. No auth required (operators need to see these)."""
    # Path traversal protection
    if "/" in media_id or "\\" in media_id or ".." in media_id:
        raise HTTPException(status_code=400, detail="Invalid media ID")

    file_path = MEDIA_DIR / media_id
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Media not found")

    ext = file_path.suffix.lower()
    mime_types = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
    }
    return FileResponse(file_path, media_type=mime_types.get(ext, "application/octet-stream"))


@router.delete("/{media_id}")
async def delete_media(
    media_id: str,
    _user=Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    """Delete a fault help image. Requires engineer or designer role."""
    if "/" in media_id or "\\" in media_id or ".." in media_id:
        raise HTTPException(status_code=400, detail="Invalid media ID")

    file_path = MEDIA_DIR / media_id
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Media not found")

    os.remove(file_path)
    return {"ok": True}
