"""
FastAPI "dependencies" — reusable functions that run before route handlers.
Used here for authentication and authorization. Instead of repeating auth
logic in every route, we define it once here and inject it via Depends().
"""

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.user import User, UserRole

# HTTPBearer extracts the JWT token from the "Authorization: Bearer <token>" header.
# auto_error=False means a missing token returns None instead of raising 401,
# which allows some endpoints to work for both authenticated and anonymous users.
security = HTTPBearer(auto_error=False)


async def get_current_user(
    # Depends() is FastAPI's dependency injection system. When a route declares
    # `user = Depends(get_current_user)`, FastAPI automatically calls this function
    # and passes the result. This keeps auth logic in one place.
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    session: AsyncSession = Depends(get_db),
) -> User | None:
    """Decode the JWT token, look up the user in the database, and return the User object.
    Returns None if no token was provided (anonymous access)."""
    if credentials is None:
        return None
    # Decode and verify the JWT signature and expiration
    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    # "sub" (subject) is the standard JWT claim containing the user's ID
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = await session.get(User, int(user_id))
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def require_role(*roles: UserRole):
    """A "dependency factory" — returns a dependency function configured for specific roles.
    Example: Depends(require_role(UserRole.DESIGNER)) ensures only designers can access
    that endpoint. Returns 401 if not logged in, 403 if the user's role isn't allowed."""

    async def checker(user: User | None = Depends(get_current_user)):
        if user is None:
            # Allow unauthenticated access only if explicitly listed in the allowed roles
            if UserRole.UNAUTHENTICATED in roles:
                return None
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
        return user

    return checker
