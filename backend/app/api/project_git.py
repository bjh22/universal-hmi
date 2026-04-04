"""
Git operations API for the projects directory.

Exposes safe git commands (status, commit, push, pull, log, branches, checkout)
so engineers can share project files via a shared git repository directly from
the HMI's Projects page.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.deps import require_role
from app.api.projects import _get_projects_dir
from app.models.user import UserRole
from app.services import git_service

router = APIRouter(prefix="/api/projects/git", tags=["projects-git"])

_ROLE = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER))


def _projects_dir():
    d = _get_projects_dir()
    d.mkdir(parents=True, exist_ok=True)
    return d


# ─── Schemas ───

class GitCommitRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=200)


class GitCheckoutRequest(BaseModel):
    branch: str = Field(..., min_length=1, max_length=100)


# ─── Endpoints ───

@router.get("/status")
async def get_status(_=_ROLE):
    d = _projects_dir()
    if not git_service.is_git_repo(d):
        return {"available": False, "reason": "Projects directory is not a git repository"}
    return await git_service.git_status(d)


@router.get("/diff")
async def get_diff(file: str, max_lines: int = 500, _=_ROLE):
    d = _projects_dir()
    if not git_service.is_git_repo(d):
        return {"file": file, "diff": "", "truncated": False, "total_lines": 0}
    return await git_service.git_diff(d, file, max_lines=max_lines)


@router.get("/log")
async def get_log(limit: int = 20, _=_ROLE):
    d = _projects_dir()
    if not git_service.is_git_repo(d):
        return {"available": False, "reason": "Projects directory is not a git repository"}
    return await git_service.git_log(d, limit=min(limit, 100))


@router.post("/commit")
async def commit(body: GitCommitRequest, _=_ROLE):
    d = _projects_dir()
    if not git_service.is_git_repo(d):
        return {"success": False, "message": "Projects directory is not a git repository"}
    return await git_service.git_commit(d, body.message)


@router.post("/push")
async def push(_=_ROLE):
    d = _projects_dir()
    if not git_service.is_git_repo(d):
        return {"success": False, "message": "Projects directory is not a git repository"}
    return await git_service.git_push(d)


@router.post("/pull")
async def pull(_=_ROLE):
    d = _projects_dir()
    if not git_service.is_git_repo(d):
        return {"success": False, "message": "Projects directory is not a git repository"}
    return await git_service.git_pull(d)


@router.get("/branches")
async def branches(_=_ROLE):
    d = _projects_dir()
    if not git_service.is_git_repo(d):
        return {"branches": [], "current": ""}
    return await git_service.git_branches(d)


@router.post("/checkout")
async def checkout(body: GitCheckoutRequest, _=_ROLE):
    d = _projects_dir()
    if not git_service.is_git_repo(d):
        return {"success": False, "message": "Projects directory is not a git repository"}
    return await git_service.git_checkout(d, body.branch)
