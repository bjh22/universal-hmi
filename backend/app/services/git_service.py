"""
Git operations for the projects directory.

All functions operate on a given directory path and shell out to the git CLI
via asyncio.create_subprocess_exec (never shell=True) to prevent injection.
"""

import asyncio
import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


async def _run_git(cwd: Path, *args: str, timeout: float = 30.0) -> tuple[int, str, str]:
    """Run a git command in the given directory. Returns (returncode, stdout, stderr)."""
    proc = await asyncio.create_subprocess_exec(
        "git", *args,
        cwd=str(cwd),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.communicate()
        return -1, "", "Command timed out"
    return proc.returncode, stdout.decode(), stderr.decode()


def is_git_repo(directory: Path) -> bool:
    """Check if the directory is inside a git repository."""
    return (directory / ".git").is_dir()


async def git_status(directory: Path) -> dict:
    """Return branch name, dirty files, and ahead/behind counts."""
    # Current branch
    rc, branch, _ = await _run_git(directory, "rev-parse", "--abbrev-ref", "HEAD")
    if rc != 0:
        return {"available": False, "reason": "Not a git repository"}
    branch = branch.strip()

    # Changed files — parse porcelain status codes into human-readable labels
    rc, porcelain, _ = await _run_git(directory, "status", "--porcelain")
    _status_labels = {
        "M": "modified", "A": "added", "D": "deleted",
        "R": "renamed", "?": "new",
    }
    changed_files = []
    for line in porcelain.rstrip().splitlines():
        if not line.strip():
            continue
        code = line[0] if line[0] != " " else line[1]
        name = line[3:]
        label = _status_labels.get(code, "changed")
        changed_files.append({"file": name, "status": label})

    # Ahead/behind remote
    ahead, behind = 0, 0
    has_remote = False
    rc, _, _ = await _run_git(directory, "rev-parse", "--verify", f"{branch}@{{u}}")
    if rc == 0:
        has_remote = True
        rc, counts, _ = await _run_git(
            directory, "rev-list", "--count", "--left-right", f"HEAD...{branch}@{{u}}"
        )
        if rc == 0:
            parts = counts.strip().split()
            if len(parts) == 2:
                ahead, behind = int(parts[0]), int(parts[1])

    return {
        "available": True,
        "branch": branch,
        "dirty": len(changed_files) > 0,
        "changed_files": changed_files,
        "has_remote": has_remote,
        "ahead": ahead,
        "behind": behind,
    }


async def git_log(directory: Path, limit: int = 20) -> list[dict]:
    """Return recent commits as a list of dicts."""
    # Use a delimiter-based format to avoid JSON escaping issues in commit messages
    sep = "---GIT-SEP---"
    fmt = f"%H{sep}%h{sep}%an{sep}%aI{sep}%s"
    rc, out, _ = await _run_git(directory, "log", f"--format={fmt}", f"-{limit}")
    if rc != 0:
        return []
    commits = []
    for line in out.strip().splitlines():
        parts = line.split(sep)
        if len(parts) == 5:
            commits.append({
                "hash": parts[0],
                "short": parts[1],
                "author": parts[2],
                "date": parts[3],
                "message": parts[4],
            })
    return commits


async def git_commit(directory: Path, message: str) -> dict:
    """Stage all .hmi.json files and commit."""
    # Stage only project files
    rc, _, err = await _run_git(directory, "add", "--all", "--", "*.hmi.json")
    if rc != 0:
        return {"success": False, "message": "Failed to stage files", "details": err}

    # Check if there's anything to commit
    rc, diff, _ = await _run_git(directory, "diff", "--cached", "--name-only")
    if rc == 0 and not diff.strip():
        return {"success": False, "message": "No project files to commit"}

    rc, out, err = await _run_git(directory, "commit", "-m", message)
    if rc != 0:
        return {"success": False, "message": "Commit failed", "details": err}

    # Get the commit hash
    rc2, hash_out, _ = await _run_git(directory, "rev-parse", "--short", "HEAD")
    return {
        "success": True,
        "message": f"Committed {hash_out.strip()}" if rc2 == 0 else "Committed",
        "details": out.strip(),
    }


async def git_diff(directory: Path, file: str, max_lines: int = 500) -> dict:
    """Return the diff for a specific file. Tries staged+unstaged first, then unstaged only."""
    # Try HEAD diff (staged + unstaged changes)
    rc, diff_text, _ = await _run_git(directory, "diff", "HEAD", "--", file)
    if rc != 0 or not diff_text.strip():
        # Fall back to unstaged diff (for new untracked files, show the whole file)
        rc, diff_text, _ = await _run_git(directory, "diff", "--", file)
    if rc != 0 or not diff_text.strip():
        # Untracked file — show contents as additions
        path = directory / file
        if path.is_file():
            try:
                content = path.read_text(encoding="utf-8")
                lines = [f"+{l}" for l in content.splitlines()]
                diff_text = f"--- /dev/null\n+++ b/{file}\n" + "\n".join(lines)
            except Exception:
                diff_text = ""

    all_lines = diff_text.splitlines()
    total_lines = len(all_lines)
    truncated = max_lines > 0 and total_lines > max_lines
    if truncated:
        diff_text = "\n".join(all_lines[:max_lines])

    return {
        "file": file,
        "diff": diff_text,
        "truncated": truncated,
        "total_lines": total_lines,
    }


async def git_push(directory: Path) -> dict:
    """Push current branch to origin."""
    rc, out, err = await _run_git(directory, "push", timeout=60.0)
    if rc != 0:
        return {"success": False, "message": "Push failed", "details": err.strip()}
    return {"success": True, "message": "Pushed successfully", "details": (out + err).strip()}


async def git_pull(directory: Path) -> dict:
    """Pull from origin using rebase. Auto-aborts on conflict."""
    rc, out, err = await _run_git(directory, "pull", "--rebase", timeout=60.0)
    if rc != 0:
        # Abort the rebase to leave the repo in a clean state
        await _run_git(directory, "rebase", "--abort")
        return {
            "success": False,
            "message": "Pull failed — possible merge conflict. The pull was aborted. "
                       "Resolve conflicts manually using git on the command line.",
            "details": err.strip(),
        }
    return {"success": True, "message": "Pulled successfully", "details": (out + err).strip()}


async def git_branches(directory: Path) -> dict:
    """List local branches and identify the current one."""
    rc, out, _ = await _run_git(directory, "branch", "--format=%(refname:short) %(HEAD)")
    if rc != 0:
        return {"branches": [], "current": ""}
    branches = []
    current = ""
    for line in out.strip().splitlines():
        parts = line.rsplit(" ", 1)
        if len(parts) == 2:
            name, marker = parts
            name = name.strip()
            branches.append(name)
            if marker.strip() == "*":
                current = name
    return {"branches": branches, "current": current}


async def git_checkout(directory: Path, branch: str) -> dict:
    """Switch to an existing branch (validated against actual branch list)."""
    info = await git_branches(directory)
    if branch not in info["branches"]:
        return {"success": False, "message": f"Branch '{branch}' does not exist"}
    rc, out, err = await _run_git(directory, "checkout", branch)
    if rc != 0:
        return {"success": False, "message": "Checkout failed", "details": err.strip()}
    return {"success": True, "message": f"Switched to branch '{branch}'"}
