"""Integration tests for /api/reason-codes/ CRUD endpoints.

Exercises soft-delete semantics (is_active=False, not row removal), role
enforcement, duplicate-code rejection, and the active_only filter.
"""

import pytest


class TestReasonCodesList:
    async def test_list_empty_initially(self, test_client, seeded_db):
        resp = await test_client.get("/api/reason-codes/")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_list_returns_created(self, test_client, seeded_db, admin_token):
        await test_client.post(
            "/api/reason-codes/",
            json={"code": "JAM", "description": "Jam", "sort_order": 1},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        resp = await test_client.get("/api/reason-codes/")
        data = resp.json()
        assert len(data) == 1
        assert data[0]["code"] == "JAM"
        assert data[0]["is_active"] is True

    async def test_active_only_filter(self, test_client, seeded_db, admin_token):
        # Create two
        r1 = await test_client.post(
            "/api/reason-codes/",
            json={"code": "A"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        r2 = await test_client.post(
            "/api/reason-codes/",
            json={"code": "B"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        rc_b_id = r2.json()["id"]
        # Soft-delete B
        await test_client.delete(
            f"/api/reason-codes/{rc_b_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        resp = await test_client.get("/api/reason-codes/?active_only=true")
        codes = [rc["code"] for rc in resp.json()]
        assert "A" in codes
        assert "B" not in codes

        resp_all = await test_client.get("/api/reason-codes/")
        codes_all = [rc["code"] for rc in resp_all.json()]
        assert "A" in codes_all and "B" in codes_all


class TestReasonCodesCreate:
    async def test_create_requires_auth(self, test_client, seeded_db):
        resp = await test_client.post("/api/reason-codes/", json={"code": "X"})
        assert resp.status_code == 401

    async def test_create_forbids_operator(self, test_client, seeded_db, operator_token):
        resp = await test_client.post(
            "/api/reason-codes/",
            json={"code": "X"},
            headers={"Authorization": f"Bearer {operator_token}"},
        )
        assert resp.status_code == 403

    async def test_create_basic(self, test_client, seeded_db, admin_token):
        resp = await test_client.post(
            "/api/reason-codes/",
            json={"code": "MAT", "description": "Material out", "category": "Material"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["code"] == "MAT"
        assert data["description"] == "Material out"
        assert data["category"] == "Material"
        assert data["is_active"] is True

    async def test_create_duplicate_returns_409(self, test_client, seeded_db, admin_token):
        await test_client.post(
            "/api/reason-codes/",
            json={"code": "DUP"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        resp = await test_client.post(
            "/api/reason-codes/",
            json={"code": "DUP"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 409


class TestReasonCodesUpdate:
    async def test_update_missing_returns_404(self, test_client, seeded_db, admin_token):
        resp = await test_client.put(
            "/api/reason-codes/99999",
            json={"description": "ghost"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 404

    async def test_update_partial(self, test_client, seeded_db, admin_token):
        created = await test_client.post(
            "/api/reason-codes/",
            json={"code": "ORIG", "description": "old"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        rc_id = created.json()["id"]

        resp = await test_client.put(
            f"/api/reason-codes/{rc_id}",
            json={"description": "new"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["code"] == "ORIG"  # unchanged
        assert data["description"] == "new"

    async def test_update_code_collision_returns_409(self, test_client, seeded_db, admin_token):
        a = await test_client.post(
            "/api/reason-codes/", json={"code": "A"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        await test_client.post(
            "/api/reason-codes/", json={"code": "B"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        resp = await test_client.put(
            f"/api/reason-codes/{a.json()['id']}",
            json={"code": "B"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 409

    async def test_reactivate_via_update(self, test_client, seeded_db, admin_token):
        created = await test_client.post(
            "/api/reason-codes/", json={"code": "Z"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        rc_id = created.json()["id"]
        # Soft-delete
        await test_client.delete(
            f"/api/reason-codes/{rc_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        # Revive via PUT
        resp = await test_client.put(
            f"/api/reason-codes/{rc_id}",
            json={"is_active": True},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["is_active"] is True


class TestReasonCodesDelete:
    async def test_delete_requires_auth(self, test_client, seeded_db):
        resp = await test_client.delete("/api/reason-codes/1")
        assert resp.status_code == 401

    async def test_delete_missing_returns_404(self, test_client, seeded_db, admin_token):
        resp = await test_client.delete(
            "/api/reason-codes/99999",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 404

    async def test_delete_is_soft(self, test_client, seeded_db, admin_token):
        """Delete sets is_active=False but keeps the row."""
        created = await test_client.post(
            "/api/reason-codes/", json={"code": "SOFT"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        rc_id = created.json()["id"]

        resp = await test_client.delete(
            f"/api/reason-codes/{rc_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 204

        # Row still exists (visible without active_only filter)
        all_resp = await test_client.get("/api/reason-codes/")
        found = next((rc for rc in all_resp.json() if rc["id"] == rc_id), None)
        assert found is not None
        assert found["is_active"] is False
