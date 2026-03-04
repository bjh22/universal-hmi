from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from app.api.deps import get_current_user
from app.models.audit import AuditAction
from app.models.user import User
from app.services.audit_service import log_audit
from app.services.script_engine import execute_script
from app.services.tag_engine import tag_engine

router = APIRouter(prefix="/api/scripts", tags=["scripts"])


class ScriptRequest(BaseModel):
    script: str
    context_vars: dict | None = None


@router.post("/execute")
async def run_script(
    body: ScriptRequest,
    request: Request,
    current_user: User | None = Depends(get_current_user),
):
    result = await execute_script(
        script=body.script,
        tag_engine=tag_engine,
        user=current_user.username if current_user else "anonymous",
        role=current_user.role.value if current_user else "unauthenticated",
        context_vars=body.context_vars,
    )
    return result
