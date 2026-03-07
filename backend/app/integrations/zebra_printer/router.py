"""
FastAPI router for Zebra printer integration-specific endpoints.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.deps import require_role
from app.models.user import User, UserRole

if TYPE_CHECKING:
    from app.integrations.zebra_printer.integration import ZebraPrinterIntegration


class ZplBody(BaseModel):
    zpl: str


class SpeedBody(BaseModel):
    speed: int


class DarknessBody(BaseModel):
    darkness: int


def create_router(integration: "ZebraPrinterIntegration") -> APIRouter:
    """Factory: create a router bound to a specific integration instance."""
    router = APIRouter(
        prefix="/api/integrations/zebra",
        tags=["integrations-zebra"],
    )

    def _check_connected():
        if not integration.connected:
            raise HTTPException(status_code=503, detail="Printer not connected")

    @router.get("/status")
    async def get_status():
        return await integration.get_full_status()

    @router.post("/test-label")
    async def send_test_label(
        _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
    ):
        _check_connected()
        await integration.send_test_label()
        return {"ok": True}

    @router.post("/send-zpl")
    async def send_zpl(
        body: ZplBody,
        _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
    ):
        _check_connected()
        await integration.send_zpl(body.zpl)
        return {"ok": True}

    @router.post("/speed")
    async def set_speed(
        body: SpeedBody,
        _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
    ):
        _check_connected()
        if not 2 <= body.speed <= 14:
            raise HTTPException(400, "Speed must be 2-14")
        await integration.set_print_speed(body.speed)
        return {"ok": True, "speed": body.speed}

    @router.post("/darkness")
    async def set_darkness(
        body: DarknessBody,
        _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
    ):
        _check_connected()
        if not 0 <= body.darkness <= 30:
            raise HTTPException(400, "Darkness must be 0-30")
        await integration.set_darkness(body.darkness)
        return {"ok": True, "darkness": body.darkness}

    @router.get("/info")
    async def get_info(
        _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
    ):
        _check_connected()
        return await integration.get_printer_info()

    return router
