"""
Audit Service: Logs all control actions, user events, and system changes.
"""

from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditAction, AuditLog


async def log_audit(
    session: AsyncSession,
    action: AuditAction,
    user: str | None = None,
    details: str | None = None,
    source_ip: str | None = None,
):
    entry = AuditLog(
        timestamp=datetime.now(timezone.utc),
        user=user,
        action=action,
        details=details,
        source_ip=source_ip,
    )
    session.add(entry)
    await session.flush()
    return entry
