"""
Industrial HMI — FastAPI Application

This is the application entry point that wires everything together: routes,
middleware, services, and static file serving.  FastAPI is created here,
configured with all API routers, and given a "lifespan" that controls what
happens when the server starts up and shuts down.
"""

import logging
# asynccontextmanager lets us write a single function that handles both
# startup (before yield) and shutdown (after yield) logic for the app.
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api import alarms, audit, auth, branding, datasources, integrations, jobs, logs, machine_profiles, preferences, production, production_settings, projects, reason_codes, screens, scripts, service_config, system_update, tags, trends, users, zpl_preview
from app.api.websocket import router as ws_router
from app.core.config import settings
from app.core.database import async_session, init_db
from app.drivers.driver_manager import driver_manager
from app.integrations.manager import IntegrationManager
from app.models.app_setting import AppSetting  # noqa: F401 — ensure table creation
from app.models.integration import Integration  # noqa: F401 — ensure table creation
from app.models.reason_code import ReasonCode  # noqa: F401 — ensure table creation
from app.services.alarm_service import AlarmService
from app.services.tag_engine import tag_engine
from app.services.production_service import ProductionService
from app.services.script_engine import shutdown_executor as shutdown_script_executor
from app.services.trend_service import TrendService

logging.basicConfig(level=logging.INFO if not settings.debug else logging.DEBUG)

# Attach in-memory log handler for the Support > Logs page
from app.services.log_service import log_handler as _log_handler
_log_handler.setFormatter(logging.Formatter('%(message)s'))
logging.getLogger().addHandler(_log_handler)

logger = logging.getLogger(__name__)

alarm_service = AlarmService(tag_engine, async_session)
trend_service = TrendService(tag_engine)
production_service = ProductionService(tag_engine, alarm_service, async_session)


# FastAPI's "lifespan" pattern: an async context manager that replaces the older
# @app.on_event("startup") / @app.on_event("shutdown") decorators.
# Everything before `yield` runs once at startup; everything after runs at shutdown.
@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Startup ---
    logger.info(f"Starting {settings.app_name} v{settings.app_version}")

    # Initialization order matters — each service depends on the previous ones:
    # 1. Database tables must exist before we can query anything
    await init_db()

    async with async_session() as session:
        # 1.5. Ensure system tags exist in DB (before loading into engine)
        await tag_engine.ensure_system_tags(session)
        await session.commit()

    async with async_session() as session:
        # 2. Tags first — they're the central data model everything else references
        await tag_engine.load_tags(session)
        # 3. Alarms and trends depend on tags being loaded
        await alarm_service.load_alarm_configs(session)
        await trend_service.load_trending_tags(session)
        # 4. Protocol drivers connect to external equipment (PLC, MQTT, etc.)
        await driver_manager.load_and_connect(session)

    tag_engine.set_driver_manager(driver_manager)
    # Attach services to app.state so route handlers can access them
    app.state.alarm_service = alarm_service
    app.state.trend_service = trend_service
    app.state.production_service = production_service

    # Integration system
    integration_manager = IntegrationManager(tag_engine, async_session)
    integration_manager.discover()
    await integration_manager.load_and_start(app)
    app.state.integration_manager = integration_manager

    # 5. Start background tasks last — simulation generates tag values,
    #    alarms evaluate them, trends record them
    await tag_engine.start_simulation()
    await alarm_service.start()
    await trend_service.start()
    await production_service.start()
    logger.info("All services started")

    yield  # App is running and serving requests while we "pause" here

    # --- Shutdown (runs when the server receives SIGTERM/SIGINT) ---
    # Stop services gracefully so background tasks finish cleanly
    logger.info("Shutting down services")
    await integration_manager.stop_all()
    await production_service.stop()
    await tag_engine.stop_simulation()
    await alarm_service.stop()
    await trend_service.stop()
    await driver_manager.disconnect_all()
    shutdown_script_executor()


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
)

# CORS (Cross-Origin Resource Sharing) middleware.
# Browsers block requests from one origin (e.g., localhost:5173) to another
# (localhost:8080) by default for security. This middleware tells the browser
# "it's OK, allow these cross-origin requests."
# allow_origins=["*"] means "allow any origin" — fine for development, but in
# production you'd restrict this to your actual domain.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routers — FastAPI's way of organizing endpoints into separate
# files. Each router handles one resource (auth, tags, screens, etc.) so this
# file stays clean while the actual endpoint logic lives in app/api/*.py.
app.include_router(auth.router)
app.include_router(branding.router)
app.include_router(preferences.router)
app.include_router(users.router)
app.include_router(tags.router)
app.include_router(datasources.router)
app.include_router(alarms.router)
app.include_router(trends.router)
app.include_router(jobs.router)
app.include_router(screens.router)
app.include_router(audit.router)
app.include_router(production.router)
app.include_router(production_settings.router)
app.include_router(reason_codes.router)
app.include_router(scripts.router)
app.include_router(projects.router)
app.include_router(machine_profiles.router)
app.include_router(service_config.router)
app.include_router(integrations.router)
app.include_router(system_update.router)
app.include_router(logs.router)
app.include_router(zpl_preview.router)
app.include_router(ws_router)


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "app": settings.app_name,
        "version": settings.app_version,
    }


# --- Static file serving for production ---
# In production, `npm run build` compiles the React app into static HTML/JS/CSS
# files. The backend serves these directly so you only need one server.
_static_dir = Path(__file__).resolve().parent.parent / "static"
if _static_dir.is_dir():
    # Serve JS/CSS bundles from /assets (Vite's default output directory)
    app.mount("/assets", StaticFiles(directory=_static_dir / "assets"), name="assets")

    # Catch-all route: any URL that isn't an /api or /ws endpoint gets
    # index.html. This enables client-side routing — the React app reads the
    # URL and renders the correct page itself (e.g., /alarms, /trends).
    # Without this, refreshing a page like /alarms would return a 404.
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve the React SPA for all non-API routes."""
        file_path = _static_dir / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(_static_dir / "index.html")
