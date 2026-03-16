"""Tests for alarm condition checking edge cases."""

from app.services.alarm_service import AlarmService


def _make_service():
    class FakeTagEngine:
        _subscribers = []
    return AlarmService(FakeTagEngine(), None)


class TestBoolCoercion:
    """Test the full matrix of boolean coercion for alarm conditions."""

    def test_string_true_variants(self):
        svc = _make_service()
        for val in ["true", "True", "TRUE", "1", "yes", "Yes", "YES"]:
            assert svc._check_condition({"trigger_on": True}, val) is True, f"Failed for {val!r}"

    def test_string_false_variants(self):
        svc = _make_service()
        for val in ["false", "False", "FALSE", "0", "no", "No", "NO", "random", ""]:
            assert svc._check_condition({"trigger_on": True}, val) is False, f"Failed for {val!r}"

    def test_trigger_on_string_coercion(self):
        """trigger_on value itself is also coerced from string."""
        svc = _make_service()
        assert svc._check_condition({"trigger_on": "1"}, True) is True
        assert svc._check_condition({"trigger_on": "yes"}, True) is True
        assert svc._check_condition({"trigger_on": "0"}, False) is True
        assert svc._check_condition({"trigger_on": "false"}, False) is True

    def test_none_value(self):
        """None is falsy."""
        svc = _make_service()
        # None is handled by bool(None) == False
        assert svc._check_condition({"trigger_on": True}, None) is False

    def test_empty_string(self):
        """Empty string coerces to False."""
        svc = _make_service()
        assert svc._check_condition({"trigger_on": True}, "") is False

    def test_float_truthy(self):
        """Non-zero float is truthy."""
        svc = _make_service()
        assert svc._check_condition({"trigger_on": True}, 3.14) is True

    def test_float_zero(self):
        """Zero float is falsy."""
        svc = _make_service()
        assert svc._check_condition({"trigger_on": True}, 0.0) is False
