from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_role
from app.core.database import get_db
from app.models.alarm import Alarm, AlarmHistory, AlarmSeverity, AlarmState
from app.models.audit import AuditAction
from app.models.user import User, UserRole
from app.services.audit_service import log_audit

router = APIRouter(prefix="/api/alarms", tags=["alarms"])


class AlarmOut(BaseModel):
    id: int
    tag_id: int
    message: str
    severity: AlarmSeverity
    state: AlarmState
    triggered_at: str
    acknowledged_at: str | None
    acknowledged_by: str | None
    trigger_value: str | None

    model_config = {"from_attributes": True}


@router.get("/active", response_model=list[AlarmOut])
async def get_active_alarms(session: AsyncSession = Depends(get_db)):
    result = await session.execute(
        select(Alarm)
        .where(Alarm.state.in_([AlarmState.ACTIVE_UNACKED, AlarmState.ACTIVE_ACKED]))
        .order_by(Alarm.triggered_at.desc())
    )
    alarms = result.scalars().all()
    return [_alarm_to_out(a) for a in alarms]


@router.get("/history")
async def get_alarm_history(
    limit: int = 100,
    offset: int = 0,
    severity: AlarmSeverity | None = None,
    session: AsyncSession = Depends(get_db),
):
    query = select(AlarmHistory).order_by(AlarmHistory.triggered_at.desc())
    if severity:
        query = query.where(AlarmHistory.severity == severity)
    query = query.offset(offset).limit(limit)
    result = await session.execute(query)
    return result.scalars().all()


@router.post("/{alarm_id}/acknowledge")
async def acknowledge_alarm(
    alarm_id: int,
    request: Request,
    session: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    alarm = await session.get(Alarm, alarm_id)
    if not alarm:
        raise HTTPException(status_code=404, detail="Alarm not found")
    if alarm.state != AlarmState.ACTIVE_UNACKED:
        raise HTTPException(status_code=400, detail="Alarm already acknowledged or inactive")

    from datetime import datetime, timezone

    alarm.state = AlarmState.ACTIVE_ACKED
    alarm.acknowledged_at = datetime.now(timezone.utc)
    alarm.acknowledged_by = current_user.username if current_user else "anonymous"
    await session.flush()
    await log_audit(
        session, AuditAction.ALARM_ACK,
        user=current_user.username if current_user else "anonymous",
        details=f"Acknowledged alarm {alarm_id}: {alarm.message}",
        source_ip=request.client.host,
    )
    return {"success": True}


def _alarm_to_out(alarm: Alarm) -> AlarmOut:
    return AlarmOut(
        id=alarm.id,
        tag_id=alarm.tag_id,
        message=alarm.message,
        severity=alarm.severity,
        state=alarm.state,
        triggered_at=alarm.triggered_at.isoformat() if alarm.triggered_at else "",
        acknowledged_at=alarm.acknowledged_at.isoformat() if alarm.acknowledged_at else None,
        acknowledged_by=alarm.acknowledged_by,
        trigger_value=alarm.trigger_value,
    )
