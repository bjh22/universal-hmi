"""Integration tests for authentication API endpoints."""

import pytest


class TestPasswordLogin:
    async def test_login_success(self, test_client, seeded_db):
        """Valid credentials return a token."""
        resp = await test_client.post("/api/auth/login", json={
            "username": "admin",
            "password": "admin",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["user"]["username"] == "admin"
        assert data["user"]["role"] == "designer"

    async def test_login_wrong_password(self, test_client, seeded_db):
        """Wrong password returns 401."""
        resp = await test_client.post("/api/auth/login", json={
            "username": "admin",
            "password": "wrongpassword",
        })
        assert resp.status_code == 401

    async def test_login_unknown_user(self, test_client, seeded_db):
        """Unknown username returns 401."""
        resp = await test_client.post("/api/auth/login", json={
            "username": "nonexistent",
            "password": "any",
        })
        assert resp.status_code == 401

    async def test_login_missing_fields(self, test_client, seeded_db):
        """Missing fields return 422 validation error."""
        resp = await test_client.post("/api/auth/login", json={
            "username": "admin",
        })
        assert resp.status_code == 422


class TestPinLogin:
    async def test_pin_login_success(self, test_client, seeded_db):
        """Valid PIN returns token for the matching operator/supervisor."""
        resp = await test_client.post("/api/auth/pin-login", json={
            "pin": "1234",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["user"]["username"] == "supervisor"
        assert data["user"]["role"] == "supervisor"

    async def test_pin_login_operator(self, test_client, seeded_db):
        """Operator PIN login works."""
        resp = await test_client.post("/api/auth/pin-login", json={
            "pin": "0000",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["user"]["username"] == "operator"

    async def test_pin_login_invalid(self, test_client, seeded_db):
        """Invalid PIN returns 401."""
        resp = await test_client.post("/api/auth/pin-login", json={
            "pin": "9999",
        })
        assert resp.status_code == 401


class TestRoleEnforcement:
    async def test_authenticated_access(self, test_client, seeded_db, admin_token):
        """Authenticated request with valid token succeeds."""
        resp = await test_client.get(
            "/api/tags/",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200

    async def test_invalid_token_on_protected(self, test_client, seeded_db):
        """Request with invalid token on a protected endpoint returns 401."""
        resp = await test_client.post(
            "/api/tags/",
            json={"name": "test", "data_type": "float"},
            headers={"Authorization": "Bearer invalid.token.here"},
        )
        assert resp.status_code == 401

    async def test_health_always_accessible(self, test_client, seeded_db):
        """Health endpoint is always accessible."""
        resp = await test_client.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
