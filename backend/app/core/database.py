"""
SmartPOS AI – Database Layer (Phase 1A)

Architecture:
  • Async SQLAlchemy engine for FastAPI (asyncpg driver)
  • Per-request PostgreSQL GUC variable → RLS policies enforce tenant isolation
  • Every table has store_id as the tenant discriminator
  • RLS policies are created by the migration scripts, not here

Multi-tenant flow:
  1. JWT decoded → user.store_id extracted
  2. set_tenant_context() executes SET LOCAL app.current_tenant_id = <id>
  3. All queries automatically filtered by RLS policy WHERE store_id = current_setting(...)
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Optional

from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import (
    AsyncConnection,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

logger = logging.getLogger("smartpos.db")


# ─── Base Model ───────────────────────────────────────────────────────────────

class Base(DeclarativeBase):
    """All ORM models inherit from this."""
    pass


# ─── Engine Factory ───────────────────────────────────────────────────────────

def _make_engine(url: str, is_sqlite: bool = False):
    kwargs: dict = {
        "echo": settings.DEBUG,
        "pool_pre_ping": True,
    }
    if not is_sqlite:
        kwargs.update({
            "pool_size":    settings.DB_POOL_SIZE,
            "max_overflow": settings.DB_MAX_OVERFLOW,
            "pool_recycle": settings.DB_POOL_RECYCLE,
        })
    else:
        kwargs["connect_args"] = {"check_same_thread": False}
    return create_async_engine(url, **kwargs)


# Cloud PostgreSQL engine (primary)
engine = _make_engine(settings.DATABASE_URL)

# Local SQLite engine (offline-first device cache)
sqlite_engine = _make_engine(settings.SQLITE_URL, is_sqlite=True)


# ─── Session Factories ────────────────────────────────────────────────────────

AsyncSessionFactory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)

LocalSessionFactory = async_sessionmaker(
    sqlite_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


# ─── Tenant Context ───────────────────────────────────────────────────────────

async def set_tenant_context(
    session: AsyncSession, tenant_id: Optional[int]
) -> None:
    """
    Set the PostgreSQL GUC variable for RLS isolation.

    Uses SET LOCAL so the variable is automatically reset at transaction end.
    This is the only thing that makes multi-tenant RLS work correctly.

    Call this at the start of every request that touches the DB.
    """
    if tenant_id is None:
        return
    try:
        await session.execute(
            text(f"SET LOCAL {settings.RLS_GUC_VAR} = :tid"),
            {"tid": str(tenant_id)},
        )
    except Exception as exc:
        # SQLite doesn't support SET LOCAL – silently skip for local dev
        if "sqlite" not in str(type(session.bind)).lower():
            logger.warning("Failed to set tenant context: %s", exc)


# ─── FastAPI Dependencies ─────────────────────────────────────────────────────

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency: yields a cloud DB session.
    Tenant context is set by the auth middleware after this yields.
    """
    async with AsyncSessionFactory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def get_local_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency: yields a local SQLite session (offline mode)."""
    async with LocalSessionFactory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


@asynccontextmanager
async def tenant_session(
    tenant_id: int,
) -> AsyncGenerator[AsyncSession, None]:
    """
    Context manager for background tasks / Celery workers.
    Automatically sets tenant context on the session.

    Usage:
        async with tenant_session(store_id=42) as db:
            result = await db.execute(...)
    """
    async with AsyncSessionFactory() as session:
        try:
            await set_tenant_context(session, tenant_id)
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ─── DB Init ──────────────────────────────────────────────────────────────────

async def init_db() -> None:
    """
    Create all tables (dev/test only).
    In production, use Alembic migrations: alembic upgrade head
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        if not settings.DATABASE_URL.startswith("sqlite"):
            await _apply_dev_schema_compat(conn)
    logger.info("Database tables initialized")


async def _apply_dev_schema_compat(conn: AsyncConnection) -> None:
    """Patch existing demo volumes that predate newer nullable columns."""
    statements = [
        "ALTER TABLE customers ADD COLUMN IF NOT EXISTS price_category_id INTEGER REFERENCES price_categories(id)",
        "ALTER TABLE sales ADD COLUMN IF NOT EXISTS shift_id INTEGER REFERENCES shift_sessions(id)",
        "ALTER TABLE sales ADD COLUMN IF NOT EXISTS price_category_id INTEGER REFERENCES price_categories(id)",
    ]
    for statement in statements:
        await conn.execute(text(statement))


async def drop_db() -> None:
    """Drop all tables. TEST USE ONLY."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
