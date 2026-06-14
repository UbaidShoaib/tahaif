"""Tests for loyalty wallet and ledger endpoints."""

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.user import User, UserRole
from app.repositories.user_repository import UserRepository


# ── Helpers ───────────────────────────────────────────────────────────────────


async def _make_user(db: AsyncSession) -> User:
    suffix = uuid.uuid4().hex[:8]
    return await UserRepository(db).create(
        email=f"lyl_{suffix}@example.com",
        password_hash=hash_password("Password1"),
        role=UserRole.customer,
    )


async def _login(client: AsyncClient, email: str) -> str:
    resp = await client.post("/api/v1/auth/login", json={"email": email, "password": "Password1"})
    assert resp.status_code == 200
    return resp.json()["access_token"]


# ── GET /loyalty/me ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_wallet_creates_on_first_access(
    client: AsyncClient, db: AsyncSession
) -> None:
    user = await _make_user(db)
    email = user.email

    token = await _login(client, email)
    resp = await client.get("/api/v1/loyalty/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["balance_points"] == 0
    assert data["lifetime_earned"] == 0
    assert data["lifetime_burned"] == 0


@pytest.mark.asyncio
async def test_get_wallet_requires_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/loyalty/me")
    assert resp.status_code == 401


# ── GET /loyalty/me/ledger ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_ledger_empty(client: AsyncClient, db: AsyncSession) -> None:
    user = await _make_user(db)
    email = user.email

    token = await _login(client, email)
    resp = await client.get("/api/v1/loyalty/me/ledger", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_get_ledger_requires_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/loyalty/me/ledger")
    assert resp.status_code == 401


# ── Points awarded after checkout ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_loyalty_points_awarded_after_order(
    client: AsyncClient, db: AsyncSession
) -> None:
    """Placing an order credits loyalty points to the wallet."""
    from datetime import date, timedelta
    from app.models.catalog import City, ProductCity, Vendor
    from app.models.user import UserRole
    from app.repositories.catalog_repository import CityRepository, ProductRepository, VendorRepository

    # Build fixtures
    suffix = uuid.uuid4().hex[:6]
    user = await _make_user(db)
    city = await CityRepository(db).create(
        name=f"LylCity {suffix}", slug=f"lylcity-{suffix}", timezone="Asia/Karachi"
    )
    vendor = await VendorRepository(db).create(
        city_id=city.id, name=f"LylVendor {suffix}", slug=f"lylvendor-{suffix}"
    )
    product = await ProductRepository(db).create(
        vendor_id=vendor.id,
        name=f"LylProd {suffix}",
        slug=f"lylprod-{suffix}",
        base_price_pkr=150_000,  # 1500 PKR → 15 points
    )
    db.add(ProductCity(product_id=product.id, city_id=city.id, delivery_fee_pkr=0))
    await db.flush()

    # Capture IDs before any HTTP call
    email = user.email
    city_id = str(city.id)
    product_id = str(product.id)
    tomorrow = (date.today() + timedelta(days=1)).isoformat()

    token = await _login(client, email)

    # Add to cart
    await client.post(
        "/api/v1/cart/items",
        json={"product_id": product_id, "qty": 1},
        headers={"Authorization": f"Bearer {token}"},
    )

    # Place order
    order_resp = await client.post(
        "/api/v1/checkout/place",
        json={
            "payment_method": "cod",
            "delivery_city_id": city_id,
            "delivery_date": tomorrow,
            "recipient_name": "Ali",
            "recipient_phone": "+923001234567",
            "address_line1": "House 1",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert order_resp.status_code == 201

    # Wallet should have points
    wallet_resp = await client.get(
        "/api/v1/loyalty/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert wallet_resp.status_code == 200
    wallet = wallet_resp.json()
    assert wallet["balance_points"] == 15  # 150 000 paisa // 10 000 = 15 pts
    assert wallet["lifetime_earned"] == 15

    # Ledger should have one entry
    ledger_resp = await client.get(
        "/api/v1/loyalty/me/ledger", headers={"Authorization": f"Bearer {token}"}
    )
    assert ledger_resp.status_code == 200
    entries = ledger_resp.json()
    assert len(entries) == 1
    assert entries[0]["delta_points"] == 15
