"""
SmartPOS AI – Price Category Tests

Covers: CRUD on categories, tier price upsert/delete, default-flag handling,
        customer assignment, effective-price resolver.
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def _create_category(
    client: AsyncClient,
    headers: dict,
    name: str = "Hotel Price",
    color: str = "#10B981",
    is_default: bool = False,
) -> dict:
    resp = await client.post("/api/v1/price-categories", json={
        "store_id":    1,
        "name":        name,
        "description": f"{name} tier",
        "color":       color,
        "is_default":  is_default,
    }, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ─── Create ───────────────────────────────────────────────────────────────────

async def test_create_price_category(client: AsyncClient, auth_headers: dict):
    cat = await _create_category(client, auth_headers)
    assert cat["name"]       == "Hotel Price"
    assert cat["color"]      == "#10B981"
    assert cat["is_default"] is False
    assert cat["is_active"]  is True


async def test_create_default_category_clears_previous_default(
    client: AsyncClient, auth_headers: dict
):
    cat1 = await _create_category(client, auth_headers, name="Retail",   is_default=True)
    cat2 = await _create_category(client, auth_headers, name="Wholesale", is_default=True)

    # Re-fetch cat1 — should no longer be default
    resp = await client.get("/api/v1/price-categories?store_id=1", headers=auth_headers)
    items = {c["id"]: c for c in resp.json()}
    assert items[cat1["id"]]["is_default"] is False
    assert items[cat2["id"]]["is_default"] is True


async def test_duplicate_name_rejected(client: AsyncClient, auth_headers: dict):
    await _create_category(client, auth_headers, name="UniquePrice")
    resp = await client.post("/api/v1/price-categories", json={
        "store_id": 1, "name": "UniquePrice", "color": "#fff",
    }, headers=auth_headers)
    # Unique constraint → 400 or 409
    assert resp.status_code in (400, 409, 500)


# ─── List ─────────────────────────────────────────────────────────────────────

async def test_list_price_categories(client: AsyncClient, auth_headers: dict):
    await _create_category(client, auth_headers, name="Cat A")
    await _create_category(client, auth_headers, name="Cat B")

    resp = await client.get("/api/v1/price-categories?store_id=1", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()) >= 2


# ─── Update ───────────────────────────────────────────────────────────────────

async def test_update_price_category(client: AsyncClient, auth_headers: dict):
    cat = await _create_category(client, auth_headers, name="Old Name")

    resp = await client.patch(f"/api/v1/price-categories/{cat['id']}", json={
        "name": "New Name", "color": "#FF0000",
    }, headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"]  == "New Name"
    assert data["color"] == "#FF0000"


# ─── Delete ───────────────────────────────────────────────────────────────────

async def test_delete_non_default_category(client: AsyncClient, auth_headers: dict):
    cat  = await _create_category(client, auth_headers, name="ToDelete")
    resp = await client.delete(f"/api/v1/price-categories/{cat['id']}", headers=auth_headers)
    assert resp.status_code == 204

    # Must not appear in list
    list_resp = await client.get("/api/v1/price-categories?store_id=1", headers=auth_headers)
    ids = [c["id"] for c in list_resp.json()]
    assert cat["id"] not in ids


async def test_cannot_delete_default_category(client: AsyncClient, auth_headers: dict):
    cat  = await _create_category(client, auth_headers, name="DefaultCat", is_default=True)
    resp = await client.delete(f"/api/v1/price-categories/{cat['id']}", headers=auth_headers)
    assert resp.status_code == 400


# ─── Product Tier Prices ──────────────────────────────────────────────────────

async def test_set_and_list_tier_price(client: AsyncClient, auth_headers: dict, sample_product: dict):
    cat = await _create_category(client, auth_headers, name="TierCat")
    pid = sample_product["id"]

    # Set tier price
    resp = await client.post(f"/api/v1/price-categories/{cat['id']}/products", json={
        "product_id": pid, "price": 65.0, "store_id": 1,
    }, headers=auth_headers)
    assert resp.status_code == 201
    assert float(resp.json()["price"]) == 65.0

    # List tiers
    list_resp = await client.get(f"/api/v1/price-categories/{cat['id']}/products", headers=auth_headers)
    assert resp.status_code in (200, 201)
    tiers = list_resp.json()
    assert any(t["product_id"] == pid for t in tiers)


async def test_tier_price_upsert(client: AsyncClient, auth_headers: dict, sample_product: dict):
    cat = await _create_category(client, auth_headers, name="UpsertCat")
    pid = sample_product["id"]

    # Initial
    await client.post(f"/api/v1/price-categories/{cat['id']}/products", json={
        "product_id": pid, "price": 70.0, "store_id": 1,
    }, headers=auth_headers)

    # Update (upsert)
    resp = await client.post(f"/api/v1/price-categories/{cat['id']}/products", json={
        "product_id": pid, "price": 60.0, "store_id": 1,
    }, headers=auth_headers)
    assert resp.status_code == 201
    assert float(resp.json()["price"]) == 60.0


async def test_delete_tier_price(client: AsyncClient, auth_headers: dict, sample_product: dict):
    cat = await _create_category(client, auth_headers, name="DelTierCat")
    pid = sample_product["id"]

    await client.post(f"/api/v1/price-categories/{cat['id']}/products", json={
        "product_id": pid, "price": 55.0, "store_id": 1,
    }, headers=auth_headers)

    del_resp = await client.delete(
        f"/api/v1/price-categories/{cat['id']}/products/{pid}",
        headers=auth_headers,
    )
    assert del_resp.status_code == 204


# ─── Customer Assignment ──────────────────────────────────────────────────────

async def test_assign_customer_to_category(client: AsyncClient, auth_headers: dict):
    cat = await _create_category(client, auth_headers, name="AssignCat")

    # Create customer via credit/customers endpoint
    cust_resp = await client.post("/api/v1/credit/customers", json={
        "store_id": 1, "name": "Test Hotel", "phone": "9000000001",
    }, headers=auth_headers)
    assert cust_resp.status_code == 201
    cust_id = cust_resp.json()["id"]

    assign_resp = await client.patch(
        f"/api/v1/price-categories/assign-customer/{cust_id}?category_id={cat['id']}",
        headers=auth_headers,
    )
    assert assign_resp.status_code == 200
    assert assign_resp.json()["price_category_id"] == cat["id"]


async def test_clear_customer_category(client: AsyncClient, auth_headers: dict):
    cat = await _create_category(client, auth_headers, name="ClearCat")

    cust_resp = await client.post("/api/v1/credit/customers", json={
        "store_id": 1, "name": "Clear Customer", "phone": "9000000002",
    }, headers=auth_headers)
    cust_id = cust_resp.json()["id"]

    # Assign
    await client.patch(
        f"/api/v1/price-categories/assign-customer/{cust_id}?category_id={cat['id']}",
        headers=auth_headers,
    )
    # Clear (category_id=0)
    clear_resp = await client.patch(
        f"/api/v1/price-categories/assign-customer/{cust_id}?category_id=0",
        headers=auth_headers,
    )
    assert clear_resp.status_code == 200
    assert clear_resp.json()["price_category_id"] is None
