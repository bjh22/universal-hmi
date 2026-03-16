"""
Shared test fixtures for backend tests.

Provides an in-memory SQLite database, async sessions, a FastAPI test client,
and pre-configured service instances for unit and integration tests.
"""

import asyncio
from datetime import datetime, timezone

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base
from app.core.security import create_access_token, hash_password
from app.models.user import User, UserRole
from app.models.tag import Tag, TagDataType, TagAccessMode
from app.models.alarm import Alarm, AlarmHistory, AlarmSeverity, AlarmState
from app.models.trend import TrendData
from app.models.screen import Screen
from app.models.downtime_annotation import DowntimeAnnotation
from app.models.reason_code import ReasonCode
from app.models.app_setting import AppSetting
from app.models.datasource import DataSource
from app.models.audit import AuditLog
from app.models.job import Job
from app.models.integration import Integration
from app.models.project import Project


@pytest.fixture
async def db_engine():
    """Create an in-memory SQLite async engine for testing."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest.fixture
async def db_session(db_engine):
    """Provide an isolated async session for each test."""
    session_factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session


@pytest.fixture
async def session_factory(db_engine):
    """Provide a session factory for services that need to create their own sessions."""
    return async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture
async def seeded_db(db_session):
    """Session pre-loaded with default users and tags."""
    # Create default users
    users = [
        User(
            username="admin",
            display_name="Admin",
            hashed_password=hash_password("admin"),
            role=UserRole.DESIGNER,
        ),
        User(
            username="engineer",
            display_name="Engineer",
            hashed_password=hash_password("engineer"),
            role=UserRole.ENGINEER,
        ),
        User(
            username="supervisor",
            display_name="Supervisor",
            hashed_password=hash_password("1234"),
            role=UserRole.SUPERVISOR,
        ),
        User(
            username="operator",
            display_name="Operator",
            hashed_password=hash_password("0000"),
            role=UserRole.OPERATOR,
        ),
    ]
    for u in users:
        db_session.add(u)

    # Create sample tags
    tags = [
        Tag(name="Pump1.Running", display_name="Pump 1 Running", data_type=TagDataType.BOOL),
        Tag(name="Tank.Level", display_name="Tank Level", data_type=TagDataType.FLOAT),
        Tag(name="Motor.Speed", display_name="Motor Speed", data_type=TagDataType.INT),
        Tag(name="Status.Message", display_name="Status", data_type=TagDataType.STRING),
    ]
    for t in tags:
        db_session.add(t)

    await db_session.commit()
    return db_session


@pytest.fixture
def admin_token():
    """JWT token for admin/designer user."""
    return create_access_token({"sub": "1", "role": "designer"})


@pytest.fixture
def operator_token():
    """JWT token for operator user."""
    return create_access_token({"sub": "4", "role": "operator"})


@pytest.fixture
async def test_client(db_engine, seeded_db):
    """FastAPI async test client with overridden DB dependency."""
    from app.core.database import get_db
    from app.main import app
    from app.services.tag_engine import TagEngine

    session_factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_db():
        async with session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client

    app.dependency_overrides.clear()
