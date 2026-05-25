"""Tests for billing and inventory endpoints."""

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio

# ─── Fixtures ─────────────────────────────────────────────────────────────────

async def create_store(client, headers) -> int:
    resp = await client.post("/api/v1/inventory/... ", headers=headers)
    # We'll create store inline via auth user's store_id or create via direct DB
    return 1


async def create_product(client: AsyncClient, headers: dict, store_id: int) -> dict:
    resp = await client.post("/api/v1/inventory/products", json={
        "store_id":      store_id,
        "name":          "Test Cola",
        "sku":           "COLA-001",
        "cost_price":    "10.00",
        "selling_price": "15.00",
        "tax_rate":      "5.0",
        "stock_qty":     100,
        "min_stock_qty": 10,
        "unit":          "pcs",
    }, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ─── Inventory Tests ──────────────────────────────────────────────────────────

async def test_create_product(client: AsyncClient, auth_headers: dict):
    product = await create_product(client, auth_headers, store_id=1)
    assert product["name"]          == "Test Cola"
    assert product["sku"]           == "COLA-001"
    assert float(product["selling_price"]) == 15.0
    assert product["margin_pct"]    == pytest.approx(33.33, abs=0.1)


async def test_list_products(client: AsyncClient, auth_headers: dict):
    await create_product(client, auth_headers, store_id=1)
    resp = await client.get(
        "/api/v1/inventory/products", params={"store_id": 1}, headers=auth_headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    assert len(data["items"]) >= 1


async def test_stock_adjustment(client: AsyncClient, auth_headers: dict):
    product = await create_product(client, auth_headers, store_id=1)
    pid     = product["id"]

    # Add stock
    resp = await client.post("/api/v1/inventory/stock/adjust", json={
        "product_id": pid,
        "delta":      50,
        "reason":     "Purchase received",
    }, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["stock_qty"] == 150

    # Remove stock
    resp = await client.post("/api/v1/inventory/stock/adjust", json={
        "product_id": pid,
        "delta":      -20,
        "reason":     "Damaged goods",
    }, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["stock_qty"] == 130


async def test_negative_stock_rejected(client: AsyncClient, auth_headers: dict):
    product = await create_product(client, auth_headers, store_id=1)
    resp    = await client.post("/api/v1/inventory/stock/adjust", json={
        "product_id": product["id"],
        "delta":      -9999,
        "reason":     "Bad adjustment",
    }, headers=auth_headers)
    assert resp.status_code == 400


# ─── Billing Tests ────────────────────────────────────────────────────────────

async def test_create_sale(client: AsyncClient, auth_headers: dict):
    product = await create_product(client, auth_headers, store_id=1)

    resp = await client.post("/api/v1/billing/sales", json={
        "store_id":       1,
        "items": [{"product_id": product["id"], "qty": "2", "discount": "0"}],
        "payment_method": "cash",
        "amount_paid":    "30.00",
    }, headers=auth_headers)

    assert resp.status_code == 201
    data = resp.json()
    assert data["status"]           == "completed"
    assert float(data["subtotal"])  == pytest.approx(30.00, abs=0.01)
    assert data["invoice_number"].startswith("INV-")


async def test_sale_deducts_stock(client: AsyncClient, auth_headers: dict):
    product = await create_product(client, auth_headers, store_id=1)
    pid     = product["id"]
    initial_stock = product["stock_qty"]

    await client.post("/api/v1/billing/sales", json={
        "store_id": 1,
        "items":    [{"product_id": pid, "qty": "5"}],
        "payment_method": "cash",
    }, headers=auth_headers)

    resp = await client.get(f"/api/v1/inventory/products/{pid}", headers=auth_headers)
    assert resp.json()["stock_qty"] == initial_stock - 5


async def test_sale_insufficient_stock(client: AsyncClient, auth_headers: dict):
    product = await create_product(client, auth_headers, store_id=1)

    resp = await client.post("/api/v1/billing/sales", json={
        "store_id": 1,
        "items":    [{"product_id": product["id"], "qty": "9999"}],
        "payment_method": "cash",
    }, headers=auth_headers)
    assert resp.status_code == 400
    assert "Insufficient stock" in resp.json()["detail"]


async def test_duplicate_local_id_rejected(client: AsyncClient, auth_headers: dict):
    product  = await create_product(client, auth_headers, store_id=1)
    local_id = "device-uuid-test-001"

    sale_payload = {
        "store_id":       1,
        "items":          [{"product_id": product["id"], "qty": "1"}],
        "payment_method": "cash",
        "local_id":       local_id,
    }
    resp1 = await client.post("/api/v1/billing/sales", json=sale_payload, headers=auth_headers)
    assert resp1.status_code == 201

    resp2 = await client.post("/api/v1/billing/sales", json=sale_payload, headers=auth_headers)
    assert resp2.status_code == 409   # Conflict – duplicate


async def test_void_sale(client: AsyncClient, auth_headers: dict):
    product = await create_product(client, auth_headers, store_id=1)
    sale_resp = await client.post("/api/v1/billing/sales", json={
        "store_id": 1,
        "items":    [{"product_id": product["id"], "qty": "3"}],
        "payment_method": "cash",
    }, headers=auth_headers)
    sale_id = sale_resp.json()["id"]

    void_resp = await client.patch(
        f"/api/v1/billing/sales/{sale_id}/void", headers=auth_headers
    )
    assert void_resp.status_code == 200
    assert void_resp.json()["status"] == "void"
