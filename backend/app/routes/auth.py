"""SmartPOS AI – Auth Routes (Phase 1A)"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user_id
from app.schemas.schemas import (
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserOut,
)
from app.services.auth_service import AuthService

router   = APIRouter()
_service = AuthService()


@router.post("/register", response_model=UserOut, status_code=201)
async def register(
    payload: RegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    """Register a new user."""
    user = await _service.register(db, payload)
    return UserOut.model_validate(user)


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate and return JWT tokens."""
    return await _service.login(db, payload)


@router.post("/demo", response_model=TokenResponse)
async def demo_login(
    db: AsyncSession = Depends(get_db),
):
    """Issue demo tokens without a stored plaintext password."""
    return await _service.login_demo(db)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """Refresh an access token using a valid refresh token."""
    refresh_token = body.get("refresh_token", "")
    if not refresh_token:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="refresh_token is required")
    return await _service.refresh(db, refresh_token)


@router.get("/me", response_model=UserOut)
async def me(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Return the current authenticated user's profile."""
    user = await _service.get_user(db, user_id)
    return UserOut.model_validate(user)
