"""Unit tests for git_service - async git CLI wrapper for project sharing."""

import asyncio
import subprocess
from pathlib import Path

import pytest

from app.services import git_service


# ─── Helpers ───

def _run(cmd: list[str], cwd: Path) -> None:
    """Run a synchronous git command in setup helpers (not under test)."""
    subprocess.run(cmd, cwd=str(cwd), check=True, capture_output=True)


def _init_repo(path: Path, with_commit: bool = True) -> None:
    """Initialize an empty git repo, optionally with an initial commit."""
    path.mkdir(parents=True, exist_ok=True)
    _run(["git", "init", "-b", "main"], path)
    _run(["git", "config", "user.email", "test@example.com"], path)
    _run(["git", "config", "user.name", "Test"], path)
    _run(["git", "config", "commit.gpgsign", "false"], path)
    if with_commit:
        (path / "initial.hmi.json").write_text('{"name": "initial"}')
        _run(["git", "add", "initial.hmi.json"], path)
        _run(["git", "commit", "-m", "initial"], path)


# ─── is_git_repo ───

class TestIsGitRepo:
    def test_detects_repo(self, tmp_path):
        _init_repo(tmp_path)
        assert git_service.is_git_repo(tmp_path) is True

    def test_non_repo_returns_false(self, tmp_path):
        assert git_service.is_git_repo(tmp_path) is False


# ─── git_status ───

class TestGitStatus:
    async def test_clean_repo(self, tmp_path):
        _init_repo(tmp_path)
        status = await git_service.git_status(tmp_path)
        assert status["available"] is True
        assert status["branch"] == "main"
        assert status["dirty"] is False
        assert status["changed_files"] == []
        assert status["has_remote"] is False
        assert status["ahead"] == 0
        assert status["behind"] == 0

    async def test_dirty_repo_lists_changes(self, tmp_path):
        _init_repo(tmp_path)
        # Add a new project file (untracked)
        (tmp_path / "new.hmi.json").write_text('{"name": "new"}')
        # Modify an existing tracked file
        (tmp_path / "initial.hmi.json").write_text('{"name": "changed"}')

        status = await git_service.git_status(tmp_path)
        assert status["dirty"] is True
        files = {f["file"]: f["status"] for f in status["changed_files"]}
        assert "new.hmi.json" in files
        assert files["new.hmi.json"] == "new"
        assert "initial.hmi.json" in files
        assert files["initial.hmi.json"] == "modified"

    async def test_non_repo_returns_unavailable(self, tmp_path):
        status = await git_service.git_status(tmp_path)
        assert status["available"] is False
        assert "reason" in status

    async def test_ahead_behind_with_remote(self, tmp_path):
        # Create a remote repo and clone it so upstream tracking works
        remote = tmp_path / "remote.git"
        _run(["git", "init", "--bare", "-b", "main", str(remote)], tmp_path)

        local = tmp_path / "local"
        _run(["git", "clone", str(remote), str(local)], tmp_path)
        _run(["git", "config", "user.email", "t@example.com"], local)
        _run(["git", "config", "user.name", "T"], local)
        _run(["git", "config", "commit.gpgsign", "false"], local)

        # Seed initial commit and push so upstream exists
        (local / "a.hmi.json").write_text("{}")
        _run(["git", "add", "a.hmi.json"], local)
        _run(["git", "commit", "-m", "seed"], local)
        _run(["git", "push", "-u", "origin", "main"], local)

        # Create one local commit (now ahead by 1)
        (local / "b.hmi.json").write_text("{}")
        _run(["git", "add", "b.hmi.json"], local)
        _run(["git", "commit", "-m", "ahead"], local)

        status = await git_service.git_status(local)
        assert status["has_remote"] is True
        assert status["ahead"] == 1
        assert status["behind"] == 0


# ─── git_log ───

class TestGitLog:
    async def test_returns_recent_commits(self, tmp_path):
        _init_repo(tmp_path)
        (tmp_path / "a.hmi.json").write_text("{}")
        _run(["git", "add", "a.hmi.json"], tmp_path)
        _run(["git", "commit", "-m", "second commit"], tmp_path)

        log = await git_service.git_log(tmp_path, limit=10)
        assert len(log) == 2
        # Most recent first
        assert log[0]["message"] == "second commit"
        assert log[1]["message"] == "initial"
        # Shape
        for entry in log:
            assert set(entry.keys()) == {"hash", "short", "author", "date", "message"}
            assert len(entry["short"]) >= 7

    async def test_respects_limit(self, tmp_path):
        _init_repo(tmp_path)
        for i in range(3):
            (tmp_path / f"f{i}.hmi.json").write_text("{}")
            _run(["git", "add", f"f{i}.hmi.json"], tmp_path)
            _run(["git", "commit", "-m", f"c{i}"], tmp_path)
        log = await git_service.git_log(tmp_path, limit=2)
        assert len(log) == 2

    async def test_non_repo_returns_empty(self, tmp_path):
        log = await git_service.git_log(tmp_path)
        assert log == []


# ─── git_commit ───

class TestGitCommit:
    async def test_commits_staged_project_files(self, tmp_path):
        _init_repo(tmp_path)
        (tmp_path / "new.hmi.json").write_text('{"x": 1}')

        result = await git_service.git_commit(tmp_path, "add new screen")
        assert result["success"] is True
        assert "Committed" in result["message"]

        # Confirm commit landed
        log = await git_service.git_log(tmp_path, limit=5)
        assert log[0]["message"] == "add new screen"

    async def test_no_changes_returns_failure(self, tmp_path):
        _init_repo(tmp_path)
        result = await git_service.git_commit(tmp_path, "nothing to do")
        assert result["success"] is False
        assert "No project files" in result["message"]

    async def test_ignores_non_project_files(self, tmp_path):
        _init_repo(tmp_path)
        # Only a non-project file changed — should not be picked up by glob
        (tmp_path / "note.txt").write_text("scratch")
        result = await git_service.git_commit(tmp_path, "should fail")
        assert result["success"] is False


# ─── git_diff ───

class TestGitDiff:
    async def test_diff_modified_file(self, tmp_path):
        _init_repo(tmp_path)
        (tmp_path / "initial.hmi.json").write_text('{"name": "modified"}')
        result = await git_service.git_diff(tmp_path, "initial.hmi.json")
        assert result["file"] == "initial.hmi.json"
        assert "modified" in result["diff"]
        assert result["truncated"] is False

    async def test_diff_untracked_file(self, tmp_path):
        _init_repo(tmp_path)
        (tmp_path / "brand_new.hmi.json").write_text('{"fresh": true}')
        result = await git_service.git_diff(tmp_path, "brand_new.hmi.json")
        # Untracked fallback renders file contents as + lines
        assert "+" in result["diff"]
        assert "fresh" in result["diff"]

    async def test_diff_truncation(self, tmp_path):
        _init_repo(tmp_path)
        lines = "\n".join(f"line{i}" for i in range(600))
        (tmp_path / "initial.hmi.json").write_text(lines)
        result = await git_service.git_diff(tmp_path, "initial.hmi.json", max_lines=50)
        assert result["truncated"] is True
        assert result["total_lines"] > 50
        assert len(result["diff"].splitlines()) <= 50


# ─── git_branches ───

class TestGitBranches:
    async def test_lists_branches(self, tmp_path):
        _init_repo(tmp_path)
        _run(["git", "branch", "feature-x"], tmp_path)
        result = await git_service.git_branches(tmp_path)
        assert "main" in result["branches"]
        assert "feature-x" in result["branches"]
        assert result["current"] == "main"

    async def test_non_repo_returns_empty(self, tmp_path):
        result = await git_service.git_branches(tmp_path)
        assert result == {"branches": [], "current": ""}


# ─── git_checkout ───

class TestGitCheckout:
    async def test_switches_branch(self, tmp_path):
        _init_repo(tmp_path)
        _run(["git", "branch", "feature-x"], tmp_path)

        result = await git_service.git_checkout(tmp_path, "feature-x")
        assert result["success"] is True

        info = await git_service.git_branches(tmp_path)
        assert info["current"] == "feature-x"

    async def test_rejects_unknown_branch(self, tmp_path):
        _init_repo(tmp_path)
        result = await git_service.git_checkout(tmp_path, "nonexistent")
        assert result["success"] is False
        assert "does not exist" in result["message"]


# ─── git_push / git_pull (error paths only — no remote) ───

class TestGitPushPull:
    async def test_push_without_remote_fails(self, tmp_path):
        _init_repo(tmp_path)
        result = await git_service.git_push(tmp_path)
        assert result["success"] is False
        assert "Push failed" in result["message"]

    async def test_pull_without_remote_fails(self, tmp_path):
        _init_repo(tmp_path)
        result = await git_service.git_pull(tmp_path)
        assert result["success"] is False


# ─── _run_git timeout ───

class TestRunGitTimeout:
    async def test_timeout_returns_sentinel(self, tmp_path, monkeypatch):
        """Verify timeout handling: a hung command is killed and returns rc=-1."""
        _init_repo(tmp_path)

        # Patch wait_for to raise TimeoutError immediately
        original_wait_for = asyncio.wait_for

        async def fake_wait_for(coro, timeout):
            # Consume the coroutine so we don't leak a pending task
            coro.close()
            raise asyncio.TimeoutError

        monkeypatch.setattr(asyncio, "wait_for", fake_wait_for)

        rc, stdout, stderr = await git_service._run_git(tmp_path, "status")
        assert rc == -1
        assert "timed out" in stderr.lower()
