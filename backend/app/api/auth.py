from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.models.audit import AuditAction
from app.models.user import User, UserRole
from app.services.audit_service import log_audit

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class PinLoginRequest(BaseModel):
    pin: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, request: Request, session: AsyncSession = Depends(get_db)):
    result = await session.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    await log_audit(session, AuditAction.LOGIN, user=user.username, source_ip=request.client.host)
    return TokenResponse(
        access_token=token,
        user={"id": user.id, "username": user.username, "display_name": user.display_name, "role": user.role.value},
    )


@router.post("/pin-login", response_model=TokenResponse)
async def pin_login(body: PinLoginRequest, request: Request, session: AsyncSession = Depends(get_db)):
    """Login with PIN (for Operator/Supervisor roles)."""
    result = await session.execute(
        select(User).where(User.role.in_([UserRole.OPERATOR, UserRole.SUPERVISOR]))
    )
    users = result.scalars().all()
    for user in users:
        if verify_password(body.pin, user.hashed_password) and user.is_active:
            token = create_access_token({"sub": str(user.id), "role": user.role.value})
            await log_audit(session, AuditAction.LOGIN, user=user.username, source_ip=request.client.host)
            return TokenResponse(
                access_token=token,
                user={"id": user.id, "username": user.username, "display_name": user.display_name, "role": user.role.value},
            )
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid PIN")
