from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

engine = create_async_engine(settings.database_url, echo=settings.debug)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Lightweight column migrations for SQLite (no Alembic)
        # Tags
        await _add_column_if_missing(conn, "tags", "long_description", "TEXT")
        await _add_column_if_missing(conn, "tags", "enum_mapping", "TEXT")
        await _add_column_if_missing(conn, "tags", "template_id", "INTEGER REFERENCES tag_templates(id)")
        # Screens
        await _add_column_if_missing(conn, "screens", "layout_mode", "VARCHAR(20) NOT NULL DEFAULT 'grid'")
        await _add_column_if_missing(conn, "screens", "target_resolution", "TEXT")
        await _add_column_if_missing(conn, "screens", "sort_order", "INTEGER NOT NULL DEFAULT 0")


async def _add_column_if_missing(conn, table: str, column: str, col_type: str):
    """Add a column to an existing table if it doesn't exist yet."""
    result = await conn.execute(text(f"PRAGMA table_info({table})"))
    columns = [row[1] for row in result.fetchall()]
    if column not in columns:
        await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
