"""Integration tests for /api/production/settings/ endpoints.

Covers tag binding persistence for machine status/controls, alarm marquee speed,
rate targets, and reject/exception fault tag lists. Exercises the cache
invalidation path via invalidate_production_settings_cache() in the GET-after-PUT.
"""

import pytest

from app.api.production_settings import invalidate_production_settings_cache


@pytest.fixture(autouse=True)
def _clear_production_cache():
    """Ensure tests don't leak settings between each other via the module cache."""
    invalidate_production_settings_cache()
    yield
    invalidate_production_settings_cache()


class TestGetProductionSettings:
    async def test_get_returns_defaults(self, test_client, seeded_db):
        """GET returns empty/None defaults for a fresh DB (public endpoint)."""
        resp = await test_client.get("/api/production/settings/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["good_count_tag"] is None
        assert data["reject_fault_tags"] == []
        assert data["cycling_tag"] is None
        assert data["downtime_exception_tags"] == []
        assert data["target_rate"] is None
        assert data["machine_status_tag"] is None
        assert data["cycle_start_tag"] is None
        assert data["reset_tag"] is None
        assert data["alarm_marquee_speed"] is None


class TestPutProductionSettings:
    async def test_put_requires_auth(self, test_client, seeded_db):
        resp = await test_client.put("/api/production/settings/", json={})
        assert resp.status_code == 401

    async def test_put_forbids_operator(self, test_client, seeded_db, operator_token):
        resp = await test_client.put(
            "/api/production/settings/",
            json={},
            headers={"Authorization": f"Bearer {operator_token}"},
        )
        assert resp.status_code == 403

    async def test_put_persists_all_fields(self, test_client, seeded_db, admin_token):
        body = {
            "good_count_tag": "Machine.GoodCount",
            "reject_fault_tags": ["Fault.Reject.A", "Fault.Reject.B"],
            "cycling_tag": "Machine.Cycling",
            "downtime_exception_tags": ["Fault.Planned"],
            "target_rate": 120.5,
            "machine_status_tag": "Machine.Status",
            "cycle_start_tag": "Machine.CycleStart",
            "reset_tag": "Machine.Reset",
            "alarm_marquee_speed": 80,
        }
        resp = await test_client.put(
            "/api/production/settings/",
            json=body,
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        for k, v in body.items():
            assert data[k] == v

        # Read-back via GET confirms persistence (after cache invalidation inside PUT)
        resp2 = await test_client.get("/api/production/settings/")
        assert resp2.status_code == 200
        data2 = resp2.json()
        assert data2["good_count_tag"] == "Machine.GoodCount"
        assert data2["target_rate"] == 120.5
        assert data2["alarm_marquee_speed"] == 80
        assert data2["reject_fault_tags"] == ["Fault.Reject.A", "Fault.Reject.B"]

    async def test_put_clears_fields_with_nulls(self, test_client, seeded_db, admin_token):
        # First populate
        await test_client.put(
            "/api/production/settings/",
            json={"good_count_tag": "X", "target_rate": 10.0},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        # Then clear
        resp = await test_client.put(
            "/api/production/settings/",
            json={"good_count_tag": None, "target_rate": None},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["good_count_tag"] is None
        assert data["target_rate"] is None

    async def test_put_validates_target_rate_type(self, test_client, seeded_db, admin_token):
        resp = await test_client.put(
            "/api/production/settings/",
            json={"target_rate": "not a number"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 422

    async def test_put_empty_body_uses_defaults(self, test_client, seeded_db, admin_token):
        """Empty JSON body is valid — all fields fall back to Pydantic defaults."""
        resp = await test_client.put(
            "/api/production/settings/",
            json={},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["reject_fault_tags"] == []
        assert data["good_count_tag"] is None

    async def test_engineer_can_update(self, test_client, seeded_db):
        """Engineer role is also allowed (not just designer)."""
        from app.core.security import create_access_token
        engineer_token = create_access_token({"sub": "2", "role": "engineer"})

        resp = await test_client.put(
            "/api/production/settings/",
            json={"good_count_tag": "Eng.Count"},
            headers={"Authorization": f"Bearer {engineer_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["good_count_tag"] == "Eng.Count"
