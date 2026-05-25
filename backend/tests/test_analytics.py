"""
SmartPOS AI – Analytics & Demand Forecast Tests

Covers: profit summary, dashboard summary, demand forecast, health endpoint,
        revenue trends, top products.
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


# ─── Health ───────────────────────────────────────────────────────────────────

async def test_health_liveness(client: AsyncClient):
    resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"]  == "ok"
    assert "version"  in data
    assert "uptime_s" in data


async def test_health_liveness_dedicated(client: AsyncClient):
    resp = await client.get("/health/live")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


async def test_health_readiness_includes_checks(client: AsyncClient):
    resp = await client.get("/health/ready")
    assert resp.status_code == 200
    data = resp.json()
    assert "checks"   in data
    assert "database" in data["checks"]
    # status is "ready" or "degraded" depending on Redis availability in test
    assert data["status"] in ("ready", "degraded")


# ─── Profit Summary ───────────────────────────────────────────────────────────

async def test_profit_summary_empty_store(client: AsyncClient, auth_headers: dict):
    resp = await client.get(
        "/api/v1/analytics/profit?store_id=1&period=today",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "total_revenue"    in data
    assert "gross_profit"     in data
    assert "total_transactions" in data
    assert float(data["total_revenue"]) >= 0


async def test_profit_summary_period_week(client: AsyncClient, auth_headers: dict):
    resp = await client.get(
        "/api/v1/analytics/profit?store_id=1&period=week",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["period"] == "week"


async def test_profit_summary_period_month(client: AsyncClient, auth_headers: dict):
    resp = await client.get(
        "/api/v1/analytics/profit?store_id=1&period=month",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["period"] == "month"


# ─── Dashboard Summary ────────────────────────────────────────────────────────

async def test_dashboard_summary(client: AsyncClient, auth_headers: dict):
    resp = await client.get(
        "/api/v1/analytics/dashboard?store_id=1",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "profit"    in data
    assert "inventory" in data
    assert "credit"    in data
    assert "alerts"    in data


# ─── Demand Forecast ──────────────────────────────────────────────────────────

async def test_demand_forecast_returns_list(client: AsyncClient, auth_headers: dict):
    resp = await client.get(
        "/api/v1/analytics/demand-forecast?store_id=1",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


async def test_demand_forecast_structure(client: AsyncClient, auth_headers: dict, sample_product: dict):
    resp = await client.get(
        "/api/v1/analytics/demand-forecast?store_id=1&days_history=30&forecast_days=7",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    items = resp.json()
    # If any items exist, verify structure
    for item in items:
        assert "product_id"        in item
        assert "product_name"      in item
        assert "current_stock"     in item
        assert "avg_daily_sales"   in item
        assert "forecast_7d"       in item
        assert "reorder_suggested" in item
        assert isinstance(item["reorder_suggested"], bool)


async def test_demand_forecast_custom_window(client: AsyncClient, auth_headers: dict):
    resp = await client.get(
        "/api/v1/analytics/demand-forecast?store_id=1&days_history=7&forecast_days=3",
        headers=auth_headers,
    )
    assert resp.status_code == 200


# ─── Revenue Trend ────────────────────────────────────────────────────────────

async def test_revenue_trend(client: AsyncClient, auth_headers: dict):
    resp = await client.get(
        "/api/v1/analytics/revenue-trend?store_id=1&days=7",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    for point in data:
        assert "date"    in point
        assert "revenue" in point


# ─── Top Products ─────────────────────────────────────────────────────────────

async def test_top_products(client: AsyncClient, auth_headers: dict):
    resp = await client.get(
        "/api/v1/analytics/top-products?store_id=1&limit=5",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
    assert len(resp.json()) <= 5


# ─── Alerts ───────────────────────────────────────────────────────────────────

async def test_alerts_list(client: AsyncClient, auth_headers: dict):
    resp = await client.get(
        "/api/v1/analytics/alerts?store_id=1",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data or isinstance(data, list)
