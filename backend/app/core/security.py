"""
Password hashing and JWT (JSON Web Token) creation/verification.

This module handles two core authentication concerns:
1. Storing passwords safely — never store plain text, always hash them.
2. Issuing signed tokens — so the server can verify a user's identity on
   every request without storing session state in a database.
"""

from datetime import datetime, timedelta, timezone

from jose import jwt  # python-jose library for encoding/decoding JWTs
from passlib.context import CryptContext  # multi-algorithm password hashing

from app.core.config import settings

# bcrypt is a one-way hash designed to be intentionally slow, making
# brute-force attacks impractical. "deprecated='auto'" means passlib will
# automatically re-hash passwords if the algorithm is ever upgraded.
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    # [:72] because bcrypt silently ignores bytes beyond 72 — truncating
    # explicitly avoids subtle bugs where two passwords that differ only
    # after byte 72 would hash identically.
    return pwd_context.hash(password[:72])


def verify_password(plain_password: str, hashed_password: str) -> bool:
    # Hashes the plain password and compares it to the stored hash.
    # This is constant-time to prevent timing attacks.
    return pwd_context.verify(plain_password[:72], hashed_password)


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """Encode user data (e.g., user ID, role) into a signed JWT.

    The token contains an "exp" (expiration) claim so it becomes invalid
    automatically after the configured time. The server signs it with
    secret_key — anyone who receives the token can read its contents, but
    only the server can create or verify valid signatures.
    """
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict | None:
    """Verify a JWT's signature and return its payload, or None on any failure.

    Returns None for expired tokens, tampered tokens, or malformed strings.
    Returning None (instead of raising) simplifies auth checks in route handlers —
    they just check `if payload is None: return 401`.
    """
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
    except Exception:
        return None
