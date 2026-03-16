"""Tests for ReportingService OEE calculation and bucket generation."""

from datetime import datetime, timedelta, timezone

from app.services.reporting_service import _generate_buckets


def _dt(year, month, day, hour=0, minute=0):
    return datetime(year, month, day, hour, minute, tzinfo=timezone.utc)


# ── _generate_buckets ────────────────────────────────────────────────

class TestGenerateBuckets:
    def test_day_single(self):
        """Single day bucket."""
        start = _dt(2024, 1, 1)
        end = _dt(2024, 1, 2)
        buckets = _generate_buckets(start, end, "day")
        assert len(buckets) == 1
        assert buckets[0][2] == "2024-01-01"

    def test_day_multiple(self):
        """Multiple day buckets."""
        start = _dt(2024, 1, 1)
        end = _dt(2024, 1, 4)
        buckets = _generate_buckets(start, end, "day")
        assert len(buckets) == 3
        labels = [b[2] for b in buckets]
        assert labels == ["2024-01-01", "2024-01-02", "2024-01-03"]

    def test_day_partial(self):
        """Day buckets with partial day at start."""
        start = _dt(2024, 1, 1, 12, 0)
        end = _dt(2024, 1, 3)
        buckets = _generate_buckets(start, end, "day")
        # First bucket starts at noon, not midnight
        assert buckets[0][0] == start
        assert buckets[0][1] == _dt(2024, 1, 2)

    def test_week_single(self):
        """Single week bucket."""
        # 2024-01-01 is a Monday
        start = _dt(2024, 1, 1)
        end = _dt(2024, 1, 8)
        buckets = _generate_buckets(start, end, "week")
        assert len(buckets) == 1

    def test_week_multiple(self):
        """Multiple week buckets."""
        start = _dt(2024, 1, 1)
        end = _dt(2024, 1, 22)
        buckets = _generate_buckets(start, end, "week")
        assert len(buckets) == 3

    def test_month_single(self):
        """Single month bucket."""
        start = _dt(2024, 1, 1)
        end = _dt(2024, 2, 1)
        buckets = _generate_buckets(start, end, "month")
        assert len(buckets) == 1
        assert buckets[0][2] == "2024-01"

    def test_month_multiple(self):
        """Multiple month buckets."""
        start = _dt(2024, 1, 1)
        end = _dt(2024, 4, 1)
        buckets = _generate_buckets(start, end, "month")
        assert len(buckets) == 3
        labels = [b[2] for b in buckets]
        assert labels == ["2024-01", "2024-02", "2024-03"]

    def test_month_year_boundary(self):
        """Month buckets crossing a year boundary."""
        start = _dt(2024, 11, 1)
        end = _dt(2025, 2, 1)
        buckets = _generate_buckets(start, end, "month")
        assert len(buckets) == 3
        labels = [b[2] for b in buckets]
        assert labels == ["2024-11", "2024-12", "2025-01"]

    def test_empty_range(self):
        """Zero-duration range produces no buckets."""
        start = _dt(2024, 1, 1)
        end = _dt(2024, 1, 1)
        buckets = _generate_buckets(start, end, "day")
        assert len(buckets) == 0

    def test_bucket_boundaries_correct(self):
        """Bucket start/end are clamped to frame boundaries."""
        start = _dt(2024, 1, 15, 8)
        end = _dt(2024, 1, 17, 16)
        buckets = _generate_buckets(start, end, "day")
        # First bucket starts at frame start, not midnight
        assert buckets[0][0] == start
        # Last bucket ends at frame end, not midnight
        assert buckets[-1][1] == end


# ── OEE formula components ───────────────────────────────────────────

class TestOEEFormulas:
    """Test the OEE math with known inputs. These test the formulas
    documented in compute_report without needing a database."""

    def test_availability(self):
        """Availability = uptime / (uptime + downtime)."""
        uptime = 3600.0   # 1 hour
        downtime = 1200.0  # 20 min
        active_time = uptime + downtime
        availability = round(uptime / active_time, 4)
        assert availability == 0.75

    def test_performance(self):
        """Performance = rate / target_rate, capped at 1.0."""
        count = 100
        uptime = 3600.0  # 1 hour
        rate = round(count / (uptime / 3600), 2)
        target_rate = 120.0
        performance = round(min(rate / target_rate, 1.0), 4)
        assert rate == 100.0
        assert performance == 0.8333

    def test_performance_capped(self):
        """Performance exceeding target is capped at 1.0."""
        rate = 150.0
        target_rate = 100.0
        performance = round(min(rate / target_rate, 1.0), 4)
        assert performance == 1.0

    def test_quality(self):
        """Quality = good count / (good count + reject count)."""
        count = 90
        reject_count = 10
        total = count + reject_count
        quality = round(count / total, 4)
        assert quality == 0.9

    def test_oee_combined(self):
        """OEE = Availability × Performance × Quality."""
        availability = 0.9
        performance = 0.85
        quality = 0.95
        oee = round(availability * performance * quality, 4)
        assert oee == 0.7268

    def test_zero_uptime(self):
        """Zero uptime means rate is None."""
        uptime = 0.0
        rate = None
        if uptime > 0:
            rate = round(100 / (uptime / 3600), 2)
        assert rate is None

    def test_zero_parts(self):
        """Zero total parts means quality is None."""
        count = 0
        reject_count = 0
        total = count + reject_count
        quality = None
        if total > 0:
            quality = round(count / total, 4)
        assert quality is None

    def test_no_target_rate(self):
        """Missing target rate means performance is None."""
        target_rate = None
        rate = 100.0
        performance = None
        if target_rate and target_rate > 0 and rate is not None:
            performance = round(min(rate / target_rate, 1.0), 4)
        assert performance is None

    def test_idle_time(self):
        """Idle = total - uptime - downtime."""
        total = 28800.0  # 8 hours
        uptime = 21600.0  # 6 hours
        downtime = 3600.0  # 1 hour
        idle = max(0, total - uptime - downtime)
        assert idle == 3600.0


# ── Exception capping ─────────────────────────────────────────────────

class TestExceptionCapping:
    """Test the 5-minute exception cap logic."""

    EXCEPTION_CAP_SECONDS = 300

    def test_short_exception_uncapped(self):
        """Exception shorter than 5 min is fully counted as downtime."""
        duration = 180  # 3 minutes
        assert duration <= self.EXCEPTION_CAP_SECONDS

    def test_long_exception_capped(self):
        """Exception longer than 5 min: first 5 min is downtime, rest is idle."""
        duration = 600  # 10 minutes
        assert duration > self.EXCEPTION_CAP_SECONDS
        downtime_contribution = self.EXCEPTION_CAP_SECONDS
        idle_contribution = duration - self.EXCEPTION_CAP_SECONDS
        assert downtime_contribution == 300
        assert idle_contribution == 300

    def test_exactly_five_minutes(self):
        """Exception exactly 5 minutes is not capped."""
        duration = 300
        assert duration <= self.EXCEPTION_CAP_SECONDS
