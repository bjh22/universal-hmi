"""Integration tests for Tags API endpoints."""

import pytest


class TestTagsList:
    async def test_list_tags(self, test_client, seeded_db, admin_token):
        """GET /api/tags/ returns seeded tags."""
        resp = await test_client.get(
            "/api/tags/",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        # Seeded tags should be in the list (app may also add system tags)
        names = [t["name"] for t in data]
        assert "Pump1.Running" in names
        assert "Tank.Level" in names

    async def test_list_tags_public(self, test_client, seeded_db):
        """GET /api/tags/ allows unauthenticated access (read-only public endpoint)."""
        resp = await test_client.get("/api/tags/")
        assert resp.status_code == 200


class TestTagCRUD:
    async def test_create_tag(self, test_client, seeded_db, admin_token):
        """POST /api/tags/ creates a new tag."""
        import time
        unique_name = f"NewTag.Test.{int(time.time() * 1000)}"
        resp = await test_client.post(
            "/api/tags/",
            json={
                "name": unique_name,
                "display_name": "New Test Tag",
                "data_type": "float",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code in (200, 201)
        data = resp.json()
        assert data["name"] == unique_name

    async def test_create_tag_requires_auth(self, test_client, seeded_db):
        """POST /api/tags/ without auth returns 401."""
        resp = await test_client.post(
            "/api/tags/",
            json={"name": "ShouldFail", "data_type": "float"},
        )
        assert resp.status_code == 401

    async def test_create_tag_requires_role(self, test_client, seeded_db, operator_token):
        """POST /api/tags/ with operator role returns 403."""
        resp = await test_client.post(
            "/api/tags/",
            json={"name": "ShouldFail", "data_type": "float"},
            headers={"Authorization": f"Bearer {operator_token}"},
        )
        assert resp.status_code == 403

    async def test_get_tag_values(self, test_client, seeded_db, admin_token):
        """GET /api/tags/values returns current tag values."""
        resp = await test_client.get(
            "/api/tags/values",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict)


class TestTagWrite:
    async def test_write_tag_value(self, test_client, seeded_db, admin_token):
        """POST /api/tags/values/{name}/write updates a tag value."""
        resp = await test_client.post(
            "/api/tags/values/Tank.Level/write",
            json={"value": 42.5},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200

    async def test_write_nonexistent_tag(self, test_client, seeded_db, admin_token):
        """Writing to a nonexistent tag fails."""
        resp = await test_client.post(
            "/api/tags/values/NoSuchTag/write",
            json={"value": 0},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code in (404, 400)
