"""HTTP-layer tests for cart endpoints."""

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.catalog import City, Product, Vendor
from app.models.user import User, UserRole
from app.repositories.catalog_repository import CityRepository, ProductRepository, VendorRepository
from app.repositories.user_repository import UserRepository

# ── Helpers ───────────────────────────────────────────────────────────────────


async def _make_user(db: AsyncSession, role: UserRole = UserRole.customer) -> User:
    from app.core.security import hash_password
    suffix = uuid.uuid4().hex[:8]
    return await UserRepository(db).create(
        email=f"cart_user_{suffix}@example.com",
        password_hash=hash_password("Password1"),
        role=role,
    )


async def _make_city(db: AsyncSession) -> City:
    slug = f"city-{uuid.uuid4().hex[:6]}"
    return await CityRepository(db).create(name=slug.title(), slug=slug, timezone="Asia/Karachi")


async def _make_vendor(db: AsyncSession, city: City) -> Vendor:
    suffix = uuid.uuid4().hex[:6]
    return await VendorRepository(db).create(
        city_id=city.id,
        name=f"Vendor {suffix}",
        slug=f"vendor-{suffix}",
    )


async def _make_product(db: AsyncSession, vendor: Vendor, price: int = 50000) -> Product:
    suffix = uuid.uuid4().hex[:6]
    return await ProductRepository(db).create(
        vendor_id=vendor.id,
        name=f"Test Cake {suffix}",
        slug=f"test-cake-{suffix}",
        base_price_pkr=price,
    )


async def _login(client: AsyncClient, email: str) -> str:
    resp = await client.post("/api/v1/auth/login", json={"email": email, "password": "Password1"})
    assert resp.status_code == 200
    return resp.json()["access_token"]


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def customer(db: AsyncSession) -> User:
    return await _make_user(db, UserRole.customer)


@pytest_asyncio.fixture
async def city(db: AsyncSession) -> City:
    return await _make_city(db)


@pytest_asyncio.fixture
async def vendor(db: AsyncSession, city: City) -> Vendor:
    return await _make_vendor(db, city)


@pytest_asyncio.fixture
async def product(db: AsyncSession, vendor: Vendor) -> Product:
    return await _make_product(db, vendor)


# ── GET /cart ─────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_cart_empty(client: AsyncClient, customer: User) -> None:
    email = customer.email  # capture before HTTP calls expire session
    token = await _login(client, email)
    resp = await client.get("/api/v1/cart", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["item_count"] == 0
    assert data["subtotal_pkr"] == 0
    assert data["items"] == []


@pytest.mark.asyncio
async def test_get_cart_requires_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/cart")
    assert resp.status_code == 401


# ── POST /cart/items ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_add_item_to_cart(client: AsyncClient, customer: User, product: Product) -> None:
    # Capture all ORM values before any HTTP call (each call expires the session)
    email = customer.email
    product_id = str(product.id)
    base_price = product.base_price_pkr

    token = await _login(client, email)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        "/api/v1/cart/items",
        json={"product_id": product_id, "qty": 1},
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["item_count"] == 1
    assert data["subtotal_pkr"] == base_price
    assert data["items"][0]["product_id"] == product_id
    assert data["items"][0]["qty"] == 1


@pytest.mark.asyncio
async def test_add_item_increases_qty_when_same_product(
    client: AsyncClient, customer: User, product: Product
) -> None:
    email = customer.email
    product_id = str(product.id)

    token = await _login(client, email)
    headers = {"Authorization": f"Bearer {token}"}

    await client.post("/api/v1/cart/items", json={"product_id": product_id, "qty": 1}, headers=headers)
    resp = await client.post("/api/v1/cart/items", json={"product_id": product_id, "qty": 2}, headers=headers)

    assert resp.status_code == 201
    data = resp.json()
    assert data["item_count"] == 3  # 1 + 2
    assert len(data["items"]) == 1  # still one line item


@pytest.mark.asyncio
async def test_add_item_with_greeting_and_recipient(
    client: AsyncClient, customer: User, product: Product
) -> None:
    email = customer.email
    product_id = str(product.id)

    token = await _login(client, email)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        "/api/v1/cart/items",
        json={
            "product_id": product_id,
            "qty": 1,
            "greeting_message": "Happy Birthday!",
            "recipient_name": "Ammi",
            "recipient_phone": "+923001234567",
        },
        headers=headers,
    )
    assert resp.status_code == 201
    item = resp.json()["items"][0]
    assert item["greeting_message"] == "Happy Birthday!"
    assert item["recipient_name"] == "Ammi"


@pytest.mark.asyncio
async def test_add_nonexistent_product_returns_404(client: AsyncClient, customer: User) -> None:
    email = customer.email
    token = await _login(client, email)
    resp = await client.post(
        "/api/v1/cart/items",
        json={"product_id": str(uuid.uuid4()), "qty": 1},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_add_item_requires_auth(client: AsyncClient, product: Product) -> None:
    product_id = str(product.id)
    resp = await client.post("/api/v1/cart/items", json={"product_id": product_id, "qty": 1})
    assert resp.status_code == 401


# ── PATCH /cart/items/{item_id} ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_update_cart_item_qty(client: AsyncClient, customer: User, product: Product) -> None:
    email = customer.email
    product_id = str(product.id)

    token = await _login(client, email)
    headers = {"Authorization": f"Bearer {token}"}

    add_resp = await client.post(
        "/api/v1/cart/items", json={"product_id": product_id, "qty": 1}, headers=headers
    )
    item_id = add_resp.json()["items"][0]["id"]

    resp = await client.patch(
        f"/api/v1/cart/items/{item_id}", json={"qty": 3}, headers=headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"][0]["qty"] == 3
    assert data["item_count"] == 3


@pytest.mark.asyncio
async def test_update_cart_item_qty_zero_removes_item(
    client: AsyncClient, customer: User, product: Product
) -> None:
    email = customer.email
    product_id = str(product.id)

    token = await _login(client, email)
    headers = {"Authorization": f"Bearer {token}"}

    add_resp = await client.post(
        "/api/v1/cart/items", json={"product_id": product_id, "qty": 2}, headers=headers
    )
    item_id = add_resp.json()["items"][0]["id"]

    resp = await client.patch(
        f"/api/v1/cart/items/{item_id}", json={"qty": 0}, headers=headers
    )
    assert resp.status_code == 200
    assert resp.json()["item_count"] == 0
    assert resp.json()["items"] == []


@pytest.mark.asyncio
async def test_update_nonexistent_item_returns_404(client: AsyncClient, customer: User) -> None:
    email = customer.email
    token = await _login(client, email)
    resp = await client.patch(
        f"/api/v1/cart/items/{uuid.uuid4()}",
        json={"qty": 2},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


# ── DELETE /cart/items/{item_id} ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_remove_cart_item(client: AsyncClient, customer: User, product: Product) -> None:
    email = customer.email
    product_id = str(product.id)

    token = await _login(client, email)
    headers = {"Authorization": f"Bearer {token}"}

    add_resp = await client.post(
        "/api/v1/cart/items", json={"product_id": product_id, "qty": 1}, headers=headers
    )
    item_id = add_resp.json()["items"][0]["id"]

    resp = await client.delete(f"/api/v1/cart/items/{item_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["item_count"] == 0


@pytest.mark.asyncio
async def test_remove_nonexistent_item_returns_404(client: AsyncClient, customer: User) -> None:
    email = customer.email
    token = await _login(client, email)
    resp = await client.delete(
        f"/api/v1/cart/items/{uuid.uuid4()}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


# ── DELETE /cart ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_clear_cart(client: AsyncClient, customer: User, product: Product) -> None:
    email = customer.email
    product_id = str(product.id)

    token = await _login(client, email)
    headers = {"Authorization": f"Bearer {token}"}

    await client.post("/api/v1/cart/items", json={"product_id": product_id, "qty": 2}, headers=headers)

    resp = await client.delete("/api/v1/cart", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["item_count"] == 0
    assert data["items"] == []


@pytest.mark.asyncio
async def test_clear_cart_requires_auth(client: AsyncClient) -> None:
    resp = await client.delete("/api/v1/cart")
    assert resp.status_code == 401
