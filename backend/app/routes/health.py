"""Health check endpoints — used by Docker, load balancers, and monitoring."""

import time

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db

router = APIRouter()

_start_time = time.time()


def _uptime() -> float:
    return round(time.time() - _start_time, 1)


@router.get("/health", summary="Liveness check")
async def health():
    """Always returns 200 while the process is alive."""
    return {
        "status":   "ok",
        "service":  "smartpos-ai",
        "version":  settings.APP_VERSION,
        "env":      settings.APP_ENV,
        "uptime_s": _uptime(),
    }


@router.get("/health/ready", summary="Readiness check (DB + Redis)")
async def readiness(db: AsyncSession = Depends(get_db)):
    """
    Returns 200 only when all critical dependencies are reachable.
    Load balancers and orchestration health checks use this endpoint.
    """
    checks: dict[str, str] = {}

    # ── Database ────────────────────────────────────────────────────────────────
    try:
        await db.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as exc:
        checks["database"] = f"error: {exc}"

    # ── Redis ───────────────────────────────────────────────────────────────────
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(settings.REDIS_URL, socket_connect_timeout=2)
        await r.ping()
        await r.aclose()
        checks["redis"] = "ok"
    except Exception as exc:
        checks["redis"] = f"error: {exc}"

    all_ok = all(v == "ok" for v in checks.values())

    return {
        "status":   "ready" if all_ok else "degraded",
        "checks":   checks,
        "version":  settings.APP_VERSION,
        "uptime_s": _uptime(),
    }


@router.get("/health/live", summary="Liveness probe (no DB)")
async def liveness():
    """Pure process liveness — no external dependency check."""
    return {"status": "ok", "uptime_s": _uptime()}
