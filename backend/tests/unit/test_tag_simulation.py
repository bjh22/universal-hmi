"""Tests for TagEngine simulation modes."""

import math

from app.models.tag import SimulationBehavior
from app.services.tag_engine import TagEngine, TagValue


def _make_tv(value=0, data_type="float"):
    return TagValue(tag_id=1, name="test", value=value, data_type=data_type)


class TestComputeSimValue:
    """Test _compute_sim_value for each simulation behavior."""

    def setup_method(self):
        self.engine = TagEngine()

    def test_sine_at_zero(self):
        """Sine at t=0 should be at midpoint."""
        config = {"min": 0, "max": 100, "period": 60}
        val = self.engine._compute_sim_value(
            SimulationBehavior.SINE, config, 0.0, _make_tv()
        )
        assert abs(val - 50.0) < 0.01

    def test_sine_at_quarter_period(self):
        """Sine at t=period/4 should be at max."""
        config = {"min": 0, "max": 100, "period": 60}
        val = self.engine._compute_sim_value(
            SimulationBehavior.SINE, config, 15.0, _make_tv()
        )
        assert abs(val - 100.0) < 0.01

    def test_sine_within_range(self):
        """Sine always stays within min/max."""
        config = {"min": 10, "max": 90, "period": 30}
        for t in [0, 5, 10, 15, 20, 25, 30]:
            val = self.engine._compute_sim_value(
                SimulationBehavior.SINE, config, float(t), _make_tv()
            )
            assert 10 <= val <= 90, f"Sine out of range at t={t}: {val}"

    def test_sine_zero_period(self):
        """Sine with zero period returns midpoint."""
        config = {"min": 0, "max": 100, "period": 0}
        val = self.engine._compute_sim_value(
            SimulationBehavior.SINE, config, 10.0, _make_tv()
        )
        assert val == 50.0

    def test_ramp_at_zero(self):
        """Ramp at t=0 should be at min."""
        config = {"min": 0, "max": 100, "period": 60}
        val = self.engine._compute_sim_value(
            SimulationBehavior.RAMP, config, 0.0, _make_tv()
        )
        assert val == 0.0

    def test_ramp_at_half_period(self):
        """Ramp at t=period/2 should be at midpoint."""
        config = {"min": 0, "max": 100, "period": 60}
        val = self.engine._compute_sim_value(
            SimulationBehavior.RAMP, config, 30.0, _make_tv()
        )
        assert val == 50.0

    def test_ramp_wraps(self):
        """Ramp wraps around at max back to min."""
        config = {"min": 0, "max": 100, "period": 60}
        val = self.engine._compute_sim_value(
            SimulationBehavior.RAMP, config, 60.0, _make_tv()
        )
        assert abs(val) < 0.01  # Back to start

    def test_ramp_zero_period(self):
        """Ramp with zero period returns min."""
        config = {"min": 10, "max": 100, "period": 0}
        val = self.engine._compute_sim_value(
            SimulationBehavior.RAMP, config, 10.0, _make_tv()
        )
        assert val == 10

    def test_random_within_range(self):
        """Random values stay within min/max bounds."""
        config = {"min": 10, "max": 50}
        for _ in range(50):
            val = self.engine._compute_sim_value(
                SimulationBehavior.RANDOM, config, 0.0, _make_tv()
            )
            assert 10 <= val <= 50

    def test_toggle_at_zero(self):
        """Toggle at t=0 should be True."""
        config = {"period": 10}
        val = self.engine._compute_sim_value(
            SimulationBehavior.TOGGLE, config, 0.0, _make_tv(False)
        )
        assert val is True

    def test_toggle_at_one_period(self):
        """Toggle at t=period should be False (int(10/10)%2 == 1)."""
        config = {"period": 10}
        val = self.engine._compute_sim_value(
            SimulationBehavior.TOGGLE, config, 10.0, _make_tv(True)
        )
        assert val is False  # int(10/10) % 2 == 1 → False

    def test_toggle_alternates(self):
        """Toggle alternates between True and False."""
        config = {"period": 10}
        vals = []
        for t in range(0, 40, 5):
            v = self.engine._compute_sim_value(
                SimulationBehavior.TOGGLE, config, float(t), _make_tv()
            )
            vals.append(v)
        # Should alternate: True, True, False, False, True, True, False, False
        assert vals[0] is True   # t=0: int(0/10)%2 == 0 → True
        assert vals[2] is False  # t=10: int(10/10)%2 == 1 → False

    def test_toggle_zero_period(self):
        """Toggle with zero period returns current value."""
        config = {"period": 0}
        val = self.engine._compute_sim_value(
            SimulationBehavior.TOGGLE, config, 10.0, _make_tv(True)
        )
        assert val is True

    def test_enum_cycle(self):
        """Enum cycle iterates through values list."""
        config = {"values": ["A", "B", "C"], "period": 10}
        vals = [
            self.engine._compute_sim_value(
                SimulationBehavior.ENUM_CYCLE, config, float(t), _make_tv()
            )
            for t in [0, 10, 20, 30]
        ]
        assert vals == ["A", "B", "C", "A"]

    def test_enum_cycle_empty(self):
        """Enum cycle with empty values returns current value."""
        config = {"values": [], "period": 10}
        val = self.engine._compute_sim_value(
            SimulationBehavior.ENUM_CYCLE, config, 0.0, _make_tv(42)
        )
        assert val == 42

    def test_static(self):
        """Static returns configured value."""
        config = {"value": 42}
        val = self.engine._compute_sim_value(
            SimulationBehavior.STATIC, config, 0.0, _make_tv()
        )
        assert val == 42

    def test_static_default(self):
        """Static with no value returns current value."""
        config = {}
        val = self.engine._compute_sim_value(
            SimulationBehavior.STATIC, config, 0.0, _make_tv(99)
        )
        assert val == 99
