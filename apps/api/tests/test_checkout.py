"""HTTP-layer tests for checkout and order endpoints."""

import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.catalog import City, Product, ProductCity, ProductVariant, Vendor
from app.models.loyalty import Coupon, CouponType
from app.models.user import User, UserRole
from app.repositories.catalog_repository import (
    CityRepository,
    ProductRepository,
    VendorRepository,
)
from app.repositories.loyalty_repository import LoyaltyRepository
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


async def _add_item(client: AsyncClient, token: str, product_id: str, variant_id: str | None = None) -> None:
    body = {"product_id": product_id, "qty": 1}
    if variant_id:
        body["variant_id"] = variant_id
    resp = await client.post(
        "/api/v1/cart/items",
        json=body,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201


async def _make_variant(db: AsyncSession, product: Product, stock_qty: int = 5, price_delta: int = 0) -> ProductVariant:
    suffix = uuid.uuid4().hex[:6]
    variant = ProductVariant(
        product_id=product.id,
        name=f"Variant {suffix}",
        price_delta_pkr=price_delta,
        stock_qty=stock_qty,
    )
    db.add(variant)
    await db.flush()
    return variant


async def _make_coupon(
    db: AsyncSession,
    coupon_type: CouponType = CouponType.percent,
    value: Decimal = Decimal("10"),
    **overrides: object,
) -> Coupon:
    suffix = uuid.uuid4().hex[:6].upper()
    from app.repositories.loyalty_repository import CouponRepository
    return await CouponRepository(db).create(
        code=f"CODE{suffix}",
        coupon_type=coupon_type,
        value=value,
        **overrides,
    )


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
async def test_quote_as_guest_without_a_cart_is_empty_cart(client: AsyncClient, city: City) -> None:
    city_id = str(city.id)
    resp = await client.post(f"/api/v1/checkout/quote?city_id={city_id}")
    assert resp.status_code == 400  # empty cart, not 401: guests can check out (ADR 0004)


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
async def test_place_order_as_guest_requires_contact_details(client: AsyncClient, city: City) -> None:
    city_id = str(city.id)
    resp = await client.post(
        "/api/v1/checkout/place",
        json={
            "payment_method": "cod",
            "delivery_city_id": city_id,
            "delivery_date": _TOMORROW,
            "recipient_name": "Ammi Jaan",
            "recipient_phone": "+923001234500",
            "address_line1": "Somewhere Street 1",
        },
    )
    assert resp.status_code == 422
    assert "email and phone" in resp.json()["detail"]


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


# ── Coupons ───────────────────────────────────────────────────────────────────
#
# NOTE: every ORM attribute we need (product.id, city.id, coupon.code, etc.)
# must be captured into a plain local variable BEFORE the first `await
# client.post(...)`. The client fixture's get_db override commits + expires
# the whole session after each request; touching an expired attribute
# afterward triggers an implicit lazy-load, which raises MissingGreenlet
# outside of the request's own async context.


def _place_body(city_id: str, **overrides: object) -> dict:
    body = {
        "payment_method": "cod",
        "delivery_city_id": city_id,
        "delivery_date": _TOMORROW,
        "recipient_name": "Ammi",
        "recipient_phone": "+923001234567",
        "address_line1": "House 5 Street 10",
    }
    body.update(overrides)
    return body


@pytest.mark.asyncio
async def test_place_order_with_percent_coupon_applies_discount(
    client: AsyncClient, db: AsyncSession, customer: User, product: Product, city: City
) -> None:
    coupon = await _make_coupon(db, coupon_type=CouponType.percent, value=Decimal("10"))
    code = coupon.code
    email = customer.email
    product_id = str(product.id)
    city_id = str(city.id)
    base_price = product.base_price_pkr

    token = await _login(client, email)
    headers = {"Authorization": f"Bearer {token}"}
    await _add_item(client, token, product_id)

    resp = await client.post(
        "/api/v1/checkout/place",
        json=_place_body(city_id, coupon_code=code),
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["discount_pkr"] == int(base_price * Decimal("10") / Decimal("100"))
    assert data["total_pkr"] == base_price + 20000 - data["discount_pkr"]


@pytest.mark.asyncio
async def test_place_order_with_fixed_coupon_applies_flat_discount(
    client: AsyncClient, db: AsyncSession, customer: User, product: Product, city: City
) -> None:
    coupon = await _make_coupon(db, coupon_type=CouponType.fixed, value=Decimal("50"))
    code = coupon.code
    email = customer.email
    product_id = str(product.id)
    city_id = str(city.id)

    token = await _login(client, email)
    headers = {"Authorization": f"Bearer {token}"}
    await _add_item(client, token, product_id)

    resp = await client.post(
        "/api/v1/checkout/place",
        json=_place_body(city_id, coupon_code=code),
        headers=headers,
    )
    assert resp.status_code == 201
    assert resp.json()["discount_pkr"] == 5000


@pytest.mark.asyncio
async def test_place_order_with_free_shipping_coupon_waives_delivery_fee(
    client: AsyncClient, db: AsyncSession, customer: User, product: Product, city: City
) -> None:
    coupon = await _make_coupon(db, coupon_type=CouponType.free_shipping, value=Decimal("0"))
    code = coupon.code
    email = customer.email
    product_id = str(product.id)
    city_id = str(city.id)
    base_price = product.base_price_pkr

    token = await _login(client, email)
    headers = {"Authorization": f"Bearer {token}"}
    await _add_item(client, token, product_id)

    resp = await client.post(
        "/api/v1/checkout/place",
        json=_place_body(city_id, coupon_code=code),
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["discount_pkr"] == 20000
    assert data["total_pkr"] == base_price


@pytest.mark.asyncio
async def test_place_order_coupon_increments_used_count(
    client: AsyncClient, db: AsyncSession, customer: User, product: Product, city: City
) -> None:
    coupon = await _make_coupon(db, coupon_type=CouponType.fixed, value=Decimal("10"))
    code = coupon.code
    email = customer.email
    product_id = str(product.id)
    city_id = str(city.id)

    token = await _login(client, email)
    headers = {"Authorization": f"Bearer {token}"}
    await _add_item(client, token, product_id)

    resp = await client.post(
        "/api/v1/checkout/place",
        json=_place_body(city_id, coupon_code=code),
        headers=headers,
    )
    assert resp.status_code == 201

    from app.repositories.loyalty_repository import CouponRepository
    refreshed = await CouponRepository(db).get_by_code(code)
    assert refreshed is not None
    assert refreshed.used_count == 1


@pytest.mark.asyncio
async def test_place_order_invalid_coupon_code_returns_400(
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
        json=_place_body(city_id, coupon_code="NOSUCHCODE"),
        headers=headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_place_order_expired_coupon_returns_400(
    client: AsyncClient, db: AsyncSession, customer: User, product: Product, city: City
) -> None:
    coupon = await _make_coupon(
        db,
        coupon_type=CouponType.fixed,
        value=Decimal("10"),
        ends_at=datetime.now(UTC) - timedelta(days=1),
    )
    code = coupon.code
    email = customer.email
    product_id = str(product.id)
    city_id = str(city.id)

    token = await _login(client, email)
    headers = {"Authorization": f"Bearer {token}"}
    await _add_item(client, token, product_id)

    resp = await client.post(
        "/api/v1/checkout/place",
        json=_place_body(city_id, coupon_code=code),
        headers=headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_place_order_coupon_not_yet_active_returns_400(
    client: AsyncClient, db: AsyncSession, customer: User, product: Product, city: City
) -> None:
    coupon = await _make_coupon(
        db,
        coupon_type=CouponType.fixed,
        value=Decimal("10"),
        starts_at=datetime.now(UTC) + timedelta(days=1),
    )
    code = coupon.code
    email = customer.email
    product_id = str(product.id)
    city_id = str(city.id)

    token = await _login(client, email)
    headers = {"Authorization": f"Bearer {token}"}
    await _add_item(client, token, product_id)

    resp = await client.post(
        "/api/v1/checkout/place",
        json=_place_body(city_id, coupon_code=code),
        headers=headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_place_order_coupon_usage_limit_reached_returns_400(
    client: AsyncClient, db: AsyncSession, customer: User, product: Product, city: City
) -> None:
    coupon = await _make_coupon(
        db,
        coupon_type=CouponType.fixed,
        value=Decimal("10"),
        usage_limit=1,
        used_count=1,
    )
    code = coupon.code
    email = customer.email
    product_id = str(product.id)
    city_id = str(city.id)

    token = await _login(client, email)
    headers = {"Authorization": f"Bearer {token}"}
    await _add_item(client, token, product_id)

    resp = await client.post(
        "/api/v1/checkout/place",
        json=_place_body(city_id, coupon_code=code),
        headers=headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_place_order_coupon_min_order_not_met_returns_400(
    client: AsyncClient, db: AsyncSession, customer: User, product: Product, city: City
) -> None:
    email = customer.email
    product_id = str(product.id)
    city_id = str(city.id)
    coupon = await _make_coupon(
        db,
        coupon_type=CouponType.fixed,
        value=Decimal("10"),
        min_order_pkr=product.base_price_pkr + 100_000,
    )
    code = coupon.code

    token = await _login(client, email)
    headers = {"Authorization": f"Bearer {token}"}
    await _add_item(client, token, product_id)

    resp = await client.post(
        "/api/v1/checkout/place",
        json=_place_body(city_id, coupon_code=code),
        headers=headers,
    )
    assert resp.status_code == 400


# ── Loyalty points burn ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_place_order_burns_loyalty_points(
    client: AsyncClient, db: AsyncSession, customer: User, product: Product, city: City
) -> None:
    email = customer.email
    product_id = str(product.id)
    city_id = str(city.id)
    user_id = customer.id

    wallet = await LoyaltyRepository(db).get_or_create_wallet(user_id)
    wallet.balance_points = 10
    await db.flush()

    token = await _login(client, email)
    headers = {"Authorization": f"Bearer {token}"}
    await _add_item(client, token, product_id)

    resp = await client.post(
        "/api/v1/checkout/place",
        json=_place_body(city_id, use_loyalty_points=True),
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["discount_pkr"] > 0

    refreshed_wallet = await LoyaltyRepository(db).get_wallet(user_id)
    assert refreshed_wallet is not None
    assert refreshed_wallet.balance_points < 10


@pytest.mark.asyncio
async def test_place_order_loyalty_points_ignored_when_wallet_empty(
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
        json=_place_body(city_id, use_loyalty_points=True),
        headers=headers,
    )
    assert resp.status_code == 201
    assert resp.json()["discount_pkr"] == 0


# ── Variant stock handling ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_place_order_decrements_variant_stock(
    client: AsyncClient, db: AsyncSession, customer: User, product: Product, city: City
) -> None:
    email = customer.email
    product_id = str(product.id)
    city_id = str(city.id)
    product_pk = product.id

    variant = await _make_variant(db, product, stock_qty=5)
    variant_id = str(variant.id)
    variant_pk = variant.id

    token = await _login(client, email)
    headers = {"Authorization": f"Bearer {token}"}
    await _add_item(client, token, product_id, variant_id=variant_id)

    resp = await client.post(
        "/api/v1/checkout/place",
        json=_place_body(city_id),
        headers=headers,
    )
    assert resp.status_code == 201

    from app.repositories.catalog_repository import ProductRepository as PR
    refreshed_product = await PR(db).get_by_id(product_pk)
    refreshed_variant = next(v for v in refreshed_product.variants if v.id == variant_pk)
    assert refreshed_variant.stock_qty == 4
    assert refreshed_variant.is_active is True


@pytest.mark.asyncio
async def test_place_order_deactivates_variant_when_stock_hits_zero(
    client: AsyncClient, db: AsyncSession, customer: User, product: Product, city: City
) -> None:
    email = customer.email
    product_id = str(product.id)
    city_id = str(city.id)
    product_pk = product.id

    variant = await _make_variant(db, product, stock_qty=1)
    variant_id = str(variant.id)
    variant_pk = variant.id

    token = await _login(client, email)
    headers = {"Authorization": f"Bearer {token}"}
    await _add_item(client, token, product_id, variant_id=variant_id)

    resp = await client.post(
        "/api/v1/checkout/place",
        json=_place_body(city_id),
        headers=headers,
    )
    assert resp.status_code == 201

    from app.repositories.catalog_repository import ProductRepository as PR
    refreshed_product = await PR(db).get_by_id(product_pk)
    refreshed_variant = next(v for v in refreshed_product.variants if v.id == variant_pk)
    assert refreshed_variant.stock_qty == 0
    assert refreshed_variant.is_active is False


@pytest.mark.asyncio
async def test_place_order_insufficient_variant_stock_returns_409(
    client: AsyncClient, db: AsyncSession, customer: User, product: Product, city: City
) -> None:
    email = customer.email
    product_id = str(product.id)
    city_id = str(city.id)
    product_pk = product.id

    variant = await _make_variant(db, product, stock_qty=1)
    variant_id = str(variant.id)
    variant_pk = variant.id

    token = await _login(client, email)
    headers = {"Authorization": f"Bearer {token}"}
    resp = await client.post(
        "/api/v1/cart/items",
        json={"product_id": product_id, "variant_id": variant_id, "qty": 1},
        headers=headers,
    )
    assert resp.status_code == 201

    # Simulate the variant selling out (e.g. a concurrent order) between
    # add-to-cart and checkout, so the cart-level check passed but the
    # checkout-time stock re-validation must still catch it.
    from app.repositories.catalog_repository import ProductRepository as PR
    refreshed_product = await PR(db).get_by_id(product_pk)
    refreshed_variant = next(v for v in refreshed_product.variants if v.id == variant_pk)
    refreshed_variant.stock_qty = 0
    await db.flush()

    resp = await client.post(
        "/api/v1/checkout/place",
        json=_place_body(city_id),
        headers=headers,
    )
    assert resp.status_code == 409


# ── Idempotency replay ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_place_order_same_idempotency_key_returns_same_order(
    client: AsyncClient, customer: User, product: Product, city: City
) -> None:
    email = customer.email
    product_id = str(product.id)
    city_id = str(city.id)

    token = await _login(client, email)
    key = str(uuid.uuid4())
    headers = {"Authorization": f"Bearer {token}", "idempotency-key": key}

    await _add_item(client, token, product_id)
    first = await client.post(
        "/api/v1/checkout/place",
        json=_place_body(city_id),
        headers=headers,
    )
    assert first.status_code == 201
    first_id = first.json()["id"]

    # Replay with the same key — must return the original order, not create a
    # second one (idempotency short-circuit before any cart/stock validation).
    second = await client.post(
        "/api/v1/checkout/place",
        json=_place_body(city_id),
        headers=headers,
    )
    assert second.status_code == 201
    assert second.json()["id"] == first_id


# ── Surprise mode and sender name (recipient messages) ───────────────────────


@pytest.mark.asyncio
async def test_place_order_keeps_surprise_and_sender_name(
    client: AsyncClient, customer: User, product: Product, city: City
) -> None:
    email, product_id, city_id = customer.email, str(product.id), str(city.id)
    token = await _login(client, email)
    await _add_item(client, token, product_id)

    resp = await client.post(
        "/api/v1/checkout/place",
        json=_place_body(city_id, surprise=True, gift_from="  Ali (London) "),
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 201
    assert resp.json()["surprise"] is True
    assert resp.json()["gift_from"] == "Ali (London)"


@pytest.mark.asyncio
async def test_sender_name_defaults_to_the_account_name(
    client: AsyncClient, db: AsyncSession, customer: User, product: Product, city: City
) -> None:
    customer.full_name = "Ali Khan"
    await db.commit()
    email, product_id, city_id = customer.email, str(product.id), str(city.id)
    token = await _login(client, email)
    await _add_item(client, token, product_id)

    resp = await client.post(
        "/api/v1/checkout/place", json=_place_body(city_id), headers={"Authorization": f"Bearer {token}"}
    )

    assert resp.json()["surprise"] is False
    assert resp.json()["gift_from"] == "Ali Khan"
