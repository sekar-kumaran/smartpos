"""
SmartPOS AI – Auth Service
Handles user registration, login, and token refresh.
"""

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.models import User
from app.schemas.schemas import LoginRequest, RegisterRequest, TokenResponse


class AuthService:

    async def register(self, db: AsyncSession, payload: RegisterRequest) -> User:
        # Check email uniqueness
        existing = await db.execute(select(User).where(User.email == payload.email))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Email already registered")

        user = User(
            name=payload.name,
            email=payload.email,
            phone=payload.phone,
            password_hash=hash_password(payload.password),
            role=payload.role,
            store_id=payload.store_id,
        )
        db.add(user)
        await db.flush()
        return user

    async def login(self, db: AsyncSession, payload: LoginRequest) -> TokenResponse:
        result = await db.execute(select(User).where(User.email == payload.email))
        user: User | None = result.scalar_one_or_none()

        if not user or not verify_password(payload.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )
        if not user.is_active:
            raise HTTPException(status_code=403, detail="Account is deactivated")

        access_token  = create_access_token(user.id, extra={"role": user.role})
        refresh_token = create_refresh_token(user.id)

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            user_id=user.id,
            role=user.role,
        )

    async def refresh(self, db: AsyncSession, refresh_token: str) -> TokenResponse:
        payload = decode_token(refresh_token)
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid refresh token")

        user_id = int(payload["sub"])
        result  = await db.execute(select(User).where(User.id == user_id))
        user: User | None = result.scalar_one_or_none()

        if not user or not user.is_active:
            raise HTTPException(status_code=401, detail="User not found or inactive")

        access_token  = create_access_token(user.id, extra={"role": user.role})
        new_refresh   = create_refresh_token(user.id)

        return TokenResponse(
            access_token=access_token,
            refresh_token=new_refresh,
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            user_id=user.id,
            role=user.role,
        )

    async def login_demo(self, db: AsyncSession) -> TokenResponse:
        if not settings.ENABLE_DEMO_AUTH:
            raise HTTPException(status_code=403, detail="Demo login is disabled")

        result = await db.execute(select(User).where(User.email == settings.DEMO_USER_EMAIL))
        user: User | None = result.scalar_one_or_none()

        if not user:
            from app.dev_seed import seed_demo_data
            await seed_demo_data(db)
            await db.commit()
            result = await db.execute(select(User).where(User.email == settings.DEMO_USER_EMAIL))
            user = result.scalar_one_or_none()

        if not user or not user.is_active:
            raise HTTPException(status_code=404, detail="Demo user not available")

        access_token  = create_access_token(user.id, extra={"role": user.role})
        refresh_token = create_refresh_token(user.id)

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            user_id=user.id,
            role=user.role,
        )

    async def get_user(self, db: AsyncSession, user_id: int) -> User:
        result = await db.execute(select(User).where(User.id == user_id))
        user   = result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user
