"""Unit tests for audit_service.log_audit — writes immutable records of user actions."""

from datetime import datetime, timezone

import pytest
from sqlalchemy import select

from app.models.audit import AuditAction, AuditLog
from app.services.audit_service import log_audit


class TestLogAudit:
    async def test_writes_full_record(self, db_session):
        entry = await log_audit(
            db_session,
            AuditAction.CONTROL_WRITE,
            user="operator",
            details="wrote Tank.Level=42",
            source_ip="10.0.0.1",
        )
        await db_session.commit()

        assert entry.id is not None
        result = await db_session.execute(select(AuditLog).where(AuditLog.id == entry.id))
        row = result.scalar_one()
        assert row.user == "operator"
        assert row.action == AuditAction.CONTROL_WRITE
        assert row.details == "wrote Tank.Level=42"
        assert row.source_ip == "10.0.0.1"
        # Timestamp is set to "now" within a few seconds
        assert row.timestamp is not None
        now = datetime.now(timezone.utc)
        row_ts = row.timestamp if row.timestamp.tzinfo else row.timestamp.replace(tzinfo=timezone.utc)
        delta = abs((row_ts - now).total_seconds())
        assert delta < 5.0

    async def test_minimal_record(self, db_session):
        """User/details/source_ip are optional — only action is required."""
        entry = await log_audit(db_session, AuditAction.LOGIN)
        await db_session.commit()

        result = await db_session.execute(select(AuditLog).where(AuditLog.id == entry.id))
        row = result.scalar_one()
        assert row.action == AuditAction.LOGIN
        assert row.user is None
        assert row.details is None
        assert row.source_ip is None

    async def test_multiple_entries_preserve_order(self, db_session):
        actions = [AuditAction.LOGIN, AuditAction.CONTROL_WRITE, AuditAction.LOGOUT]
        for a in actions:
            await log_audit(db_session, a, user="u")
        await db_session.commit()

        result = await db_session.execute(
            select(AuditLog).where(AuditLog.user == "u").order_by(AuditLog.id)
        )
        rows = result.scalars().all()
        assert [r.action for r in rows] == actions

class TestAuditActionsCoverage:
    """Sanity check that the actions referenced by other services still exist.

    If one of these is renamed, other services that reference the enum by name
    would break at import time — but this test gives a clearer failure message.
    """
    def test_expected_actions_present(self):
        expected = {
            "CONTROL_WRITE", "SCRIPT_EXECUTE", "ALARM_ACK", "LOGIN", "LOGOUT",
            "SCREEN_SAVE", "SCREEN_DELETE", "CONFIG_CHANGE",
        }
        actual = {a.name for a in AuditAction}
        missing = expected - actual
        assert not missing, f"Missing audit actions: {missing}"
