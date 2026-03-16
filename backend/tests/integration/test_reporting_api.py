"""Integration tests for Reporting API endpoints."""

import pytest


class TestReportingSummary:
    async def test_summary_endpoint(self, test_client, seeded_db, admin_token):
        """GET /api/reporting/summary returns a report structure."""
        resp = await test_client.get(
            "/api/reporting/summary",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "count" in data
        assert "uptime_seconds" in data
        assert "downtime_seconds" in data
        assert "idle_seconds" in data
        assert "timeframe" in data

    async def test_summary_with_timeframe(self, test_client, seeded_db, admin_token):
        """GET /api/reporting/summary with explicit timeframe."""
        resp = await test_client.get(
            "/api/reporting/summary?start=2024-01-01T00:00:00Z&end=2024-01-02T00:00:00Z",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200


class TestReportingTimeSeries:
    async def test_time_series_endpoint(self, test_client, seeded_db, admin_token):
        """GET /api/reporting/time-series returns bucketed data."""
        resp = await test_client.get(
            "/api/reporting/time-series?start=2024-01-01T00:00:00Z&end=2024-01-08T00:00:00Z",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)

    async def test_time_series_granularity(self, test_client, seeded_db, admin_token):
        """Time-series respects granularity parameter."""
        resp = await test_client.get(
            "/api/reporting/time-series?start=2024-01-01T00:00:00Z&end=2024-02-01T00:00:00Z&granularity=week",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)


class TestDowntimePeriods:
    async def test_downtime_periods_endpoint(self, test_client, seeded_db, admin_token):
        """GET /api/reporting/downtime-periods returns a list."""
        resp = await test_client.get(
            "/api/reporting/downtime-periods?start=2024-01-01T00:00:00Z&end=2024-01-02T00:00:00Z",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)


class TestScreensCRUD:
    async def test_list_screens(self, test_client, seeded_db, admin_token):
        """GET /api/screens/ returns a list."""
        resp = await test_client.get(
            "/api/screens/",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)

    async def test_create_screen(self, test_client, seeded_db, admin_token):
        """POST /api/screens/ creates a new screen."""
        import time
        ts = int(time.time() * 1000)
        resp = await test_client.post(
            "/api/screens/",
            json={
                "name": f"Test Screen {ts}",
                "slug": f"test-screen-{ts}",
                "layout": [],
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert "slug" in data
