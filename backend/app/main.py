"""
Industrial HMI — FastAPI Application
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import alarms, audit, auth, datasources, jobs, production, screens, scripts, tags, trends
from app.api.websocket import router as ws_router
from app.core.config import settings
from app.core.database import async_session, init_db
from app.services.alarm_service import AlarmService
from app.services.tag_engine import tag_engine
from app.services.trend_service import TrendService

logging.basicConfig(level=logging.INFO if not settings.debug else logging.DEBUG)
logger = logging.getLogger(__name__)

alarm_service = AlarmService(tag_engine)
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

    await tag_engine.start_simulation()
    await alarm_service.start()
    await trend_service.start()
    logger.info("All services started")

    yield

    # Shutdown
    logger.info("Shutting down services")
    await tag_engine.stop_simulation()
    await alarm_service.stop()
    await trend_service.stop()


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
app.include_router(ws_router)


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "app": settings.app_name,
        "version": settings.app_version,
    }
