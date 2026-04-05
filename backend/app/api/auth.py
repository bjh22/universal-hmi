"""
Authentication endpoints — login with username/password or PIN.
Returns a JWT (JSON Web Token) that the frontend stores in localStorage and
sends with every subsequent API request to prove the user's identity.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.models.audit import AuditAction
from app.models.user import User, UserRole
from app.services.audit_service import log_audit

# APIRouter groups related endpoints together. The prefix means all routes
# defined here will start with /api/auth (e.g., /api/auth/login).
router = APIRouter(prefix="/api/auth", tags=["auth"])


# --- Pydantic models for request/response validation ---
# These define the expected shape of JSON in requests and responses.
# FastAPI automatically validates incoming JSON against these models
# and returns a 422 error if the data doesn't match (e.g., missing fields).

class LoginRequest(BaseModel):
    username: str
    password: str


class PinLoginRequest(BaseModel):
    pin: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


# --- Login flow: look up user → verify password hash → create JWT → return token ---
# HTTP 401 = bad credentials (wrong username/password)
# HTTP 403 = account exists but is disabled
@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, request: Request, session: AsyncSession = Depends(get_db)):
    # Step 1: Find the user by username in the database
    result = await session.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()
    # Step 2: Verify the password against the stored hash.
    # We never store plain-text passwords — only hashes (one-way transformations).
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    # Step 3: Create a JWT containing the user's ID and role.
    # "sub" (subject) is the standard JWT claim for identifying who the token belongs to.
    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    # Record login event for security tracking and regulatory compliance
    await log_audit(session, AuditAction.LOGIN, user=user.username, source_ip=request.client.host)
    return TokenResponse(
        access_token=token,
        user={"id": user.id, "username": user.username, "display_name": user.display_name, "role": user.role.value},
    )


@router.post("/pin-login", response_model=TokenResponse)
async def pin_login(body: PinLoginRequest, request: Request, session: AsyncSession = Depends(get_db)):
    """Login with PIN (for Operator/Supervisor roles)."""
    # PIN login is a simplified flow for factory-floor use where operators need
    # quick access without typing a username. We fetch all operator/supervisor
    # users and check each PIN hash until we find a match.
    result = await session.execute(
        select(User).where(User.role.in_([UserRole.OPERATOR, UserRole.SUPERVISOR]))
    )
    users = result.scalars().all()
    for user in users:
        if verify_password(body.pin, user.hashed_password) and user.is_active:
            token = create_access_token({"sub": str(user.id), "role": user.role.value})
            # Record login for audit trail (security tracking / regulatory compliance)
            await log_audit(session, AuditAction.LOGIN, user=user.username, source_ip=request.client.host)
            return TokenResponse(
                access_token=token,
                user={"id": user.id, "username": user.username, "display_name": user.display_name, "role": user.role.value},
            )
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid PIN")


@router.post("/logout")
async def logout(
    request: Request,
    session: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    """Record logout event for audit trail. JWT is stateless so actual
    token invalidation is handled client-side by removing it from localStorage."""
    username = current_user.username if current_user else "unknown"
    await log_audit(
        session, AuditAction.LOGOUT,
        user=username,
        source_ip=request.client.host if request.client else None,
    )
    return {"success": True}
