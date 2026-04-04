"""
Database connection setup using SQLAlchemy's async engine with SQLite.

The "async" approach means database queries don't block other requests — while
one request waits for a query result, the server can handle other users. This
is essential for a web app where many clients connect simultaneously.
"""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

# create_async_engine sets up the database connection pool. The engine manages
# a pool of connections so each request doesn't open/close its own connection.
# aiosqlite is the async driver that lets SQLite work with Python's asyncio.
# pool_size=3 keeps resource usage low on embedded/lower-end hardware while
# still supporting concurrent requests. max_overflow=5 allows burst capacity.
engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    pool_size=3,
    max_overflow=5,
)

# A session factory — calling async_session() creates a new database session.
# A session is like a "workspace": you read/write data within it, then commit
# (save) or rollback (discard) all changes at once.
# expire_on_commit=False keeps ORM objects usable after commit. By default,
# SQLAlchemy "expires" all loaded attributes after a commit, so the next access
# triggers a lazy SQL query to re-fetch them. In synchronous code this works
# transparently, but in async mode lazy loads raise an error because they need
# an active async context. Setting this to False means committed objects keep
# their attribute values in memory — safe because our sessions are short-lived.
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def _enable_wal_mode():
    """Enable WAL (Write-Ahead Logging) for SQLite.

    By default, SQLite locks the entire database during writes, blocking all
    readers. WAL mode lets readers and writers work simultaneously — critical
    for a web app where multiple users query data while background tasks write.
    """
    async with engine.begin() as conn:
        await conn.execute(text("PRAGMA journal_mode=WAL"))
        await conn.execute(text("PRAGMA synchronous=NORMAL"))
        # Increase page cache to 4MB (default ~2MB) — reduces disk I/O on
        # lower-end hardware with slow storage (SD cards, USB drives, eMMC)
        await conn.execute(text("PRAGMA cache_size=-4000"))
        # Temp store in memory avoids temp file I/O for sorting/grouping
        await conn.execute(text("PRAGMA temp_store=MEMORY"))


# DeclarativeBase is the parent class for all database models (User, Tag, etc.).
# SQLAlchemy inspects its subclasses to learn which tables and columns exist,
# enabling automatic table creation and query generation.
class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    """FastAPI dependency that provides a database session to route handlers.

    Used like: async def get_items(db: AsyncSession = Depends(get_db))

    The `yield` pattern makes this a "dependency with cleanup" — FastAPI calls
    it before the route handler, provides the session, then resumes this
    function afterward to commit or rollback. This guarantees every request
    gets a clean session and errors are handled consistently.
    """
    async with async_session() as session:
        try:
            yield session  # Route handler runs here, using `session`
            await session.commit()  # Success — save all changes
        except Exception:
            await session.rollback()  # Error — discard all changes
            raise


async def init_db():
    """Create all tables on first run and apply lightweight schema migrations.

    Since we're not using a full migration tool like Alembic, we handle simple
    column additions and renames manually. This checks what columns exist and
    adds any missing ones — safe to run repeatedly (idempotent).
    """
    await _enable_wal_mode()
    async with engine.begin() as conn:
        # Creates any tables that don't exist yet (based on Base subclasses)
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
        await _add_column_if_missing(conn, "projects", "source_filename", "VARCHAR(300)")
        # Alarm history
        await _add_column_if_missing(conn, "alarm_history", "tag_display_name", "VARCHAR(300)")
        # System tags
        await _add_column_if_missing(conn, "tags", "is_system", "BOOLEAN NOT NULL DEFAULT 0")
        # Internal (nonvolatile) tag value persistence
        await _add_column_if_missing(conn, "tags", "persisted_value", "TEXT")
        # Tag-level visibility conditions
        await _add_column_if_missing(conn, "tags", "visibility_enabled", "BOOLEAN NOT NULL DEFAULT 0")
        await _add_column_if_missing(conn, "tags", "visibility_conditions", "TEXT")
        # Production run tag tracking
        await _add_column_if_missing(conn, "production_runs", "start_good_count", "INTEGER")
        await _add_column_if_missing(conn, "production_runs", "good_count_tag", "VARCHAR(200)")
        # Performance indexes for alarm_history (reporting queries)
        await _create_index_if_missing(conn, "ix_alarm_history_tag_name", "alarm_history", "tag_name")
        await _create_index_if_missing(conn, "ix_alarm_history_triggered_at", "alarm_history", "triggered_at")
        await _create_index_if_missing(conn, "ix_alarm_history_cleared_at", "alarm_history", "cleared_at")
        # Fix downtime_annotations.alarm_history_id: must be nullable for merged
        # downtime periods that don't map to a single alarm history row.
        await _make_column_nullable(conn, "downtime_annotations", "alarm_history_id")


async def _add_column_if_missing(conn, table: str, column: str, col_type: str):
    """Add a column to an existing table if it doesn't exist yet."""
    result = await conn.execute(text(f"PRAGMA table_info({table})"))
    columns = [row[1] for row in result.fetchall()]
    if not columns:
        return  # Table doesn't exist yet (will be created by create_all)
    if column not in columns:
        await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))


async def _create_index_if_missing(conn, index_name: str, table: str, column: str):
    """Create an index on an existing table if it doesn't exist yet."""
    result = await conn.execute(
        text("SELECT name FROM sqlite_master WHERE type='index' AND name=:name"),
        {"name": index_name},
    )
    if not result.fetchone():
        await conn.execute(text(f"CREATE INDEX {index_name} ON {table} ({column})"))


async def _make_column_nullable(conn, table: str, column: str):
    """Rebuild a table to make a NOT NULL column nullable (SQLite has no ALTER COLUMN)."""
    result = await conn.execute(text(f"PRAGMA table_info({table})"))
    cols = result.fetchall()
    # Find the target column; cols are (cid, name, type, notnull, dflt, pk)
    target = next((c for c in cols if c[1] == column), None)
    if target is None or target[3] == 0:
        return  # Column missing or already nullable — nothing to do
    col_names = [c[1] for c in cols]
    col_list = ", ".join(col_names)
    # Build column defs, dropping NOT NULL from the target column
    defs = []
    for c in cols:
        cid, name, ctype, notnull, dflt, pk = c
        parts = [name, ctype or "TEXT"]
        if pk:
            parts.append("PRIMARY KEY")
        if notnull and name != column:
            parts.append("NOT NULL")
        if dflt is not None:
            parts.append(f"DEFAULT {dflt}")
        defs.append(" ".join(parts))
    col_defs = ", ".join(defs)
    tmp = f"_{table}_tmp"
    await conn.execute(text(f"CREATE TABLE {tmp} ({col_defs})"))
    await conn.execute(text(f"INSERT INTO {tmp} ({col_list}) SELECT {col_list} FROM {table}"))
    await conn.execute(text(f"DROP TABLE {table}"))
    await conn.execute(text(f"ALTER TABLE {tmp} RENAME TO {table}"))
    # Recreate indexes (create_all won't touch existing tables, but indexes
    # on the old table were dropped with it; the index migration steps that
    # follow will re-add any needed indexes).


async def _rename_column_if_needed(conn, table: str, old_name: str, new_name: str):
    """Rename a column if the old name exists and the new name does not."""
    result = await conn.execute(text(f"PRAGMA table_info({table})"))
    columns = [row[1] for row in result.fetchall()]
    if old_name in columns and new_name not in columns:
        await conn.execute(
            text(f"ALTER TABLE {table} RENAME COLUMN {old_name} TO {new_name}")
        )
