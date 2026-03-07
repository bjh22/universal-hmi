"""
Industrial HMI — FastAPI Application
"""

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api import alarms, audit, auth, datasources, integrations, jobs, machine_profiles, production, projects, screens, scripts, tags, trends, users
from app.api.websocket import router as ws_router
from app.core.config import settings
from app.core.database import async_session, init_db
from app.drivers.driver_manager import driver_manager
from app.integrations.manager import IntegrationManager
from app.models.integration import Integration  # noqa: F401 — ensure table creation
from app.services.alarm_service import AlarmService
from app.services.tag_engine import tag_engine
from app.services.trend_service import TrendService

logging.basicConfig(level=logging.INFO if not settings.debug else logging.DEBUG)
logger = logging.getLogger(__name__)

alarm_service = AlarmService(tag_engine, async_session)
trend_service = TrendService(tag_engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info(f"Starting {settings.app_name} v{settings.app_version}")
    await init_db()

    async with async_session() as session:
        await tag_engine.load_tags(session)
        await alarm_service.load_alarm_configs(session)
        await trend_service.load_trending_tags(session)
        await driver_manager.load_and_connect(session)

    tag_engine.set_driver_manager(driver_manager)
    app.state.alarm_service = alarm_service

    # Integration system
    integration_manager = IntegrationManager(tag_engine, async_session)
    integration_manager.discover()
    await integration_manager.load_and_start(app)
    app.state.integration_manager = integration_manager

    await tag_engine.start_simulation()
    await alarm_service.start()
    await trend_service.start()
    logger.info("All services started")

    yield

    # Shutdown
    logger.info("Shutting down services")
    await integration_manager.stop_all()
    await tag_engine.stop_simulation()
    await alarm_service.stop()
    await trend_service.stop()
    await driver_manager.disconnect_all()


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
)

# CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routes
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(tags.router)
app.include_router(datasources.router)
app.include_router(alarms.router)
app.include_router(trends.router)
app.include_router(jobs.router)
app.include_router(screens.router)
app.include_router(audit.router)
app.include_router(production.router)
app.include_router(scripts.router)
app.include_router(projects.router)
app.include_router(machine_profiles.router)
app.include_router(integrations.router)
app.include_router(ws_router)


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "app": settings.app_name,
        "version": settings.app_version,
    }


# Serve frontend static files in production
_static_dir = Path(__file__).resolve().parent.parent / "static"
if _static_dir.is_dir():
    app.mount("/assets", StaticFiles(directory=_static_dir / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve the React SPA for all non-API routes."""
        file_path = _static_dir / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(_static_dir / "index.html")
