"""Integration tests for /api/projects/git/* endpoints.

The git CLI wrapper (`git_service`) is covered by its own unit tests; here we
focus on routing, role enforcement, and "not a git repo" fallbacks. Actual git
operations are monkey-patched so these tests are fast and don't shell out.
"""

import pytest

from app.services import git_service


class TestProjectGitAuth:
    async def test_status_requires_auth(self, test_client, seeded_db):
        resp = await test_client.get("/api/projects/git/status")
        assert resp.status_code == 401

    async def test_status_forbids_operator(self, test_client, seeded_db, operator_token):
        resp = await test_client.get(
            "/api/projects/git/status",
            headers={"Authorization": f"Bearer {operator_token}"},
        )
        assert resp.status_code == 403

    async def test_commit_requires_auth(self, test_client, seeded_db):
        resp = await test_client.post(
            "/api/projects/git/commit",
            json={"message": "test"},
        )
        assert resp.status_code == 401


class TestProjectGitNonRepoFallback:
    """When the projects directory isn't a git repo, endpoints return safe stubs."""

    async def test_status_non_repo(self, test_client, seeded_db, admin_token, monkeypatch):
        monkeypatch.setattr(git_service, "is_git_repo", lambda d: False)
        resp = await test_client.get(
            "/api/projects/git/status",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["available"] is False

    async def test_log_non_repo(self, test_client, seeded_db, admin_token, monkeypatch):
        monkeypatch.setattr(git_service, "is_git_repo", lambda d: False)
        resp = await test_client.get(
            "/api/projects/git/log",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["available"] is False

    async def test_branches_non_repo(self, test_client, seeded_db, admin_token, monkeypatch):
        monkeypatch.setattr(git_service, "is_git_repo", lambda d: False)
        resp = await test_client.get(
            "/api/projects/git/branches",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        assert resp.json() == {"branches": [], "current": ""}

    async def test_commit_non_repo(self, test_client, seeded_db, admin_token, monkeypatch):
        monkeypatch.setattr(git_service, "is_git_repo", lambda d: False)
        resp = await test_client.post(
            "/api/projects/git/commit",
            json={"message": "nope"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["success"] is False


class TestProjectGitRouting:
    """When the projects directory IS a repo, service layer methods get called."""

    async def test_status_calls_git_status(self, test_client, seeded_db, admin_token, monkeypatch):
        called = {}

        async def fake_status(d):
            called["yes"] = True
            return {"available": True, "branch": "main", "dirty": False,
                    "changed_files": [], "has_remote": False, "ahead": 0, "behind": 0}

        monkeypatch.setattr(git_service, "is_git_repo", lambda d: True)
        monkeypatch.setattr(git_service, "git_status", fake_status)

        resp = await test_client.get(
            "/api/projects/git/status",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        assert called.get("yes") is True
        assert resp.json()["branch"] == "main"

    async def test_log_respects_limit_cap(self, test_client, seeded_db, admin_token, monkeypatch):
        """Limit is capped at 100 by the route handler."""
        captured = {}

        async def fake_log(d, limit=20):
            captured["limit"] = limit
            return []

        monkeypatch.setattr(git_service, "is_git_repo", lambda d: True)
        monkeypatch.setattr(git_service, "git_log", fake_log)

        resp = await test_client.get(
            "/api/projects/git/log?limit=500",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        assert captured["limit"] == 100

    async def test_commit_passes_message(self, test_client, seeded_db, admin_token, monkeypatch):
        captured = {}

        async def fake_commit(d, message):
            captured["msg"] = message
            return {"success": True, "message": "ok", "details": ""}

        monkeypatch.setattr(git_service, "is_git_repo", lambda d: True)
        monkeypatch.setattr(git_service, "git_commit", fake_commit)

        resp = await test_client.post(
            "/api/projects/git/commit",
            json={"message": "feat: add a screen"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        assert captured["msg"] == "feat: add a screen"

    async def test_commit_rejects_empty_message(self, test_client, seeded_db, admin_token):
        resp = await test_client.post(
            "/api/projects/git/commit",
            json={"message": ""},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 422  # Pydantic min_length=1

    async def test_checkout_passes_branch(self, test_client, seeded_db, admin_token, monkeypatch):
        captured = {}

        async def fake_checkout(d, branch):
            captured["branch"] = branch
            return {"success": True, "message": "ok"}

        monkeypatch.setattr(git_service, "is_git_repo", lambda d: True)
        monkeypatch.setattr(git_service, "git_checkout", fake_checkout)

        resp = await test_client.post(
            "/api/projects/git/checkout",
            json={"branch": "develop"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        assert captured["branch"] == "develop"

    async def test_push_and_pull_routing(self, test_client, seeded_db, admin_token, monkeypatch):
        async def fake_push(d):
            return {"success": True, "message": "pushed", "details": ""}

        async def fake_pull(d):
            return {"success": True, "message": "pulled", "details": ""}

        monkeypatch.setattr(git_service, "is_git_repo", lambda d: True)
        monkeypatch.setattr(git_service, "git_push", fake_push)
        monkeypatch.setattr(git_service, "git_pull", fake_pull)

        r_push = await test_client.post(
            "/api/projects/git/push",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        r_pull = await test_client.post(
            "/api/projects/git/pull",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r_push.status_code == 200 and r_push.json()["success"] is True
        assert r_pull.status_code == 200 and r_pull.json()["success"] is True

    async def test_diff_passes_params(self, test_client, seeded_db, admin_token, monkeypatch):
        captured = {}

        async def fake_diff(d, file, max_lines=500):
            captured["file"] = file
            captured["max"] = max_lines
            return {"file": file, "diff": "+added\n", "truncated": False, "total_lines": 1}

        monkeypatch.setattr(git_service, "is_git_repo", lambda d: True)
        monkeypatch.setattr(git_service, "git_diff", fake_diff)

        resp = await test_client.get(
            "/api/projects/git/diff?file=foo.hmi.json&max_lines=100",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        assert captured["file"] == "foo.hmi.json"
        assert captured["max"] == 100
