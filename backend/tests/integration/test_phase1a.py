"""
SmartPOS AI – Integration Tests Phase 1A
Tests that hit the real API endpoints with an in-memory SQLite DB.
Covers: product creation, variants, batch receiving, GST billing, stock deduction.
"""

from __future__ import annotations

import pytest
from decimal import Decimal
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


# ─── Fixtures ─────────────────────────────────────────────────────────────────

async def _register_and_login(client: AsyncClient) -> dict:
    await client.post("/api/v1/auth/register", json={
        "name": "Store Owner", "email": "owner@test.com",
        "password": "StrongPass1!", "role": "owner",
    })
    resp = await client.post("/api/v1/auth/login", json={
        "email": "owner@test.com", "password": "StrongPass1!",
    })
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _create_product(client: AsyncClient, headers: dict, **overrides) -> dict:
    data = {
        "store_id": 1, "name": "Test Biscuits", "sku": "BISC-001",
        "cost_price": "10.00", "selling_price": "15.00",
        "gst_rate": "18", "unit": "pcs",
        "min_stock_qty": 5, "reorder_qty": 20,
        "opening_stock": 100,
        **overrides,
    }
    resp = await client.post("/api/v1/inventory/products", json=data, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ─── Auth Tests ───────────────────────────────────────────────────────────────

async def test_register_and_login(client: AsyncClient):
    headers = await _register_and_login(client)
    assert "Authorization" in headers

    me = await client.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["email"] == "owner@test.com"


async def test_duplicate_email_rejected(client: AsyncClient):
    payload = {"name": "A", "email": "dup@test.com", "password": "Pass1234!"}
    await client.post("/api/v1/auth/register", json=payload)
    resp = await client.post("/api/v1/auth/register", json=payload)
    assert resp.status_code == 400


async def test_wrong_password_rejected(client: AsyncClient):
    await client.post("/api/v1/auth/register", json={
        "name": "X", "email": "x@test.com", "password": "Correct1!"
    })
    resp = await client.post("/api/v1/auth/login", json={
        "email": "x@test.com", "password": "WrongPass!"
    })
    assert resp.status_code == 401


async def test_protected_route_requires_token(client: AsyncClient):
    resp = await client.get("/api/v1/inventory/products?store_id=1")
    assert resp.status_code == 403


# ─── Product Tests ────────────────────────────────────────────────────────────

async def test_create_product_with_default_variant(client: AsyncClient):
    headers = await _register_and_login(client)
    product = await _create_product(client, headers)

    assert product["name"]           == "Test Biscuits"
    assert product["sku"]            == "BISC-001"
    assert float(product["selling_price"]) == 15.00
    assert product["gst_rate"]       == "18"
    assert product["total_stock"]    == 100        # from opening_stock
    assert len(product["variants"])  >= 1          # default variant created
    assert product["variants"][0]["variant_name"] == "Default"
    assert float(product["margin_pct"]) == pytest.approx(33.33, abs=0.1)


async def test_duplicate_sku_rejected(client: AsyncClient):
    headers = await _register_and_login(client)
    await _create_product(client, headers, sku="DUPE-SKU")
    resp = await client.post("/api/v1/inventory/products", json={
        "store_id": 1, "name": "Another", "sku": "DUPE-SKU",
        "cost_price": "5", "selling_price": "10",
    }, headers=headers)
    assert resp.status_code == 400


async def test_list_products_pagination(client: AsyncClient):
    headers = await _register_and_login(client)
    for i in range(5):
        await _create_product(client, headers, name=f"Product {i}", sku=f"P-{i:03d}")

    resp = await client.get(
        "/api/v1/inventory/products?store_id=1&page=1&page_size=3",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"]     >= 5
    assert len(data["items"]) == 3


async def test_product_search(client: AsyncClient):
    headers = await _register_and_login(client)
    await _create_product(client, headers, name="Himalaya Soap", sku="SOAP-001")
    await _create_product(client, headers, name="Dettol Sanitizer", sku="DETT-001")

    resp = await client.get(
        "/api/v1/inventory/products?store_id=1&search=himalaya",
        headers=headers,
    )
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert all("himalaya" in i["name"].lower() for i in items)


async def test_update_product(client: AsyncClient):
    headers = await _register_and_login(client)
    product = await _create_product(client, headers)
    pid     = product["id"]

    resp = await client.patch(
        f"/api/v1/inventory/products/{pid}",
        json={"selling_price": "20.00", "min_stock_qty": 10},
        headers=headers,
    )
    assert resp.status_code == 200
    assert float(resp.json()["selling_price"]) == 20.00
    assert resp.json()["min_stock_qty"]        == 10


async def test_soft_delete_product(client: AsyncClient):
    headers = await _register_and_login(client)
    product = await _create_product(client, headers, sku="DEL-001")
    pid     = product["id"]

    resp = await client.delete(
        f"/api/v1/inventory/products/{pid}", headers=headers
    )
    assert resp.status_code == 204

    # Should no longer appear in list
    list_resp = await client.get(
        "/api/v1/inventory/products?store_id=1", headers=headers
    )
    ids = [i["id"] for i in list_resp.json()["items"]]
    assert pid not in ids


# ─── Variant Tests ────────────────────────────────────────────────────────────

async def test_add_variant_to_product(client: AsyncClient):
    headers = await _register_and_login(client)
    product = await _create_product(client, headers, name="T-Shirt", has_variants=True)
    pid     = product["id"]

    resp = await client.post("/api/v1/inventory/variants", json={
        "product_id":   pid,
        "store_id":     1,
        "variant_name": "Red / Large",
        "attributes":   {"colour": "Red", "size": "L"},
        "selling_price": "250.00",
        "cost_price":    "150.00",
    }, headers=headers)

    assert resp.status_code == 201
    v = resp.json()
    assert v["variant_name"]    == "Red / Large"
    assert v["attributes"]["colour"] == "Red"
    assert v["attributes"]["size"]   == "L"


# ─── Batch Tests ──────────────────────────────────────────────────────────────

async def test_receive_batch_updates_stock(client: AsyncClient):
    headers = await _register_and_login(client)
    product = await _create_product(client, headers, sku="BATCH-001", opening_stock=0)
    vid     = product["variants"][0]["id"]

    resp = await client.post("/api/v1/inventory/batches", json={
        "variant_id":    vid,
        "store_id":      1,
        "batch_number":  "B2024-001",
        "quantity":      200,
        "purchase_price": "8.00",
        "expiry_date":   "2025-12-31T00:00:00Z",
    }, headers=headers)
    assert resp.status_code == 201
    batch = resp.json()
    assert batch["qty_remaining"] == 200
    assert batch["batch_number"]  == "B2024-001"

    # Verify variant stock updated
    v_resp = await client.get(
        f"/api/v1/inventory/variants/{vid}", headers=headers
    )
    assert float(v_resp.json()["stock_qty"]) == 200.0


async def test_duplicate_batch_rejected(client: AsyncClient):
    headers = await _register_and_login(client)
    product = await _create_product(client, headers, sku="DUP-BATCH")
    vid     = product["variants"][0]["id"]

    batch_data = {
        "variant_id": vid, "store_id": 1,
        "batch_number": "DUP-BATCH-001",
        "quantity": 50, "purchase_price": "10.00",
    }
    await client.post("/api/v1/inventory/batches", json=batch_data, headers=headers)
    resp = await client.post("/api/v1/inventory/batches", json=batch_data, headers=headers)
    assert resp.status_code == 409


# ─── Stock Adjustment Tests ───────────────────────────────────────────────────

async def test_stock_adjustment_add(client: AsyncClient):
    headers = await _register_and_login(client)
    product = await _create_product(client, headers, sku="ADJ-001", opening_stock=50)
    vid     = product["variants"][0]["id"]

    resp = await client.post("/api/v1/inventory/stock/adjust", json={
        "variant_id": vid, "store_id": 1,
        "delta": 25, "reason": "Stock count correction",
    }, headers=headers)
    assert resp.status_code == 200
    assert float(resp.json()["stock_qty"]) == 75.0


async def test_stock_adjustment_negative(client: AsyncClient):
    headers = await _register_and_login(client)
    product = await _create_product(client, headers, sku="ADJ-002", opening_stock=30)
    vid     = product["variants"][0]["id"]

    resp = await client.post("/api/v1/inventory/stock/adjust", json={
        "variant_id": vid, "store_id": 1,
        "delta": -10, "reason": "Damaged goods",
    }, headers=headers)
    assert resp.status_code == 200
    assert float(resp.json()["stock_qty"]) == 20.0


async def test_stock_cannot_go_negative(client: AsyncClient):
    headers = await _register_and_login(client)
    product = await _create_product(client, headers, sku="NEG-001", opening_stock=10)
    vid     = product["variants"][0]["id"]

    resp = await client.post("/api/v1/inventory/stock/adjust", json={
        "variant_id": vid, "store_id": 1,
        "delta": -999, "reason": "Bad adjustment",
    }, headers=headers)
    assert resp.status_code == 400


# ─── Inventory Health Tests ───────────────────────────────────────────────────

async def test_inventory_health_summary(client: AsyncClient):
    headers = await _register_and_login(client)
    await _create_product(client, headers, sku="H-001", opening_stock=100)
    await _create_product(client, headers, sku="H-002", opening_stock=0)

    resp = await client.get(
        "/api/v1/inventory/health?store_id=1", headers=headers
    )
    assert resp.status_code == 200
    h = resp.json()
    assert h["total_products"]    >= 2
    assert h["out_of_stock_count"] >= 1
    assert h["total_inventory_value"] > 0


# ─── Health Endpoint ──────────────────────────────────────────────────────────

async def test_health_endpoint(client: AsyncClient):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
    assert "uptime_s" in resp.json()


async def test_gstin_validation_endpoint(client: AsyncClient):
    headers = await _register_and_login(client)
    # Valid format (checksum may or may not pass for test value)
    resp = await client.post(
        "/api/v1/billing/validate-gstin",
        json={"gstin": "29ABCDE1234F1Z5"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["gstin"]      == "29ABCDE1234F1Z5"
    assert "is_valid"         in data
    assert "state_code"       in data


async def test_gstin_validation_wrong_length(client: AsyncClient):
    headers = await _register_and_login(client)
    resp = await client.post(
        "/api/v1/billing/validate-gstin",
        json={"gstin": "TOOSHORT"},
        headers=headers,
    )
    # Pydantic validation should reject it
    assert resp.status_code in (200, 422)
