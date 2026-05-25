"""SmartPOS AI – FastAPI Application (Phase 1A)"""

from __future__ import annotations

import logging
import time
import uuid
from contextlib import asynccontextmanager
from typing import Callable

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.database import engine, init_db
from app.routes import (
    analytics,
    auth,
    backup,
    billing,
    credit,
    health,
    inventory,
    loyalty,
    price_categories,
    shifts,
    voice,
    whatsapp,
)

logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
log = logging.getLogger("smartpos")


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("SmartPOS AI %s starting [%s]", settings.APP_VERSION, settings.APP_ENV)

    if settings.APP_ENV in ("development", "test"):
        await init_db()
        log.info("Database tables initialized")

        from app.core.database import AsyncSessionFactory

        # Seed reference HSN codes in dev. This is helpful, but demo data should
        # still load if a reference row is incompatible with the current schema.
        try:
            from app.services.gst.hsn_seeder import seed_hsn_codes
            async with AsyncSessionFactory() as db:
                n = await seed_hsn_codes(db)
                await db.commit()
                log.info("HSN codes seeded: %d records", n)
        except Exception as exc:
            log.warning("HSN seed skipped: %s", exc)

        try:
            from app.dev_seed import seed_demo_data
            async with AsyncSessionFactory() as db:
                await seed_demo_data(db)
                await db.commit()
                log.info("Demo data seeded")
        except Exception as exc:
            log.warning("Demo seed skipped: %s", exc)

    log.info("Ready → http://localhost:8000/api/docs")
    yield
    log.info("Shutting down")
    await engine.dispose()


app = FastAPI(
    title="SmartPOS AI Community Edition",
    description="Community Edition POS · GST-compliant · Offline-first · Demo-safe",
    version=settings.APP_VERSION,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Process-Time", "X-Request-ID"],
)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.ALLOWED_HOSTS)


@app.middleware("http")
async def request_logger(request: Request, call_next: Callable) -> Response:
    rid   = str(uuid.uuid4())[:8]
    start = time.perf_counter()
    try:
        resp = await call_next(request)
    except Exception as exc:
        log.error("[%s] 500 %s %s — %s", rid, request.method, request.url.path, exc)
        return JSONResponse(status_code=500, content={"detail": "Internal server error", "request_id": rid})
    ms = round((time.perf_counter() - start) * 1000, 1)
    log.info("[%s] %s %s → %d (%sms)", rid, request.method, request.url.path, resp.status_code, ms)
    resp.headers["X-Request-ID"]   = rid
    resp.headers["X-Process-Time"] = f"{ms}ms"
    return resp


@app.exception_handler(Exception)
async def global_exc_handler(request: Request, exc: Exception):
    log.error("Unhandled: %s %s — %s", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


V1 = "/api/v1"
app.include_router(health.router)
app.include_router(auth.router,      prefix=f"{V1}/auth",      tags=["Auth"])
app.include_router(billing.router,   prefix=f"{V1}/billing",   tags=["Billing"])
app.include_router(inventory.router, prefix=f"{V1}/inventory", tags=["Inventory"])
app.include_router(credit.router,    prefix=f"{V1}/credit",    tags=["Credit"])
app.include_router(analytics.router, prefix=f"{V1}/analytics", tags=["Analytics"])
app.include_router(backup.router,          prefix=f"{V1}/backup",           tags=["Backup"])
app.include_router(price_categories.router, prefix=f"{V1}/price-categories", tags=["Price Categories"])
app.include_router(shifts.router,          prefix=f"{V1}/shifts",           tags=["Shifts"])
app.include_router(whatsapp.router,        prefix=f"{V1}/whatsapp",         tags=["WhatsApp"])
app.include_router(voice.router,           prefix=f"{V1}/voice",            tags=["Voice Billing"])
app.include_router(loyalty.router,         prefix=f"{V1}/loyalty",          tags=["Loyalty"])
