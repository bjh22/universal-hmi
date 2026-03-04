from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_role
from app.core.database import get_db
from app.models.audit import AuditAction, AuditLog
from app.models.user import User, UserRole

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("/")
async def get_audit_log(
    limit: int = 100,
    offset: int = 0,
    action: AuditAction | None = None,
    user: str | None = None,
    session: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    query = select(AuditLog).order_by(AuditLog.timestamp.desc())
    if action:
        query = query.where(AuditLog.action == action)
    if user:
        query = query.where(AuditLog.user == user)
    query = query.offset(offset).limit(limit)
    result = await session.execute(query)
    return result.scalars().all()
