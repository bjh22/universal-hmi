"""
FastAPI router for Cognex DataMan integration-specific endpoints.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from app.api.deps import require_role
from app.models.user import User, UserRole

if TYPE_CHECKING:
    from app.integrations.cognex_dataman.integration import CognexDataManIntegration


def create_router(integration: "CognexDataManIntegration") -> APIRouter:
    """Factory: create a router bound to a specific integration instance."""
    router = APIRouter(
        prefix="/api/integrations/dataman",
        tags=["integrations-dataman"],
    )

    def _check_connected():
        if not integration.connected:
            raise HTTPException(status_code=503, detail="Camera not connected")

    @router.get("/status")
    async def get_status():
        return await integration.get_full_status()

    @router.get("/image")
    async def get_image():
        image_bytes, mime_type = integration.get_last_image()
        if image_bytes is None:
            raise HTTPException(status_code=404, detail="No image available")
        return Response(content=image_bytes, media_type=mime_type)

    @router.post("/trigger")
    async def send_trigger(
        _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
    ):
        _check_connected()
        await integration.trigger()
        return {"ok": True}

    return router
