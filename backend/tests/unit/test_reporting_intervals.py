"""Tests for ReportingService interval arithmetic functions."""

from datetime import datetime, timedelta, timezone

from app.services.reporting_service import (
    _build_intervals_from_trend,
    _clamp_interval,
    _subtract_intervals,
    _total_seconds,
)


# ── _clamp_interval ──────────────────────────────────────────────────

def _dt(hour, minute=0, second=0):
    """Helper to create UTC datetimes on a fixed day."""
    return datetime(2024, 1, 1, hour, minute, second, tzinfo=timezone.utc)


class TestClampInterval:
    def test_full_overlap(self):
        """Interval fully inside the frame is returned unchanged."""
        result = _clamp_interval(_dt(2), _dt(4), _dt(0), _dt(6))
        assert result == (_dt(2), _dt(4))

    def test_partial_overlap_start(self):
        """Interval starts before frame — clamped to frame start."""
        result = _clamp_interval(_dt(0), _dt(4), _dt(2), _dt(6))
        assert result == (_dt(2), _dt(4))

    def test_partial_overlap_end(self):
        """Interval ends after frame — clamped to frame end."""
        result = _clamp_interval(_dt(2), _dt(8), _dt(0), _dt(6))
        assert result == (_dt(2), _dt(6))

    def test_both_sides_clamped(self):
        """Interval spans beyond frame on both sides."""
        result = _clamp_interval(_dt(0), _dt(10), _dt(2), _dt(6))
        assert result == (_dt(2), _dt(6))

    def test_no_overlap_before(self):
        """Interval entirely before frame returns None."""
        result = _clamp_interval(_dt(0), _dt(1), _dt(2), _dt(6))
        assert result is None

    def test_no_overlap_after(self):
        """Interval entirely after frame returns None."""
        result = _clamp_interval(_dt(7), _dt(9), _dt(2), _dt(6))
        assert result is None

    def test_touching_boundary(self):
        """Interval exactly touches frame boundary (zero duration) returns None."""
        result = _clamp_interval(_dt(0), _dt(2), _dt(2), _dt(6))
        assert result is None

    def test_none_end(self):
        """None end (still active) is treated as frame_end."""
        result = _clamp_interval(_dt(3), None, _dt(0), _dt(6))
        assert result == (_dt(3), _dt(6))

    def test_none_end_before_frame(self):
        """Active alarm starting before frame gets clamped."""
        result = _clamp_interval(_dt(0), None, _dt(2), _dt(6))
        assert result == (_dt(2), _dt(6))

    def test_exact_match(self):
        """Interval exactly matches frame."""
        result = _clamp_interval(_dt(2), _dt(6), _dt(2), _dt(6))
        assert result == (_dt(2), _dt(6))


# ── _subtract_intervals ──────────────────────────────────────────────

class TestSubtractIntervals:
    def test_no_subtraction(self):
        """Empty subtract list returns base unchanged."""
        base = [(_dt(0), _dt(6))]
        result = _subtract_intervals(base, [])
        assert result == base

    def test_no_overlap(self):
        """Non-overlapping subtract has no effect."""
        base = [(_dt(0), _dt(4))]
        subtract = [(_dt(5), _dt(6))]
        result = _subtract_intervals(base, subtract)
        assert result == base

    def test_full_removal(self):
        """Subtract covers entire base — result is empty."""
        base = [(_dt(2), _dt(4))]
        subtract = [(_dt(0), _dt(6))]
        result = _subtract_intervals(base, subtract)
        assert result == []

    def test_split_in_two(self):
        """Subtract in the middle splits base into two parts."""
        base = [(_dt(0), _dt(6))]
        subtract = [(_dt(2), _dt(4))]
        result = _subtract_intervals(base, subtract)
        assert result == [(_dt(0), _dt(2)), (_dt(4), _dt(6))]

    def test_trim_start(self):
        """Subtract overlaps the start of base."""
        base = [(_dt(2), _dt(6))]
        subtract = [(_dt(0), _dt(4))]
        result = _subtract_intervals(base, subtract)
        assert result == [(_dt(4), _dt(6))]

    def test_trim_end(self):
        """Subtract overlaps the end of base."""
        base = [(_dt(0), _dt(6))]
        subtract = [(_dt(4), _dt(8))]
        result = _subtract_intervals(base, subtract)
        assert result == [(_dt(0), _dt(4))]

    def test_multiple_subtractions(self):
        """Multiple subtracts carve out multiple pieces."""
        base = [(_dt(0), _dt(10))]
        subtract = [(_dt(1), _dt(2)), (_dt(4), _dt(5)), (_dt(7), _dt(8))]
        result = _subtract_intervals(base, subtract)
        assert len(result) == 4
        assert result == [
            (_dt(0), _dt(1)),
            (_dt(2), _dt(4)),
            (_dt(5), _dt(7)),
            (_dt(8), _dt(10)),
        ]

    def test_multiple_base_intervals(self):
        """Multiple base intervals with a single subtraction."""
        base = [(_dt(0), _dt(3)), (_dt(5), _dt(8))]
        subtract = [(_dt(2), _dt(6))]
        result = _subtract_intervals(base, subtract)
        assert result == [(_dt(0), _dt(2)), (_dt(6), _dt(8))]

    def test_adjacent_subtract(self):
        """Subtract exactly at boundary (touching) produces no gap."""
        base = [(_dt(0), _dt(6))]
        subtract = [(_dt(0), _dt(3))]
        result = _subtract_intervals(base, subtract)
        assert result == [(_dt(3), _dt(6))]


# ── _build_intervals_from_trend ───────────────────────────────────────

class TestBuildIntervalsFromTrend:
    def test_empty_samples(self):
        """No samples produces no intervals."""
        result = _build_intervals_from_trend([], _dt(0), _dt(6))
        assert result == []

    def test_always_on(self):
        """Single truthy sample spans entire frame."""
        samples = [(_dt(0), 1.0)]
        result = _build_intervals_from_trend(samples, _dt(0), _dt(6))
        assert result == [(_dt(0), _dt(6))]

    def test_always_off(self):
        """Single falsy sample produces no intervals."""
        samples = [(_dt(0), 0.0)]
        result = _build_intervals_from_trend(samples, _dt(0), _dt(6))
        assert result == []

    def test_on_then_off(self):
        """Tag turns on then off."""
        samples = [(_dt(0), 1.0), (_dt(3), 0.0)]
        result = _build_intervals_from_trend(samples, _dt(0), _dt(6))
        assert result == [(_dt(0), _dt(3))]

    def test_off_then_on(self):
        """Tag starts off then turns on."""
        samples = [(_dt(0), 0.0), (_dt(3), 1.0)]
        result = _build_intervals_from_trend(samples, _dt(0), _dt(6))
        assert result == [(_dt(3), _dt(6))]

    def test_multiple_transitions(self):
        """Multiple on/off transitions."""
        samples = [
            (_dt(0), 1.0),
            (_dt(2), 0.0),
            (_dt(4), 1.0),
            (_dt(5), 0.0),
        ]
        result = _build_intervals_from_trend(samples, _dt(0), _dt(6))
        assert result == [(_dt(0), _dt(2)), (_dt(4), _dt(5))]

    def test_clamped_to_frame(self):
        """Intervals are clamped to frame boundaries."""
        # Sample before frame starts
        samples = [(_dt(0), 1.0), (_dt(4), 0.0)]
        result = _build_intervals_from_trend(samples, _dt(2), _dt(6))
        assert result == [(_dt(2), _dt(4))]

    def test_none_value_treated_as_off(self):
        """None values are treated as off (falsy)."""
        samples = [(_dt(0), None), (_dt(3), 1.0)]
        result = _build_intervals_from_trend(samples, _dt(0), _dt(6))
        assert result == [(_dt(3), _dt(6))]

    def test_value_below_one_treated_as_off(self):
        """Values below 1.0 are treated as off."""
        samples = [(_dt(0), 0.5)]
        result = _build_intervals_from_trend(samples, _dt(0), _dt(6))
        assert result == []


# ── _total_seconds ────────────────────────────────────────────────────

class TestTotalSeconds:
    def test_empty(self):
        assert _total_seconds([]) == 0.0

    def test_single_interval(self):
        intervals = [(_dt(0), _dt(1))]  # 1 hour = 3600 seconds
        assert _total_seconds(intervals) == 3600.0

    def test_multiple_intervals(self):
        intervals = [
            (_dt(0), _dt(1)),  # 1 hour
            (_dt(2), _dt(3)),  # 1 hour
        ]
        assert _total_seconds(intervals) == 7200.0
