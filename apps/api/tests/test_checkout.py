"""HTTP-layer tests for checkout and order endpoints."""

import uuid
from datetime import date, timedelta

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.catalog import City, Product, ProductCity, Vendor
from app.models.user import User, UserRole
from app.repositories.catalog_repository import CityRepository, ProductRepository, VendorRepository
from app.repositories.user_repository import UserRepository

# ── Helpers ───────────────────────────────────────────────────────────────────


async def _make_user(db: AsyncSession, role: UserRole = UserRole.customer) -> User:
    from app.core.security import hash_password
    suffix = uuid.uuid4().hex[:8]
    return await UserRepository(db).create(
        email=f"co_user_{suffix}@example.com",
        password_hash=hash_password("Password1"),
        role=role,
    )


async def _make_city(db: AsyncSession) -> City:
    slug = f"co-city-{uuid.uuid4().hex[:6]}"
    return await CityRepository(db).create(name=slug.title(), slug=slug, timezone="Asia/Karachi")


async def _make_vendor(db: AsyncSession, city: City) -> Vendor:
    suffix = uuid.uuid4().hex[:6]
    return await VendorRepository(db).create(
        city_id=city.id,
        name=f"Co Vendor {suffix}",
        slug=f"co-vendor-{suffix}",
    )


async def _make_product(
    db: AsyncSession, vendor: Vendor, city: City, price: int = 75000
) -> Product:
    suffix = uuid.uuid4().hex[:6]
    product = await ProductRepository(db).create(
        vendor_id=vendor.id,
        name=f"Co Cake {suffix}",
        slug=f"co-cake-{suffix}",
        base_price_pkr=price,
    )
    pc = ProductCity(
        product_id=product.id,
        city_id=city.id,
        delivery_fee_pkr=20000,
        lead_time_hours=24,
    )
    db.add(pc)
    await db.flush()
    return product


async def _login(client: AsyncClient, email: str) -> str:
    resp = await client.post("/api/v1/auth/login", json={"email": email, "password": "Password1"})
    assert resp.status_code == 200
    return resp.json()["access_token"]


async def _add_item(client: AsyncClient, token: str, product_id: str) -> None:
    resp = await client.post(
        "/api/v1/cart/items",
        json={"product_id": product_id, "qty": 1},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201


_TOMORROW = (date.today() + timedelta(days=1)).isoformat()


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
async def product(db: AsyncSession, vendor: Vendor, city: City) -> Product:
    return await _make_product(db, vendor, city)


# ── POST /checkout/quote ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_quote_happy_path(
    client: AsyncClient, customer: User, product: Product, city: City
) -> None:
    # Capture all values before any HTTP call expires the session
    email = customer.email
    product_id = str(product.id)
    city_id = str(city.id)
    base_price = product.base_price_pkr

    token = await _login(client, email)
    headers = {"Authorization": f"Bearer {token}"}
    await _add_item(client, token, product_id)

    resp = await client.post(
        f"/api/v1/checkout/quote?city_id={city_id}",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["subtotal_pkr"] == base_price
    assert data["delivery_pkr"] == 20000
    assert data["total_pkr"] == base_price + 20000
    assert len(data["items"]) == 1


@pytest.mark.asyncio
async def test_quote_empty_cart_returns_400(
    client: AsyncClient, customer: User, city: City
) -> None:
    email = customer.email
    city_id = str(city.id)

    token = await _login(client, email)
    resp = await client.post(
        f"/api/v1/checkout/quote?city_id={city_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_quote_invalid_city_returns_400(
    client: AsyncClient, customer: User, product: Product
) -> None:
    email = customer.email
    product_id = str(product.id)

    token = await _login(client, email)
    await _add_item(client, token, product_id)

    resp = await client.post(
        f"/api/v1/checkout/quote?city_id={uuid.uuid4()}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_quote_requires_auth(client: AsyncClient, city: City) -> None:
    city_id = str(city.id)
    resp = await client.post(f"/api/v1/checkout/quote?city_id={city_id}")
    assert resp.status_code == 401


# ── POST /checkout/place ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_place_order_cod(
    client: AsyncClient, customer: User, product: Product, city: City
) -> None:
    email = customer.email
    product_id = str(product.id)
    city_id = str(city.id)
    base_price = product.base_price_pkr

    token = await _login(client, email)
    headers = {"Authorization": f"Bearer {token}"}
    await _add_item(client, token, product_id)

    resp = await client.post(
        "/api/v1/checkout/place",
        json={
            "payment_method": "cod",
            "delivery_city_id": city_id,
            "delivery_date": _TOMORROW,
            "recipient_name": "Ammi Jan",
            "recipient_phone": "+923001234567",
            "address_line1": "House 5 Street 10 Gulberg",
        },
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "pending_payment"
    assert data["subtotal_pkr"] == base_price
    assert data["payment_method"] == "cod"
    assert len(data["items"]) == 1
    assert len(data["fulfillments"]) == 1
    assert "public_token" in data


@pytest.mark.asyncio
async def test_place_order_bank_transfer(
    client: AsyncClient, customer: User, product: Product, city: City
) -> None:
    email = customer.email
    product_id = str(product.id)
    city_id = str(city.id)

    token = await _login(client, email)
    headers = {"Authorization": f"Bearer {token}"}
    await _add_item(client, token, product_id)

    resp = await client.post(
        "/api/v1/checkout/place",
        json={
            "payment_method": "bank_transfer",
            "delivery_city_id": city_id,
            "delivery_date": _TOMORROW,
            "recipient_name": "Abu Jan",
            "recipient_phone": "+923001234568",
            "address_line1": "House 10 Street 5 DHA",
        },
        headers=headers,
    )
    assert resp.status_code == 201
    assert resp.json()["payment_method"] == "bank_transfer"


@pytest.mark.asyncio
async def test_place_order_clears_cart(
    client: AsyncClient, customer: User, product: Product, city: City
) -> None:
    email = customer.email
    product_id = str(product.id)
    city_id = str(city.id)

    token = await _login(client, email)
    headers = {"Authorization": f"Bearer {token}"}
    await _add_item(client, token, product_id)

    await client.post(
        "/api/v1/checkout/place",
        json={
            "payment_method": "cod",
            "delivery_city_id": city_id,
            "delivery_date": _TOMORROW,
            "recipient_name": "Bhai",
            "recipient_phone": "+923001234569",
            "address_line1": "House 1 Street 1 Model Town",
        },
        headers=headers,
    )

    cart_resp = await client.get("/api/v1/cart", headers=headers)
    assert cart_resp.json()["item_count"] == 0


@pytest.mark.asyncio
async def test_place_order_empty_cart_returns_400(
    client: AsyncClient, customer: User, city: City
) -> None:
    email = customer.email
    city_id = str(city.id)

    token = await _login(client, email)
    resp = await client.post(
        "/api/v1/checkout/place",
        json={
            "payment_method": "cod",
            "delivery_city_id": city_id,
            "delivery_date": _TOMORROW,
            "recipient_name": "Nobody",
            "recipient_phone": "+923001234500",
            "address_line1": "Nowhere Street 1",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_place_order_invalid_city_returns_400(
    client: AsyncClient, customer: User, product: Product
) -> None:
    email = customer.email
    product_id = str(product.id)

    token = await _login(client, email)
    await _add_item(client, token, product_id)

    resp = await client.post(
        "/api/v1/checkout/place",
        json={
            "payment_method": "cod",
            "delivery_city_id": str(uuid.uuid4()),
            "delivery_date": _TOMORROW,
            "recipient_name": "Nobody",
            "recipient_phone": "+923001234500",
            "address_line1": "Nowhere Street 1",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_place_order_accepts_idempotency_key(
    client: AsyncClient, customer: User, product: Product, city: City
) -> None:
    email = customer.email
    product_id = str(product.id)
    city_id = str(city.id)

    token = await _login(client, email)
    headers = {
        "Authorization": f"Bearer {token}",
        "idempotency-key": str(uuid.uuid4()),
    }
    await _add_item(client, token, product_id)

    resp = await client.post(
        "/api/v1/checkout/place",
        json={
            "payment_method": "cod",
            "delivery_city_id": city_id,
            "delivery_date": _TOMORROW,
            "recipient_name": "Ammi",
            "recipient_phone": "+923001234567",
            "address_line1": "House 5 Street 10",
        },
        headers=headers,
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_place_order_requires_auth(client: AsyncClient, city: City) -> None:
    city_id = str(city.id)
    resp = await client.post(
        "/api/v1/checkout/place",
        json={
            "payment_method": "cod",
            "delivery_city_id": city_id,
            "delivery_date": _TOMORROW,
            "recipient_name": "X",
            "recipient_phone": "+923001234500",
            "address_line1": "Somewhere Street 1",
        },
    )
    assert resp.status_code == 401


# ── GET /orders/me ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_my_orders_initially_empty(client: AsyncClient, customer: User) -> None:
    email = customer.email
    token = await _login(client, email)
    resp = await client.get("/api/v1/orders/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_my_orders_shows_placed_orders(
    client: AsyncClient, customer: User, product: Product, city: City
) -> None:
    email = customer.email
    product_id = str(product.id)
    city_id = str(city.id)

    token = await _login(client, email)
    headers = {"Authorization": f"Bearer {token}"}
    await _add_item(client, token, product_id)

    await client.post(
        "/api/v1/checkout/place",
        json={
            "payment_method": "cod",
            "delivery_city_id": city_id,
            "delivery_date": _TOMORROW,
            "recipient_name": "Ammi",
            "recipient_phone": "+923001234567",
            "address_line1": "House 5 Street 10",
        },
        headers=headers,
    )

    resp = await client.get("/api/v1/orders/me", headers=headers)
    assert resp.status_code == 200
    orders = resp.json()
    assert len(orders) == 1
    assert orders[0]["status"] == "pending_payment"


@pytest.mark.asyncio
async def test_my_orders_requires_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/orders/me")
    assert resp.status_code == 401


# ── GET /orders/{public_token} ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_track_order_happy_path(
    client: AsyncClient, customer: User, product: Product, city: City
) -> None:
    email = customer.email
    product_id = str(product.id)
    city_id = str(city.id)

    token = await _login(client, email)
    headers = {"Authorization": f"Bearer {token}"}
    await _add_item(client, token, product_id)

    place_resp = await client.post(
        "/api/v1/checkout/place",
        json={
            "payment_method": "cod",
            "delivery_city_id": city_id,
            "delivery_date": _TOMORROW,
            "recipient_name": "Ammi",
            "recipient_phone": "+923001234567",
            "address_line1": "House 5 Street 10",
        },
        headers=headers,
    )
    public_token = place_resp.json()["public_token"]

    # Track endpoint is public — no auth needed
    resp = await client.get(f"/api/v1/orders/{public_token}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["public_token"] == public_token
    assert data["status"] == "pending_payment"
    assert len(data["items"]) == 1
    assert len(data["fulfillments"]) == 1
    assert data["fulfillments"][0]["recipient_name"] == "Ammi"


@pytest.mark.asyncio
async def test_track_order_not_found_returns_404(client: AsyncClient) -> None:
    resp = await client.get(f"/api/v1/orders/{uuid.uuid4()}")
    assert resp.status_code == 404
