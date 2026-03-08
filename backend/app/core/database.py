from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

engine = create_async_engine(settings.database_url, echo=settings.debug)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def _enable_wal_mode():
    """Enable WAL journal mode for better concurrent read/write performance."""
    async with engine.begin() as conn:
        await conn.execute(text("PRAGMA journal_mode=WAL"))
        await conn.execute(text("PRAGMA synchronous=NORMAL"))


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
    await _enable_wal_mode()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Lightweight column migrations for SQLite (no Alembic)
        # Column renames (must run before add_column_if_missing)
        await _rename_column_if_needed(conn, "tags", "description", "display_name")
        await _rename_column_if_needed(conn, "tags", "long_description", "description")
        # Tags
        await _add_column_if_missing(conn, "tags", "display_name", "TEXT")
        await _add_column_if_missing(conn, "tags", "enum_mapping", "TEXT")
        await _add_column_if_missing(conn, "tags", "template_id", "INTEGER REFERENCES tag_templates(id)")
        # Screens
        await _add_column_if_missing(conn, "screens", "layout_mode", "VARCHAR(20) NOT NULL DEFAULT 'grid'")
        await _add_column_if_missing(conn, "screens", "target_resolution", "TEXT")
        await _add_column_if_missing(conn, "screens", "sort_order", "INTEGER NOT NULL DEFAULT 0")
        # Project foreign keys
        await _add_column_if_missing(conn, "tags", "project_id", "INTEGER REFERENCES projects(id) ON DELETE SET NULL")
        await _add_column_if_missing(conn, "tag_labels", "project_id", "INTEGER REFERENCES projects(id) ON DELETE SET NULL")
        await _add_column_if_missing(conn, "tag_templates", "project_id", "INTEGER REFERENCES projects(id) ON DELETE SET NULL")
        await _add_column_if_missing(conn, "screens", "project_id", "INTEGER REFERENCES projects(id) ON DELETE SET NULL")
        await _add_column_if_missing(conn, "screen_templates", "project_id", "INTEGER REFERENCES projects(id) ON DELETE SET NULL")
        await _add_column_if_missing(conn, "data_sources", "project_id", "INTEGER REFERENCES projects(id) ON DELETE SET NULL")
        await _add_column_if_missing(conn, "jobs", "project_id", "INTEGER REFERENCES projects(id) ON DELETE SET NULL")
        # Projects
        await _add_column_if_missing(conn, "projects", "snapshot", "TEXT")
        await _add_column_if_missing(conn, "projects", "snapshot_saved_at", "DATETIME")
        # Alarm history
        await _add_column_if_missing(conn, "alarm_history", "tag_display_name", "VARCHAR(300)")


async def _add_column_if_missing(conn, table: str, column: str, col_type: str):
    """Add a column to an existing table if it doesn't exist yet."""
    result = await conn.execute(text(f"PRAGMA table_info({table})"))
    columns = [row[1] for row in result.fetchall()]
    if column not in columns:
        await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))


async def _rename_column_if_needed(conn, table: str, old_name: str, new_name: str):
    """Rename a column if the old name exists and the new name does not."""
    result = await conn.execute(text(f"PRAGMA table_info({table})"))
    columns = [row[1] for row in result.fetchall()]
    if old_name in columns and new_name not in columns:
        await conn.execute(
            text(f"ALTER TABLE {table} RENAME COLUMN {old_name} TO {new_name}")
        )
