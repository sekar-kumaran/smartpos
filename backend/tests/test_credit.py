"""
SmartPOS AI – Credit & Customer Tests

Covers: customer CRUD, customer search, credit creation, repayment, exposure,
        outstanding balance, overdue status.
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def _create_customer(
    client: AsyncClient,
    headers: dict,
    name: str = "Rahul Sharma",
    phone: str = "9876500001",
) -> dict:
    resp = await client.post("/api/v1/credit/customers", json={
        "store_id": 1, "name": name, "phone": phone,
        "address": "MG Road, Bengaluru",
    }, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _create_credit(
    client: AsyncClient, headers: dict, customer_id: int, amount: float = 500.0
) -> dict:
    resp = await client.post("/api/v1/credit/", json={
        "store_id": 1, "customer_id": customer_id, "amount": str(amount),
    }, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ─── Customer CRUD ────────────────────────────────────────────────────────────

async def test_create_customer(client: AsyncClient, auth_headers: dict):
    cust = await _create_customer(client, auth_headers)
    assert cust["name"]    == "Rahul Sharma"
    assert cust["phone"]   == "9876500001"
    assert cust["store_id"] == 1
    assert float(cust["total_credit_given"])  == 0.0
    assert float(cust["outstanding_balance"]) == 0.0


async def test_list_customers(client: AsyncClient, auth_headers: dict):
    await _create_customer(client, auth_headers, name="Alice", phone="9000000010")
    await _create_customer(client, auth_headers, name="Bob",   phone="9000000011")

    resp = await client.get("/api/v1/credit/customers?store_id=1", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 2
    assert len(data["items"]) >= 2


async def test_customer_search_by_name(client: AsyncClient, auth_headers: dict):
    await _create_customer(client, auth_headers, name="Himalaya Hotels", phone="9100000001")
    await _create_customer(client, auth_headers, name="Taj Residency",   phone="9100000002")

    resp = await client.get(
        "/api/v1/credit/customers?store_id=1&search=himalaya",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) >= 1
    assert all("himalaya" in i["name"].lower() for i in items)


async def test_customer_search_by_phone(client: AsyncClient, auth_headers: dict):
    await _create_customer(client, auth_headers, name="Phone Search", phone="9988776600")

    resp = await client.get(
        "/api/v1/credit/customers?store_id=1&search=9988776600",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert any(i["phone"] == "9988776600" for i in items)


async def test_customer_pagination(client: AsyncClient, auth_headers: dict):
    for i in range(5):
        await _create_customer(client, auth_headers, name=f"PagCust {i}", phone=f"800000000{i}")

    resp = await client.get(
        "/api/v1/credit/customers?store_id=1&page=1&page_size=2",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"]      >= 5
    assert len(data["items"]) == 2


# ─── Credit Lifecycle ─────────────────────────────────────────────────────────

async def test_create_credit(client: AsyncClient, auth_headers: dict):
    cust   = await _create_customer(client, auth_headers, phone="9876500010")
    credit = await _create_credit(client, auth_headers, cust["id"], amount=1500.0)

    assert credit["status"]          == "open"
    assert float(credit["amount"])   == 1500.0
    assert float(credit["balance"])  == 1500.0


async def test_credit_exposure_reflects_new_credit(client: AsyncClient, auth_headers: dict):
    cust = await _create_customer(client, auth_headers, phone="9876500020")
    await _create_credit(client, auth_headers, cust["id"], amount=800.0)

    resp = await client.get("/api/v1/credit/exposure?store_id=1", headers=auth_headers)
    assert resp.status_code == 200
    exp = resp.json()
    assert float(exp["total_outstanding"]) >= 800.0
    assert exp["customer_count"] >= 1


async def test_record_repayment_reduces_balance(client: AsyncClient, auth_headers: dict):
    cust   = await _create_customer(client, auth_headers, phone="9876500030")
    credit = await _create_credit(client, auth_headers, cust["id"], amount=1000.0)

    resp = await client.post("/api/v1/credit/repay", json={
        "credit_id": credit["id"],
        "amount":    "400.00",
        "method":    "cash",
    }, headers=auth_headers)
    assert resp.status_code == 201
    assert float(resp.json()["amount"]) == 400.0


async def test_full_repayment_marks_paid(client: AsyncClient, auth_headers: dict):
    cust   = await _create_customer(client, auth_headers, phone="9876500040")
    credit = await _create_credit(client, auth_headers, cust["id"], amount=200.0)

    resp = await client.post("/api/v1/credit/repay", json={
        "credit_id": credit["id"], "amount": "200.00", "method": "upi",
    }, headers=auth_headers)
    assert resp.status_code == 201


async def test_list_credits_filter_by_status(client: AsyncClient, auth_headers: dict):
    cust = await _create_customer(client, auth_headers, phone="9876500050")
    await _create_credit(client, auth_headers, cust["id"])

    resp = await client.get(
        "/api/v1/credit/?store_id=1&status=open", headers=auth_headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    assert all(c["status"] == "open" for c in data["items"])
