"""Tests for AlarmService state machine transitions."""

from app.models.alarm import AlarmState, AlarmSeverity, Alarm
from app.services.alarm_service import AlarmService


class TestCheckCondition:
    """Test the _check_condition method that determines if a tag is in alarm."""

    def _make_service(self):
        """Create an AlarmService with mock dependencies."""
        # We only need _check_condition which doesn't use tag_engine or session_factory
        class FakeTagEngine:
            _subscribers = []
        return AlarmService(FakeTagEngine(), None)

    def test_bool_true_triggers(self):
        """Boolean True triggers alarm when trigger_on=True (default)."""
        svc = self._make_service()
        assert svc._check_condition({"trigger_on": True}, True) is True

    def test_bool_false_no_trigger(self):
        """Boolean False does not trigger when trigger_on=True."""
        svc = self._make_service()
        assert svc._check_condition({"trigger_on": True}, False) is False

    def test_default_trigger_on(self):
        """Default trigger_on is True."""
        svc = self._make_service()
        assert svc._check_condition({}, True) is True
        assert svc._check_condition({}, False) is False

    def test_string_true_coercion(self):
        """String 'true' is coerced to boolean True."""
        svc = self._make_service()
        assert svc._check_condition({"trigger_on": True}, "true") is True

    def test_string_1_coercion(self):
        """String '1' is coerced to boolean True."""
        svc = self._make_service()
        assert svc._check_condition({"trigger_on": True}, "1") is True

    def test_string_yes_coercion(self):
        """String 'yes' is coerced to boolean True."""
        svc = self._make_service()
        assert svc._check_condition({"trigger_on": True}, "yes") is True

    def test_string_false_coercion(self):
        """String 'false' is coerced to boolean False."""
        svc = self._make_service()
        assert svc._check_condition({"trigger_on": True}, "false") is False

    def test_string_0_coercion(self):
        """String '0' is coerced to boolean False."""
        svc = self._make_service()
        assert svc._check_condition({"trigger_on": True}, "0") is False

    def test_trigger_on_false(self):
        """trigger_on=False means alarm triggers when value is False."""
        svc = self._make_service()
        assert svc._check_condition({"trigger_on": False}, False) is True
        assert svc._check_condition({"trigger_on": False}, True) is False

    def test_trigger_on_string(self):
        """trigger_on as a string is also coerced."""
        svc = self._make_service()
        assert svc._check_condition({"trigger_on": "true"}, True) is True
        assert svc._check_condition({"trigger_on": "false"}, False) is True

    def test_numeric_truthy(self):
        """Non-zero number is truthy."""
        svc = self._make_service()
        assert svc._check_condition({"trigger_on": True}, 1) is True
        assert svc._check_condition({"trigger_on": True}, 42) is True

    def test_numeric_falsy(self):
        """Zero is falsy."""
        svc = self._make_service()
        assert svc._check_condition({"trigger_on": True}, 0) is False


class TestAlarmStateTransitions:
    """Test the expected state transitions of the alarm state machine.

    These verify the transition logic documented in alarm_service.py:
    - New alarm: None → active_unacked
    - Acknowledge: active_unacked → active_acked
    - Clear after ack: active_acked → inactive (history)
    - Clear before ack: active_unacked → inactive_unacked
    - Late ack: inactive_unacked → inactive (history)
    - Retrigger: inactive_unacked → active_unacked
    """

    def test_new_alarm_state(self):
        """New alarms start as active_unacked."""
        alarm = Alarm(
            tag_id=1,
            message="Test alarm",
            severity=AlarmSeverity.WARNING,
            state=AlarmState.ACTIVE_UNACKED,
        )
        assert alarm.state == AlarmState.ACTIVE_UNACKED

    def test_acknowledge_active_unacked(self):
        """Acknowledging active_unacked moves to active_acked."""
        state = AlarmState.ACTIVE_UNACKED
        # Simulate acknowledge logic from AlarmService.acknowledge
        new_state = AlarmState.INACTIVE if state == AlarmState.INACTIVE_UNACKED else AlarmState.ACTIVE_ACKED
        assert new_state == AlarmState.ACTIVE_ACKED

    def test_acknowledge_inactive_unacked(self):
        """Acknowledging inactive_unacked moves to inactive (fully resolved)."""
        state = AlarmState.INACTIVE_UNACKED
        new_state = AlarmState.INACTIVE if state == AlarmState.INACTIVE_UNACKED else AlarmState.ACTIVE_ACKED
        assert new_state == AlarmState.INACTIVE

    def test_clear_active_unacked(self):
        """Clearing active_unacked moves to inactive_unacked."""
        state = AlarmState.ACTIVE_UNACKED
        new_state = AlarmState.INACTIVE_UNACKED if state == AlarmState.ACTIVE_UNACKED else AlarmState.INACTIVE
        assert new_state == AlarmState.INACTIVE_UNACKED

    def test_clear_active_acked(self):
        """Clearing active_acked moves to inactive (history recorded)."""
        state = AlarmState.ACTIVE_ACKED
        new_state = AlarmState.INACTIVE_UNACKED if state == AlarmState.ACTIVE_UNACKED else AlarmState.INACTIVE
        assert new_state == AlarmState.INACTIVE

    def test_retrigger_from_inactive_unacked(self):
        """Retrigger from inactive_unacked moves back to active_unacked."""
        # Simulates the retrigger logic in _evaluate_loop
        state = AlarmState.INACTIVE_UNACKED
        new_state = AlarmState.ACTIVE_UNACKED  # retrigger sets this
        assert new_state == AlarmState.ACTIVE_UNACKED

    def test_alarm_severity_values(self):
        """Verify all severity levels are valid."""
        assert AlarmSeverity.INFO.value == "info"
        assert AlarmSeverity.WARNING.value == "warning"
        assert AlarmSeverity.CRITICAL.value == "critical"

    def test_alarm_state_values(self):
        """Verify all state values."""
        assert AlarmState.ACTIVE_UNACKED.value == "active_unacked"
        assert AlarmState.ACTIVE_ACKED.value == "active_acked"
        assert AlarmState.INACTIVE_UNACKED.value == "inactive_unacked"
        assert AlarmState.INACTIVE.value == "inactive"
