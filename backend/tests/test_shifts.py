"""
SmartPOS AI – Shift Management Tests

Covers: open, close, current, history, double-open guard, cash reconciliation.
"""
from __future__ import annotations

import pytest
from decimal import Decimal
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def _open_shift(client: AsyncClient, headers: dict, cash: float = 500.0) -> dict:
    resp = await client.post("/api/v1/shifts/open", json={
        "store_id":     1,
        "opening_cash": cash,
        "notes":        "Morning shift",
    }, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ─── Open Shift ───────────────────────────────────────────────────────────────

async def test_open_shift(client: AsyncClient, auth_headers: dict):
    shift = await _open_shift(client, auth_headers)
    assert shift["status"]       == "open"
    assert float(shift["opening_cash"]) == 500.0
    assert shift["total_sales"]  == 0
    assert shift["opened_by_name"] is not None


async def test_open_shift_missing_store_id(client: AsyncClient, auth_headers: dict):
    resp = await client.post("/api/v1/shifts/open", json={
        "opening_cash": 100.0,
    }, headers=auth_headers)
    assert resp.status_code == 422


async def test_open_shift_negative_cash_rejected(client: AsyncClient, auth_headers: dict):
    resp = await client.post("/api/v1/shifts/open", json={
        "store_id": 1, "opening_cash": -100.0,
    }, headers=auth_headers)
    assert resp.status_code == 422


async def test_cannot_open_second_shift_while_one_is_open(client: AsyncClient, auth_headers: dict):
    await _open_shift(client, auth_headers)
    resp = await client.post("/api/v1/shifts/open", json={
        "store_id": 1, "opening_cash": 0.0,
    }, headers=auth_headers)
    assert resp.status_code == 409
    assert "already have an open shift" in resp.json()["detail"]


# ─── Current Shift ────────────────────────────────────────────────────────────

async def test_current_shift_returns_open_shift(client: AsyncClient, auth_headers: dict):
    opened = await _open_shift(client, auth_headers)
    resp   = await client.get("/api/v1/shifts/current?store_id=1", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"]     == opened["id"]
    assert data["status"] == "open"


async def test_current_shift_returns_none_when_no_open_shift(client: AsyncClient, auth_headers: dict):
    resp = await client.get("/api/v1/shifts/current?store_id=1", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() is None


# ─── Close Shift ──────────────────────────────────────────────────────────────

async def test_close_shift(client: AsyncClient, auth_headers: dict):
    shift = await _open_shift(client, auth_headers, cash=1000.0)
    sid   = shift["id"]

    resp = await client.post(f"/api/v1/shifts/{sid}/close", json={
        "closing_cash": 1000.0,
        "notes":        "End of day",
    }, headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"]       == "closed"
    assert data["closed_at"]    is not None
    assert float(data["closing_cash"]) == 1000.0


async def test_close_shift_computes_variance(client: AsyncClient, auth_headers: dict):
    shift = await _open_shift(client, auth_headers, cash=500.0)
    sid   = shift["id"]

    # No sales → expected_cash = 500 (opening + 0 cash_sales)
    resp = await client.post(f"/api/v1/shifts/{sid}/close", json={
        "closing_cash": 480.0,  # ₹20 short
    }, headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    # cash_variance = closing_cash(480) - expected_cash(500) = -20
    assert float(data["cash_variance"]) == pytest.approx(-20.0, abs=0.01)


async def test_cannot_close_already_closed_shift(client: AsyncClient, auth_headers: dict):
    shift = await _open_shift(client, auth_headers)
    sid   = shift["id"]

    await client.post(f"/api/v1/shifts/{sid}/close", json={"closing_cash": 500.0}, headers=auth_headers)
    resp = await client.post(f"/api/v1/shifts/{sid}/close", json={"closing_cash": 500.0}, headers=auth_headers)
    assert resp.status_code == 400


# ─── Shift History ────────────────────────────────────────────────────────────

async def test_list_shifts(client: AsyncClient, auth_headers: dict):
    shift = await _open_shift(client, auth_headers)
    await client.post(f"/api/v1/shifts/{shift['id']}/close", json={"closing_cash": 500.0}, headers=auth_headers)

    resp = await client.get("/api/v1/shifts?store_id=1", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    assert len(data["items"]) >= 1


async def test_get_shift_by_id(client: AsyncClient, auth_headers: dict):
    shift = await _open_shift(client, auth_headers)
    sid   = shift["id"]

    resp = await client.get(f"/api/v1/shifts/{sid}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == sid


async def test_get_nonexistent_shift_returns_404(client: AsyncClient, auth_headers: dict):
    resp = await client.get("/api/v1/shifts/99999", headers=auth_headers)
    assert resp.status_code == 404
