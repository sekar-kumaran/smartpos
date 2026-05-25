"""
SmartPOS AI – Test Configuration (Phase 1A)
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from typing import AsyncGenerator

from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import app

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)

TestSessionFactory = async_sessionmaker(
    test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


@pytest_asyncio.fixture(scope="session")
async def init_db():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await test_engine.dispose()


@pytest_asyncio.fixture
async def db_session(init_db) -> AsyncGenerator[AsyncSession, None]:
    async with TestSessionFactory() as session:
        await session.begin_nested()
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def _override():
        yield db_session

    app.dependency_overrides[get_db] = _override
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
        timeout=30.0,
    ) as c:
        yield c
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def owner_headers(client: AsyncClient) -> dict:
    await client.post("/api/v1/auth/register", json={
        "name": "Test Owner", "email": "owner@test.com",
        "password": "OwnerPass123!", "role": "owner",
    })
    resp = await client.post("/api/v1/auth/login", json={
        "email": "owner@test.com", "password": "OwnerPass123!",
    })
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest_asyncio.fixture
async def auth_headers(owner_headers: dict) -> dict:
    return owner_headers


@pytest_asyncio.fixture
async def sample_product(client: AsyncClient, owner_headers: dict) -> dict:
    resp = await client.post("/api/v1/inventory/products", json={
        "store_id": 1, "name": "Sample Product", "sku": "SAMPLE-001",
        "cost_price": "50.00", "selling_price": "80.00",
        "gst_rate": "18", "unit": "pcs",
        "min_stock_qty": 10, "reorder_qty": 50, "opening_stock": 100,
    }, headers=owner_headers)
    assert resp.status_code == 201, resp.text
    return resp.json()
