"""
SmartPOS AI – Security Utilities
JWT token creation/verification + password hashing.
"""

from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.core.config import settings

# ─── Password Hashing ─────────────────────────────────────────────────────────

def _to_bytes(value: str) -> bytes:
    return value.encode("utf-8")


def hash_password(plain: str) -> str:
    hashed = bcrypt.hashpw(_to_bytes(plain), bcrypt.gensalt())
    return hashed.decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(_to_bytes(plain), _to_bytes(hashed))


# ─── JWT ──────────────────────────────────────────────────────────────────────

bearer_scheme = HTTPBearer()


def create_access_token(subject: Any, extra: dict[str, Any] | None = None) -> str:
    expire = datetime.now(UTC) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {
        "sub": str(subject),
        "exp": expire,
        "iat": datetime.now(UTC),
        "type": "access",
        **(extra or {}),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(subject: Any) -> str:
    expire = datetime.now(UTC) + timedelta(
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )
    payload = {
        "sub": str(subject),
        "exp": expire,
        "iat": datetime.now(UTC),
        "type": "refresh",
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


# ─── FastAPI Dependencies ─────────────────────────────────────────────────────

def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> int:
    """Return the user_id from a valid access token."""
    payload = decode_token(credentials.credentials)
    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token type")
    return int(payload["sub"])


def require_role(*roles: str):
    """Dependency factory – restricts endpoint to specific roles."""
    def _checker(
        credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    ) -> dict:
        payload = decode_token(credentials.credentials)
        if payload.get("role") not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return payload
    return _checker
