"""Tests for authentication endpoints."""

import pytest
from httpx import AsyncClient


pytestmark = pytest.mark.asyncio


async def test_register_success(client: AsyncClient):
    resp = await client.post("/api/v1/auth/register", json={
        "name":     "John Doe",
        "email":    "john@test.com",
        "password": "SecurePass1!",
        "role":     "cashier",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["email"] == "john@test.com"
    assert data["role"]  == "cashier"
    assert "password_hash" not in data


async def test_register_duplicate_email(client: AsyncClient):
    payload = {"name": "A", "email": "dup@test.com", "password": "Pass1234!"}
    await client.post("/api/v1/auth/register", json=payload)
    resp = await client.post("/api/v1/auth/register", json=payload)
    assert resp.status_code == 400
    assert "already registered" in resp.json()["detail"]


async def test_login_success(client: AsyncClient):
    await client.post("/api/v1/auth/register", json={
        "name": "Login User", "email": "login@test.com", "password": "Pass1234!"
    })
    resp = await client.post("/api/v1/auth/login", json={
        "email": "login@test.com", "password": "Pass1234!"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token"  in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


async def test_login_wrong_password(client: AsyncClient):
    await client.post("/api/v1/auth/register", json={
        "name": "User", "email": "wrong@test.com", "password": "CorrectPass1!"
    })
    resp = await client.post("/api/v1/auth/login", json={
        "email": "wrong@test.com", "password": "WrongPass!"
    })
    assert resp.status_code == 401


async def test_me_endpoint(client: AsyncClient, auth_headers: dict):
    resp = await client.get("/api/v1/auth/me", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["email"] == "owner@test.com"


async def test_me_requires_auth(client: AsyncClient):
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 403   # No token


async def test_health_endpoint(client: AsyncClient):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
