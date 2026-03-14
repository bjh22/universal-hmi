"""
ZPL Preview API — render ZPL text or files to PNG images.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from app.api.deps import require_role
from app.models.user import User, UserRole
from app.services.zpl_renderer import render_zpl

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/zpl-preview", tags=["zpl-preview"])

MAX_ZPL_SIZE = 512 * 1024  # 512 KB


class RenderRequest(BaseModel):
    zpl: str
    dpi: int = 203
    width_dots: int | None = None


@router.post("/render")
async def render_from_text(
    body: RenderRequest,
    _user: User = Depends(require_role(UserRole.OPERATOR, UserRole.SUPERVISOR, UserRole.ENGINEER, UserRole.DESIGNER)),
) -> Response:
    """Render ZPL text to a PNG image."""
    if len(body.zpl) > MAX_ZPL_SIZE:
        raise HTTPException(status_code=400, detail="ZPL text exceeds maximum size (512 KB)")
    if not body.zpl.strip():
        raise HTTPException(status_code=400, detail="ZPL text is empty")

    try:
        png_bytes = render_zpl(body.zpl, dpi=body.dpi, width_dots=body.width_dots)
    except Exception as e:
        logger.exception("ZPL render failed")
        raise HTTPException(status_code=500, detail=f"Render failed: {e}")

    return Response(content=png_bytes, media_type="image/png")


@router.post("/render-file")
async def render_from_file(
    file: UploadFile,
    dpi: int = Form(203),
    width_dots: int | None = Form(None),
    _user: User = Depends(require_role(UserRole.OPERATOR, UserRole.SUPERVISOR, UserRole.ENGINEER, UserRole.DESIGNER)),
) -> Response:
    """Render an uploaded ZPL file to a PNG image."""
    if file.filename and not file.filename.lower().endswith((".zpl", ".txt", ".prn")):
        raise HTTPException(status_code=400, detail="File must be .zpl, .txt, or .prn")

    content = await file.read()
    if len(content) > MAX_ZPL_SIZE:
        raise HTTPException(status_code=400, detail="File exceeds maximum size (512 KB)")

    try:
        zpl_text = content.decode("utf-8", errors="replace")
    except Exception:
        raise HTTPException(status_code=400, detail="Could not decode file as text")

    if not zpl_text.strip():
        raise HTTPException(status_code=400, detail="File is empty")

    try:
        png_bytes = render_zpl(zpl_text, dpi=dpi, width_dots=width_dots)
    except Exception as e:
        logger.exception("ZPL file render failed")
        raise HTTPException(status_code=500, detail=f"Render failed: {e}")

    return Response(content=png_bytes, media_type="image/png")
