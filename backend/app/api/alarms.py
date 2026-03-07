from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.alarm import Alarm, AlarmHistory, AlarmSeverity, AlarmState
from app.models.audit import AuditAction
from app.models.tag import Tag
from app.models.user import User
from app.services.audit_service import log_audit

router = APIRouter(prefix="/api/alarms", tags=["alarms"])


class AlarmOut(BaseModel):
    id: int
    tag_id: int
    tag_name: str | None = None
    tag_display_name: str | None = None
    message: str
    severity: AlarmSeverity
    state: AlarmState
    triggered_at: str
    acknowledged_at: str | None
    acknowledged_by: str | None
    trigger_value: str | None

    model_config = {"from_attributes": True}


class AlarmHistoryOut(BaseModel):
    id: int
    tag_id: int
    tag_name: str | None = None
    tag_display_name: str | None = None
    message: str
    severity: AlarmSeverity
    triggered_at: str
    acknowledged_at: str | None
    acknowledged_by: str | None
    cleared_at: str | None
    trigger_value: str | None
    clear_value: str | None

    model_config = {"from_attributes": True}


@router.get("/active", response_model=list[AlarmOut])
async def get_active_alarms(session: AsyncSession = Depends(get_db)):
    result = await session.execute(
        select(Alarm, Tag.name.label("tag_name"), Tag.description.label("tag_display_name"))
        .join(Tag, Alarm.tag_id == Tag.id)
        .where(Alarm.state.in_([
            AlarmState.ACTIVE_UNACKED,
            AlarmState.ACTIVE_ACKED,
            AlarmState.INACTIVE_UNACKED,
        ]))
        .order_by(Alarm.triggered_at.desc())
    )
    rows = result.all()
    return [_alarm_to_out(row[0], row[1], row[2]) for row in rows]


@router.get("/history", response_model=list[AlarmHistoryOut])
async def get_alarm_history(
    limit: int = 100,
    offset: int = 0,
    severity: AlarmSeverity | None = None,
    session: AsyncSession = Depends(get_db),
):
    query = (
        select(AlarmHistory, Tag.description.label("current_display_name"))
        .outerjoin(Tag, AlarmHistory.tag_id == Tag.id)
        .order_by(AlarmHistory.triggered_at.desc())
    )
    if severity:
        query = query.where(AlarmHistory.severity == severity)
    query = query.offset(offset).limit(limit)
    result = await session.execute(query)
    return [_history_to_out(row[0], row[1]) for row in result.all()]


@router.post("/{alarm_id}/acknowledge")
async def acknowledge_alarm(
    alarm_id: int,
    request: Request,
    session: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    alarm_service = request.app.state.alarm_service
    username = current_user.username if current_user else "anonymous"
    alarm = await alarm_service.acknowledge(alarm_id, username, session)
    if not alarm:
        raise HTTPException(status_code=404, detail="Alarm not found")

    await log_audit(
        session, AuditAction.ALARM_ACK,
        user=username,
        details=f"Acknowledged alarm {alarm_id}: {alarm.message}",
        source_ip=request.client.host,
    )
    return {"success": True}


def _alarm_to_out(alarm: Alarm, tag_name: str = "", tag_display_name: str | None = None) -> AlarmOut:
    return AlarmOut(
        id=alarm.id,
        tag_id=alarm.tag_id,
        tag_name=tag_name,
        tag_display_name=tag_display_name,
        message=alarm.message,
        severity=alarm.severity,
        state=alarm.state,
        triggered_at=alarm.triggered_at.isoformat() if alarm.triggered_at else "",
        acknowledged_at=alarm.acknowledged_at.isoformat() if alarm.acknowledged_at else None,
        acknowledged_by=alarm.acknowledged_by,
        trigger_value=alarm.trigger_value,
    )


def _history_to_out(h: AlarmHistory, current_display_name: str | None = None) -> AlarmHistoryOut:
    return AlarmHistoryOut(
        id=h.id,
        tag_id=h.tag_id,
        tag_name=h.tag_name,
        tag_display_name=current_display_name or h.tag_display_name,
        message=h.message,
        severity=h.severity,
        triggered_at=h.triggered_at.isoformat() if h.triggered_at else "",
        acknowledged_at=h.acknowledged_at.isoformat() if h.acknowledged_at else None,
        acknowledged_by=h.acknowledged_by,
        cleared_at=h.cleared_at.isoformat() if h.cleared_at else None,
        trigger_value=h.trigger_value,
        clear_value=h.clear_value,
    )
