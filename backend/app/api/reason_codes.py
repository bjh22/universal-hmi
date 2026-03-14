from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.reason_code import ReasonCode
from app.models.user import User, UserRole
from app.api.deps import require_role

router = APIRouter(prefix="/api/reason-codes", tags=["reason-codes"])


class ReasonCodeCreate(BaseModel):
    code: str
    description: str | None = None
    category: str | None = None
    sort_order: int = 0


class ReasonCodeUpdate(BaseModel):
    code: str | None = None
    description: str | None = None
    category: str | None = None
    sort_order: int | None = None
    is_active: bool | None = None


def _out(rc: ReasonCode) -> dict:
    return {
        "id": rc.id,
        "code": rc.code,
        "description": rc.description,
        "category": rc.category,
        "sort_order": rc.sort_order,
        "is_active": rc.is_active,
    }


@router.get("/")
async def list_reason_codes(
    active_only: bool = False,
    session: AsyncSession = Depends(get_db),
):
    query = select(ReasonCode).order_by(ReasonCode.sort_order, ReasonCode.code)
    if active_only:
        query = query.where(ReasonCode.is_active == True)  # noqa: E712
    result = await session.execute(query)
    return [_out(rc) for rc in result.scalars().all()]


@router.post("/", status_code=201)
async def create_reason_code(
    body: ReasonCodeCreate,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    existing = await session.execute(
        select(ReasonCode).where(ReasonCode.code == body.code)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Reason code already exists")

    rc = ReasonCode(
        code=body.code,
        description=body.description,
        category=body.category,
        sort_order=body.sort_order,
    )
    session.add(rc)
    await session.commit()
    await session.refresh(rc)
    return _out(rc)


@router.put("/{rc_id}")
async def update_reason_code(
    rc_id: int,
    body: ReasonCodeUpdate,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    rc = await session.get(ReasonCode, rc_id)
    if not rc:
        raise HTTPException(status_code=404, detail="Reason code not found")

    if body.code is not None:
        # Check uniqueness
        existing = await session.execute(
            select(ReasonCode).where(ReasonCode.code == body.code, ReasonCode.id != rc_id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Reason code already exists")
        rc.code = body.code
    if body.description is not None:
        rc.description = body.description
    if body.category is not None:
        rc.category = body.category
    if body.sort_order is not None:
        rc.sort_order = body.sort_order
    if body.is_active is not None:
        rc.is_active = body.is_active

    await session.commit()
    return _out(rc)


@router.delete("/{rc_id}", status_code=204)
async def delete_reason_code(
    rc_id: int,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    rc = await session.get(ReasonCode, rc_id)
    if not rc:
        raise HTTPException(status_code=404, detail="Reason code not found")
    # Soft-delete
    rc.is_active = False
    await session.commit()
