from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_role
from app.core.database import get_db
from app.core.security import hash_password
from app.models.audit import AuditAction
from app.models.user import User, UserRole
from app.services.audit_service import log_audit

router = APIRouter(prefix="/api/users", tags=["users"])


class UserCreate(BaseModel):
    username: str
    display_name: str
    password: str
    role: UserRole


class UserUpdate(BaseModel):
    display_name: str | None = None
    password: str | None = None
    role: UserRole | None = None
    is_active: bool | None = None


class UserOut(BaseModel):
    id: int
    username: str
    display_name: str
    role: UserRole
    is_active: bool

    model_config = {"from_attributes": True}


@router.get("/", response_model=list[UserOut])
async def list_users(
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.SUPERVISOR, UserRole.ENGINEER, UserRole.DESIGNER)),
):
    result = await session.execute(select(User).order_by(User.username))
    return result.scalars().all()


@router.post("/", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreate,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.SUPERVISOR, UserRole.ENGINEER, UserRole.DESIGNER)),
):
    existing = await session.execute(select(User).where(User.username == body.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username already exists")

    user = User(
        username=body.username,
        display_name=body.display_name,
        hashed_password=hash_password(body.password),
        role=body.role,
    )
    session.add(user)
    await session.flush()
    await log_audit(
        session, AuditAction.USER_CREATE, user=current_user.username,
        details=f"Created user {body.username} with role {body.role.value}",
    )
    return user


@router.put("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int,
    body: UserUpdate,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.SUPERVISOR, UserRole.ENGINEER, UserRole.DESIGNER)),
):
    user = await session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if body.display_name is not None:
        user.display_name = body.display_name
    if body.password is not None:
        user.hashed_password = hash_password(body.password)
    if body.role is not None:
        user.role = body.role
    if body.is_active is not None:
        user.is_active = body.is_active
    await session.flush()
    await log_audit(
        session, AuditAction.USER_UPDATE, user=current_user.username,
        details=f"Updated user {user.username}",
    )
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    user = await session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await log_audit(
        session, AuditAction.USER_DELETE, user=current_user.username,
        details=f"Deleted user {user.username}",
    )
    await session.delete(user)
