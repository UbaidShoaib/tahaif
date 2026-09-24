"""HTTP-layer tests for the vendor portal endpoints."""

import uuid
from datetime import date, timedelta

import pytest
import pytest_asyncio
from httpx import AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.catalog import City, Product, ProductCity, Vendor
from app.models.order import (
    Fulfillment,
    FulfillmentStatus,
    Order,
    OrderItem,
    OrderStatus,
    Payment,
    PaymentMethod,
    PaymentStatus,
)
from app.models.user import User, UserRole
from app.repositories.catalog_repository import (
    CityRepository,
    ProductRepository,
    VendorRepository,
)
from app.repositories.user_repository import UserRepository

# ── Helpers ───────────────────────────────────────────────────────────────────


async def _make_user(db: AsyncSession, role: UserRole = UserRole.customer) -> User:
    from app.core.security import hash_password
    suffix = uuid.uuid4().hex[:8]
    return await UserRepository(db).create(
        email=f"vnd_{suffix}@example.com",
        password_hash=hash_password("Password1"),
        role=role,
    )


async def _make_city(db: AsyncSession) -> City:
    slug = f"v-city-{uuid.uuid4().hex[:6]}"
    return await CityRepository(db).create(name=slug.title(), slug=slug, timezone="Asia/Karachi")


async def _make_vendor(db: AsyncSession, city: City, owner: User | None = None) -> Vendor:
    suffix = uuid.uuid4().hex[:6]
    return await VendorRepository(db).create(
        city_id=city.id,
        owner_user_id=owner.id if owner else None,
        name=f"Vendor {suffix}",
        slug=f"vendor-{suffix}",
        description="Best vendor in town",
    )


async def _make_product(db: AsyncSession, vendor: Vendor, city: City) -> Product:
    suffix = uuid.uuid4().hex[:6]
    product = await ProductRepository(db).create(
        vendor_id=vendor.id,
        name=f"Product {suffix}",
        slug=f"product-{suffix}",
        base_price_pkr=60000,
    )
    db.add(ProductCity(product_id=product.id, city_id=city.id, delivery_fee_pkr=15000))
    await db.flush()
    return product


async def _make_order_with_fulfillment(
    db: AsyncSession,
    vendor: Vendor,
    product: Product,
    city: City,
    buyer: User,
    method: PaymentMethod = PaymentMethod.cod,
    pay_status: PaymentStatus = PaymentStatus.pending_cod,
    order_status: OrderStatus = OrderStatus.pending_payment,
) -> tuple[Order, Fulfillment]:
    """Create a minimal order+fulfillment for testing vendor portal."""
    tomorrow = date.today() + timedelta(days=1)

    # Create order
    order = Order(
        user_id=buyer.id,
        currency="PKR",
        subtotal_pkr=product.base_price_pkr,
        delivery_pkr=15000,
        total_pkr=product.base_price_pkr + 15000,
        total_charged=product.base_price_pkr + 15000,
        status=order_status,
        public_token=uuid.uuid4(),
    )
    db.add(order)
    await db.flush()

    # Create fulfillment
    fulfillment = Fulfillment(
        order_id=order.id,
        vendor_id=vendor.id,
        recipient_name="Test Recipient",
        recipient_phone="+923001234567",
        address_line1="House 5 Street 10",
        city_id=city.id,
        delivery_date=tomorrow,
        status=FulfillmentStatus.pending,
    )
    db.add(fulfillment)
    await db.flush()

    # Create order item
    item = OrderItem(
        order_id=order.id,
        fulfillment_id=fulfillment.id,
        product_id=product.id,
        qty=1,
        unit_price_pkr=product.base_price_pkr,
        line_total_pkr=product.base_price_pkr,
    )
    db.add(item)

    # Create payment
    payment = Payment(
        order_id=order.id,
        method=method,
        status=pay_status,
        amount_pkr=order.total_pkr,
        amount_charged=order.total_pkr,
        currency="PKR",
    )
    db.add(payment)
    await db.flush()

    return order, fulfillment


async def _login(client: AsyncClient, email: str) -> str:
    resp = await client.post("/api/v1/auth/login", json={"email": email, "password": "Password1"})
    assert resp.status_code == 200
    return resp.json()["access_token"]


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def vendor_user(db: AsyncSession) -> User:
    return await _make_user(db, UserRole.vendor)


@pytest_asyncio.fixture
async def buyer(db: AsyncSession) -> User:
    return await _make_user(db, UserRole.customer)


@pytest_asyncio.fixture
async def city(db: AsyncSession) -> City:
    return await _make_city(db)


@pytest_asyncio.fixture
async def vendor(db: AsyncSession, city: City, vendor_user: User) -> Vendor:
    return await _make_vendor(db, city, owner=vendor_user)


@pytest_asyncio.fixture
async def product(db: AsyncSession, vendor: Vendor, city: City) -> Product:
    return await _make_product(db, vendor, city)


@pytest_asyncio.fixture
async def order_and_fulfillment(
    db: AsyncSession, vendor: Vendor, product: Product, city: City, buyer: User
) -> tuple[Order, Fulfillment]:
    return await _make_order_with_fulfillment(db, vendor, product, city, buyer)


# ── GET /vendor/me ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_my_vendor(client: AsyncClient, vendor_user: User, vendor: Vendor) -> None:
    email = vendor_user.email
    vendor_name = vendor.name

    token = await _login(client, email)
    resp = await client.get("/api/v1/vendor/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["name"] == vendor_name


@pytest.mark.asyncio
async def test_get_my_vendor_no_vendor_returns_403(client: AsyncClient, db: AsyncSession) -> None:
    user = await _make_user(db, UserRole.vendor)
    email = user.email
    # No vendor created for this user
    token = await _login(client, email)
    resp = await client.get("/api/v1/vendor/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_get_my_vendor_requires_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/vendor/me")
    assert resp.status_code == 401


# ── PATCH /vendor/me ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_update_my_vendor(client: AsyncClient, vendor_user: User, vendor: Vendor) -> None:
    email = vendor_user.email
    token = await _login(client, email)

    resp = await client.patch(
        "/api/v1/vendor/me",
        json={"description": "Updated description"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["description"] == "Updated description"


@pytest.mark.asyncio
async def test_update_my_vendor_empty_body_is_noop(
    client: AsyncClient, vendor_user: User, vendor: Vendor
) -> None:
    email = vendor_user.email
    vendor_name = vendor.name
    token = await _login(client, email)

    resp = await client.patch(
        "/api/v1/vendor/me", json={}, headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == vendor_name


# ── GET /vendor/fulfillments ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_fulfillments_returns_own_fulfillments(
    client: AsyncClient,
    vendor_user: User,
    vendor: Vendor,
    order_and_fulfillment: tuple,
) -> None:
    email = vendor_user.email
    order, fulfillment = order_and_fulfillment
    fulfillment_id = str(fulfillment.id)

    token = await _login(client, email)
    resp = await client.get(
        "/api/v1/vendor/fulfillments",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    ids = [f["id"] for f in data]
    assert fulfillment_id in ids


@pytest.mark.asyncio
async def test_list_fulfillments_filter_by_status(
    client: AsyncClient,
    vendor_user: User,
    vendor: Vendor,
    order_and_fulfillment: tuple,
) -> None:
    email = vendor_user.email
    token = await _login(client, email)

    resp = await client.get(
        "/api/v1/vendor/fulfillments?filter_status=preparing",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    # Our fulfillment is "pending", so filtered list should be empty
    assert resp.json() == []


@pytest.mark.asyncio
async def test_list_fulfillments_empty_when_no_vendor(
    client: AsyncClient, db: AsyncSession
) -> None:
    user = await _make_user(db, UserRole.vendor)
    email = user.email
    token = await _login(client, email)
    resp = await client.get(
        "/api/v1/vendor/fulfillments", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_list_fulfillments_requires_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/vendor/fulfillments")
    assert resp.status_code == 401


# ── PATCH /vendor/fulfillments/{id} ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_update_fulfillment_status(
    client: AsyncClient,
    vendor_user: User,
    vendor: Vendor,
    order_and_fulfillment: tuple,
) -> None:
    email = vendor_user.email
    _order, fulfillment = order_and_fulfillment
    fulfillment_id = str(fulfillment.id)

    token = await _login(client, email)
    resp = await client.patch(
        f"/api/v1/vendor/fulfillments/{fulfillment_id}",
        json={"status": "preparing"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "preparing"


@pytest.mark.asyncio
async def test_update_fulfillment_dispatched_sets_timestamp(
    client: AsyncClient,
    vendor_user: User,
    vendor: Vendor,
    order_and_fulfillment: tuple,
) -> None:
    email = vendor_user.email
    _order, fulfillment = order_and_fulfillment
    fulfillment_id = str(fulfillment.id)

    token = await _login(client, email)
    resp = await client.patch(
        f"/api/v1/vendor/fulfillments/{fulfillment_id}",
        json={"status": "dispatched", "courier_tracking": "TCS-12345"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "dispatched"
    assert data["courier_tracking"] == "TCS-12345"
    assert data["dispatched_at"] is not None


@pytest.mark.asyncio
async def test_update_fulfillment_delivered_propagates_order_status(
    client: AsyncClient,
    db: AsyncSession,
    vendor_user: User,
    vendor: Vendor,
    order_and_fulfillment: tuple,
) -> None:
    email = vendor_user.email
    _order, fulfillment = order_and_fulfillment
    fulfillment_id = str(fulfillment.id)
    order_id = _order.id

    token = await _login(client, email)
    resp = await client.patch(
        f"/api/v1/vendor/fulfillments/{fulfillment_id}",
        json={"status": "delivered"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["delivered_at"] is not None

    # Reload order to verify status propagated
    from sqlalchemy import select as sa_select

    from app.models.order import Order as OrderModel
    db.expire_all()
    result = await db.execute(sa_select(OrderModel).where(OrderModel.id == order_id))
    order_reloaded = result.scalar_one()
    assert order_reloaded.status == OrderStatus.delivered


@pytest.mark.asyncio
async def test_update_fulfillment_not_found_returns_404(
    client: AsyncClient,
    vendor_user: User,
    vendor: Vendor,
) -> None:
    email = vendor_user.email
    token = await _login(client, email)
    resp = await client.patch(
        f"/api/v1/vendor/fulfillments/{uuid.uuid4()}",
        json={"status": "preparing"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


# ── Fulfillment rules: forward-only, payment-gated, frozen orders ─────────────


async def _patch(client: AsyncClient, token: str, fulfillment_id: object, **body: object) -> Response:
    return await client.patch(
        f"/api/v1/vendor/fulfillments/{fulfillment_id}",
        json=body,
        headers={"Authorization": f"Bearer {token}"},
    )


async def _order_status(db: AsyncSession, order_id: uuid.UUID) -> OrderStatus:
    from sqlalchemy import select as sa_select

    db.expire_all()
    result = await db.execute(sa_select(Order.status).where(Order.id == order_id))
    return result.scalar_one()


@pytest.mark.asyncio
async def test_fulfillment_cannot_move_backwards(
    client: AsyncClient, vendor_user: User, vendor: Vendor, order_and_fulfillment: tuple[Order, Fulfillment]
) -> None:
    _order, fulfillment = order_and_fulfillment
    fid = fulfillment.id
    token = await _login(client, vendor_user.email)

    assert (await _patch(client, token, fid, status="dispatched")).status_code == 200
    resp = await _patch(client, token, fid, status="preparing")

    assert resp.status_code == 409
    assert "dispatched to preparing" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_delivered_fulfillment_is_final_and_order_does_not_regress(
    client: AsyncClient, db: AsyncSession, vendor_user: User, vendor: Vendor, order_and_fulfillment: tuple[Order, Fulfillment]
) -> None:
    order, fulfillment = order_and_fulfillment
    fid, oid = fulfillment.id, order.id
    token = await _login(client, vendor_user.email)

    assert (await _patch(client, token, fid, status="delivered")).status_code == 200
    for status_name in ("preparing", "failed", "delivered"):
        resp = await _patch(client, token, fid, status=status_name)
        assert resp.status_code == 409, status_name

    assert await _order_status(db, oid) == OrderStatus.delivered


@pytest.mark.asyncio
async def test_same_status_update_can_add_tracking(
    client: AsyncClient, vendor_user: User, vendor: Vendor, order_and_fulfillment: tuple[Order, Fulfillment]
) -> None:
    _order, fulfillment = order_and_fulfillment
    fid = fulfillment.id
    token = await _login(client, vendor_user.email)

    assert (await _patch(client, token, fid, status="dispatched")).status_code == 200
    resp = await _patch(client, token, fid, status="dispatched", courier_tracking="TCS-999")

    assert resp.status_code == 200
    assert resp.json()["courier_tracking"] == "TCS-999"


@pytest.mark.asyncio
async def test_open_fulfillment_can_be_marked_failed(
    client: AsyncClient, vendor_user: User, vendor: Vendor, order_and_fulfillment: tuple[Order, Fulfillment]
) -> None:
    _order, fulfillment = order_and_fulfillment
    fid = fulfillment.id
    token = await _login(client, vendor_user.email)

    assert (await _patch(client, token, fid, status="ready")).status_code == 200
    resp = await _patch(client, token, fid, status="failed")

    assert resp.status_code == 200
    assert resp.json()["status"] == "failed"


@pytest.mark.asyncio
async def test_unpaid_bank_transfer_cannot_be_fulfilled(
    client: AsyncClient,
    db: AsyncSession,
    vendor_user: User,
    vendor: Vendor,
    product: Product,
    city: City,
    buyer: User,
) -> None:
    order, fulfillment = await _make_order_with_fulfillment(
        db, vendor, product, city, buyer,
        method=PaymentMethod.bank_transfer, pay_status=PaymentStatus.pending_proof,
    )
    fid, oid = fulfillment.id, order.id
    await db.commit()
    token = await _login(client, vendor_user.email)

    for status_name in ("preparing", "dispatched"):
        resp = await _patch(client, token, fid, status=status_name)
        assert resp.status_code == 409, status_name
        assert "Payment has not been verified" in resp.json()["detail"]

    assert await _order_status(db, oid) == OrderStatus.pending_payment


@pytest.mark.asyncio
async def test_verified_bank_transfer_can_be_fulfilled(
    client: AsyncClient,
    db: AsyncSession,
    vendor_user: User,
    vendor: Vendor,
    product: Product,
    city: City,
    buyer: User,
) -> None:
    order, fulfillment = await _make_order_with_fulfillment(
        db, vendor, product, city, buyer,
        method=PaymentMethod.bank_transfer, pay_status=PaymentStatus.paid, order_status=OrderStatus.paid,
    )
    fid, oid = fulfillment.id, order.id
    await db.commit()
    token = await _login(client, vendor_user.email)

    resp = await _patch(client, token, fid, status="preparing")

    assert resp.status_code == 200
    assert await _order_status(db, oid) == OrderStatus.preparing


@pytest.mark.asyncio
@pytest.mark.parametrize("frozen", [OrderStatus.cancelled, OrderStatus.refunded, OrderStatus.on_hold])
async def test_frozen_order_blocks_fulfillment_updates(
    client: AsyncClient,
    db: AsyncSession,
    vendor_user: User,
    vendor: Vendor,
    product: Product,
    city: City,
    buyer: User,
    frozen: OrderStatus,
) -> None:
    order, fulfillment = await _make_order_with_fulfillment(db, vendor, product, city, buyer, order_status=frozen)
    fid, oid = fulfillment.id, order.id
    await db.commit()
    token = await _login(client, vendor_user.email)

    resp = await _patch(client, token, fid, status="preparing")

    assert resp.status_code == 409
    assert await _order_status(db, oid) == frozen


@pytest.mark.asyncio
async def test_completed_order_status_is_not_overwritten(
    client: AsyncClient,
    db: AsyncSession,
    vendor_user: User,
    vendor: Vendor,
    product: Product,
    city: City,
    buyer: User,
) -> None:
    order, fulfillment = await _make_order_with_fulfillment(
        db, vendor, product, city, buyer, order_status=OrderStatus.completed
    )
    fid, oid = fulfillment.id, order.id
    await db.commit()
    token = await _login(client, vendor_user.email)

    resp = await _patch(client, token, fid, status="delivered")

    assert resp.status_code == 200
    assert await _order_status(db, oid) == OrderStatus.completed


# ── GET /vendor/products ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_my_products(
    client: AsyncClient, vendor_user: User, vendor: Vendor, product: Product
) -> None:
    email = vendor_user.email
    product_id = str(product.id)

    token = await _login(client, email)
    resp = await client.get(
        "/api/v1/vendor/products",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    ids = [p["id"] for p in resp.json()]
    assert product_id in ids


@pytest.mark.asyncio
async def test_list_my_products_returns_only_own(
    client: AsyncClient,
    db: AsyncSession,
    vendor_user: User,
    vendor: Vendor,
    product: Product,
) -> None:
    email = vendor_user.email
    city = await _make_city(db)
    other_vendor = await _make_vendor(db, city)
    other_product = await _make_product(db, other_vendor, city)
    product_id = str(product.id)
    other_product_id = str(other_product.id)

    token = await _login(client, email)
    resp = await client.get(
        "/api/v1/vendor/products", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    ids = [p["id"] for p in resp.json()]
    assert product_id in ids
    assert other_product_id not in ids


@pytest.mark.asyncio
async def test_list_my_products_requires_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/vendor/products")
    assert resp.status_code == 401
