"""Regressions from real-user testing: races at checkout, selling where the shop
doesn't deliver, city prices, loyalty on cancelled orders, and request hardening."""

import asyncio
import uuid
from collections.abc import Awaitable, Callable
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

import pytest
from fastapi import HTTPException
from httpx import AsyncClient
from sqlalchemy import NullPool, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models.bucket import BucketStatus, CustomBucket
from app.models.catalog import City, Product, ProductCity, ProductVariant
from app.models.loyalty import Coupon, CouponType, LoyaltyWallet
from app.models.order import Order, OrderStatus, PaymentMethod, PaymentStatus
from app.models.user import User, UserRole
from app.schemas.cart import CartItemAdd
from app.schemas.order import CheckoutPlace
from app.services import cart_service, checkout_service
from tests.conftest import TEST_DB_URL
from tests.test_buckets import _edit, _make_builder, _start
from tests.test_checkout import (
    _TOMORROW,
    _login,
    _make_city,
    _make_coupon,
    _make_product,
    _make_user,
    _make_variant,
    _make_vendor,
)

CO = "/api/v1/checkout"


def _body(city_id: Any, **extra: object) -> dict[str, Any]:
    return {
        "payment_method": "cod",
        "delivery_city_id": str(city_id),
        "delivery_date": _TOMORROW,
        "recipient_name": "Ammi Jaan",
        "recipient_phone": "+92 300 1234567",
        "address_line1": "12 Main Boulevard, Gulberg",
        **extra,
    }


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _shop(db: AsyncSession) -> tuple[City, Product]:
    city = await _make_city(db)
    vendor = await _make_vendor(db, city)
    return city, await _make_product(db, vendor, city)


async def _signed_in(client: AsyncClient, db: AsyncSession) -> tuple[uuid.UUID, dict[str, str]]:
    user = await _make_user(db)
    user_id, email = user.id, user.email
    await db.commit()
    return user_id, _auth(await _login(client, email))


# ── Concurrency: each checkout in its own session, as separate requests are ───


async def _in_parallel(n: int, work: Callable[[AsyncSession, int], Awaitable[Any]]) -> list[Any]:
    """Run ``work`` n times at once, each in its own committed transaction; HTTP errors are returned."""
    engine = create_async_engine(TEST_DB_URL, poolclass=NullPool)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def one(i: int) -> Any:
        async with factory() as session:
            try:
                result = await work(session, i)
                await session.commit()
                return result
            except HTTPException as exc:
                await session.rollback()
                return exc

    try:
        return await asyncio.gather(*(one(i) for i in range(n)))
    finally:
        await engine.dispose()


def _place(city_id: uuid.UUID, **extra: object) -> CheckoutPlace:
    return CheckoutPlace.model_validate(_body(city_id, **extra))


async def _buyers_with_carts(
    db: AsyncSession, n: int, product_id: uuid.UUID, variant_id: uuid.UUID | None = None
) -> list[uuid.UUID]:
    await db.commit()
    db.expire_all()  # the product was loaded before its variant was added
    ids = []
    for _ in range(n):
        user = await _make_user(db)
        await cart_service.add_item(db, user.id, CartItemAdd(product_id=product_id, variant_id=variant_id))
        ids.append(user.id)
    await db.commit()
    return ids


@pytest.mark.asyncio
async def test_concurrent_checkouts_cannot_oversell(db: AsyncSession) -> None:
    city, product = await _shop(db)
    variant = await _make_variant(db, product, stock_qty=3)
    city_id, variant_id = city.id, variant.id
    buyers = await _buyers_with_carts(db, 6, product.id, variant.id)

    async def buy(s: AsyncSession, i: int) -> Any:
        return await checkout_service.place_order(s, await s.get(User, buyers[i]), _place(city_id))

    results = await _in_parallel(6, buy)
    sold = [r for r in results if not isinstance(r, HTTPException)]
    assert len(sold) == 3
    assert all(r.status_code == 409 for r in results if isinstance(r, HTTPException))
    db.expire_all()
    assert (await db.get(ProductVariant, variant_id)).stock_qty == 0  # type: ignore[union-attr]


@pytest.mark.asyncio
async def test_coupon_usage_limit_holds_under_concurrency(db: AsyncSession) -> None:
    city, product = await _shop(db)
    coupon = await _make_coupon(db, CouponType.fixed, Decimal("100"), usage_limit=1)
    city_id, code = city.id, coupon.code
    buyers = await _buyers_with_carts(db, 5, product.id)

    async def buy(s: AsyncSession, i: int) -> Any:
        return await checkout_service.place_order(s, await s.get(User, buyers[i]), _place(city_id, coupon_code=code))

    results = await _in_parallel(5, buy)
    assert sum(not isinstance(r, HTTPException) for r in results) == 1
    db.expire_all()
    used = (await db.execute(select(Coupon.used_count).where(Coupon.code == code))).scalar_one()
    orders = (await db.execute(select(Order.id).where(Order.coupon_code == code))).all()
    assert used == 1 and len(orders) == 1


@pytest.mark.asyncio
async def test_double_submit_of_one_cart_places_one_order(db: AsyncSession) -> None:
    city, product = await _shop(db)
    city_id = city.id
    [buyer] = await _buyers_with_carts(db, 1, product.id)

    async def buy(s: AsyncSession, _: int) -> Any:
        return await checkout_service.place_order(s, await s.get(User, buyer), _place(city_id))

    results = await _in_parallel(4, buy)
    assert sum(not isinstance(r, HTTPException) for r in results) == 1
    assert {r.detail for r in results if isinstance(r, HTTPException)} == {"Cart is empty"}


@pytest.mark.asyncio
async def test_retries_with_one_idempotency_key_return_the_same_order(db: AsyncSession) -> None:
    city, product = await _shop(db)
    city_id = city.id
    [buyer] = await _buyers_with_carts(db, 1, product.id)
    key = uuid.uuid4().hex

    async def buy(s: AsyncSession, _: int) -> Any:
        return await checkout_service.place_order(s, await s.get(User, buyer), _place(city_id), key)

    results = await _in_parallel(4, buy)
    assert not any(isinstance(r, HTTPException) for r in results)  # no 500s from the unique key
    assert len({r.id for r in results}) == 1


@pytest.mark.asyncio
async def test_concurrent_points_spend_never_goes_negative(db: AsyncSession) -> None:
    """Two devices of one buyer: the cart lock serialises them and the wallet is re-read."""
    city, product = await _shop(db)
    city_id = city.id
    [buyer] = await _buyers_with_carts(db, 1, product.id)
    db.add(LoyaltyWallet(user_id=buyer, balance_points=500))
    await db.commit()

    async def buy(s: AsyncSession, _: int) -> Any:
        return await checkout_service.place_order(s, await s.get(User, buyer), _place(city_id, use_loyalty_points=True))

    await _in_parallel(3, buy)
    db.expire_all()
    wallet = (await db.execute(select(LoyaltyWallet).where(LoyaltyWallet.user_id == buyer))).scalar_one()
    assert wallet.balance_points >= 0 and wallet.lifetime_burned == 500


# ── Only sell what the shop delivers, where it delivers ───────────────────────


@pytest.mark.asyncio
async def test_city_the_product_isnt_sold_in_is_refused(client: AsyncClient, db: AsyncSession) -> None:
    _, product = await _shop(db)
    elsewhere = await _make_city(db)
    product_id, other_id = str(product.id), elsewhere.id
    _, headers = await _signed_in(client, db)
    await client.post("/api/v1/cart/items", json={"product_id": product_id}, headers=headers)

    quote = await client.post(f"{CO}/quote?city_id={other_id}", headers=headers)
    assert quote.status_code == 409 and "isn't delivered to" in quote.json()["detail"]
    today = date.today().isoformat()
    place = await client.post(f"{CO}/place", json=_body(other_id, delivery_date=today), headers=headers)
    assert place.status_code == 409


@pytest.mark.asyncio
async def test_product_switched_off_for_the_city_is_refused(client: AsyncClient, db: AsyncSession) -> None:
    city, product = await _shop(db)
    city_id, product_id = city.id, product.id
    _, headers = await _signed_in(client, db)
    await client.post("/api/v1/cart/items", json={"product_id": str(product_id)}, headers=headers)
    pc = (await db.execute(select(ProductCity).where(ProductCity.product_id == product_id))).scalar_one()
    pc.is_available = False
    await db.commit()

    assert (await client.post(f"{CO}/place", json=_body(city_id), headers=headers)).status_code == 409


@pytest.mark.asyncio
async def test_product_deactivated_after_carting_is_refused(client: AsyncClient, db: AsyncSession) -> None:
    city, product = await _shop(db)
    city_id, product_id = city.id, product.id
    _, headers = await _signed_in(client, db)
    await client.post("/api/v1/cart/items", json={"product_id": str(product_id)}, headers=headers)
    (await db.get(Product, product_id)).is_active = False  # type: ignore[union-attr]
    await db.commit()

    resp = await client.post(f"{CO}/place", json=_body(city_id), headers=headers)
    assert resp.status_code == 409 and "no longer available" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_variant_deactivated_after_carting_is_refused(client: AsyncClient, db: AsyncSession) -> None:
    city, product = await _shop(db)
    variant = await _make_variant(db, product, stock_qty=None)
    city_id, product_id, variant_id = city.id, str(product.id), variant.id
    _, headers = await _signed_in(client, db)
    await client.post("/api/v1/cart/items", json={"product_id": product_id, "variant_id": str(variant_id)}, headers=headers)
    (await db.get(ProductVariant, variant_id)).is_active = False  # type: ignore[union-attr]
    await db.commit()

    assert (await client.post(f"{CO}/place", json=_body(city_id), headers=headers)).status_code == 409


@pytest.mark.asyncio
async def test_inactive_city_is_refused(client: AsyncClient, db: AsyncSession) -> None:
    city, product = await _shop(db)
    city_id, product_id = city.id, str(product.id)
    _, headers = await _signed_in(client, db)
    await client.post("/api/v1/cart/items", json={"product_id": product_id}, headers=headers)
    (await db.get(City, city_id)).is_active = False  # type: ignore[union-attr]
    await db.commit()

    assert (await client.post(f"{CO}/place", json=_body(city_id), headers=headers)).status_code == 400


@pytest.mark.asyncio
async def test_delivery_date_more_than_a_year_out_is_refused(client: AsyncClient, db: AsyncSession) -> None:
    city, product = await _shop(db)
    city_id, product_id = city.id, str(product.id)
    _, headers = await _signed_in(client, db)
    await client.post("/api/v1/cart/items", json={"product_id": product_id}, headers=headers)

    far = (date.today() + timedelta(days=400)).isoformat()
    resp = await client.post(f"{CO}/place", json=_body(city_id, delivery_date=far), headers=headers)
    assert resp.status_code == 422 and "a year ahead" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_build_your_own_bucket_needs_a_city_its_base_is_sold_in(client: AsyncClient, db: AsyncSession) -> None:
    base, rose, _ = await _make_builder(db)
    elsewhere = await _make_city(db)
    other_id = elsewhere.id
    await db.commit()
    bucket_id, token = await _start(client, base)
    await _edit(client, bucket_id, token, {"op": "add", "component_id": str(rose.id), "qty": 2})
    cart = (await client.post(f"/api/v1/buckets/{bucket_id}/cart?t={token}")).json()
    guest = {"X-Cart-Token": cart["guest_token"]}

    extra = {"contact_email": "g@example.com", "contact_phone": "03001234567"}
    assert (await client.post(f"{CO}/place", json=_body(other_id, **extra), headers=guest)).status_code == 409
    resp = await client.post(f"{CO}/place", json=_body(base.city_id, **extra), headers=guest)
    assert resp.status_code == 201, resp.text
    assert resp.json()["delivery_pkr"] == 25000
    bucket = await db.get(CustomBucket, uuid.UUID(bucket_id), populate_existing=True)
    assert bucket.status == BucketStatus.ORDERED  # type: ignore[union-attr]


# ── Pricing ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_city_price_override_is_what_the_buyer_pays(client: AsyncClient, db: AsyncSession) -> None:
    city, product = await _shop(db)
    city_id, product_id = city.id, product.id
    pc = (await db.execute(select(ProductCity).where(ProductCity.product_id == product_id))).scalar_one()
    pc.price_override_pkr = 90000  # base price is 75000
    await db.commit()
    _, headers = await _signed_in(client, db)
    cart = (await client.post("/api/v1/cart/items", json={"product_id": str(product_id)}, headers=headers)).json()

    quote = (await client.post(f"{CO}/quote?city_id={city_id}", headers=headers)).json()
    assert quote["subtotal_pkr"] == 90000
    assert quote["items"][0]["cart_item_id"] == cart["items"][0]["id"]
    order = (await client.post(f"{CO}/place", json=_body(city_id), headers=headers)).json()
    assert order["subtotal_pkr"] == 90000 and order["items"][0]["unit_price_pkr"] == 90000


@pytest.mark.asyncio
async def test_one_delivery_fee_per_shop(client: AsyncClient, db: AsyncSession) -> None:
    city = await _make_city(db)
    vendor = await _make_vendor(db, city)
    cake, flowers = await _make_product(db, vendor, city), await _make_product(db, vendor, city)
    other_vendor = await _make_vendor(db, city)
    perfume = await _make_product(db, other_vendor, city)
    city_id, ids = city.id, [str(p.id) for p in (cake, flowers, perfume)]
    _, headers = await _signed_in(client, db)
    for pid in ids:
        await client.post("/api/v1/cart/items", json={"product_id": pid}, headers=headers)

    order = (await client.post(f"{CO}/place", json=_body(city_id), headers=headers)).json()
    assert len(order["fulfillments"]) == 2
    assert order["delivery_pkr"] == 2 * 20000  # one per shop, not one per line


@pytest.mark.asyncio
async def test_coupon_per_customer_limit(client: AsyncClient, db: AsyncSession) -> None:
    city, product = await _shop(db)
    coupon = await _make_coupon(db, CouponType.percent, Decimal("20"), per_customer_limit=1)
    city_id, product_id, code = city.id, str(product.id), coupon.code
    _, headers = await _signed_in(client, db)

    await client.post("/api/v1/cart/items", json={"product_id": product_id}, headers=headers)
    assert (await client.post(f"{CO}/place", json=_body(city_id, coupon_code=code), headers=headers)).status_code == 201
    await client.post("/api/v1/cart/items", json={"product_id": product_id}, headers=headers)
    again = await client.post(f"{CO}/place", json=_body(city_id, coupon_code=code), headers=headers)
    assert again.status_code == 400 and again.json()["detail"] == "You've already used this coupon"


# ── Idempotency keys belong to one buyer ──────────────────────────────────────


@pytest.mark.asyncio
async def test_another_buyers_idempotency_key_never_returns_their_order(client: AsyncClient, db: AsyncSession) -> None:
    city, product = await _shop(db)
    city_id, product_id = city.id, str(product.id)
    _, alice = await _signed_in(client, db)
    _, bob = await _signed_in(client, db)
    key = {"Idempotency-Key": "same-key"}

    await client.post("/api/v1/cart/items", json={"product_id": product_id}, headers=alice)
    first = await client.post(f"{CO}/place", json=_body(city_id), headers={**alice, **key})
    assert first.status_code == 201
    second = await client.post(f"{CO}/place", json=_body(city_id), headers={**bob, **key})
    assert second.status_code == 400  # Bob's own (empty) cart, not Alice's order


# ── Loyalty and coupons on cancelled orders ───────────────────────────────────


async def _admin_headers(client: AsyncClient, db: AsyncSession) -> dict[str, str]:
    admin = await _make_user(db, UserRole.admin)
    email = admin.email
    await db.commit()
    return _auth(await _login(client, email))


async def _wallet(db: AsyncSession, user_id: uuid.UUID) -> LoyaltyWallet:
    return (
        await db.execute(
            select(LoyaltyWallet).where(LoyaltyWallet.user_id == user_id).execution_options(populate_existing=True)
        )
    ).scalar_one()


@pytest.mark.asyncio
async def test_cancelling_withdraws_earned_points(client: AsyncClient, db: AsyncSession) -> None:
    city, product = await _shop(db)
    city_id, product_id = city.id, str(product.id)
    user_id, headers = await _signed_in(client, db)
    admin = await _admin_headers(client, db)
    await client.post("/api/v1/cart/items", json={"product_id": product_id}, headers=headers)
    order = (await client.post(f"{CO}/place", json=_body(city_id), headers=headers)).json()
    assert (await _wallet(db, user_id)).balance_points == order["total_pkr"] // 10_000

    resp = await client.patch(f"/api/v1/admin/orders/{order['id']}/status", json={"status": "cancelled"}, headers=admin)
    assert resp.status_code == 200
    assert (await _wallet(db, user_id)).balance_points == 0
    # A second cancel attempt (already final) changes nothing.
    await client.patch(f"/api/v1/admin/orders/{order['id']}/status", json={"status": "cancelled"}, headers=admin)
    assert (await _wallet(db, user_id)).balance_points == 0


@pytest.mark.asyncio
async def test_cancelling_returns_spent_points_and_the_coupon_use(client: AsyncClient, db: AsyncSession) -> None:
    city, product = await _shop(db)
    coupon = await _make_coupon(db, CouponType.fixed, Decimal("10"), usage_limit=1)
    city_id, product_id, code, coupon_id = city.id, str(product.id), coupon.code, coupon.id
    user_id, headers = await _signed_in(client, db)
    db.add(LoyaltyWallet(user_id=user_id, balance_points=200))
    await db.commit()
    admin = await _admin_headers(client, db)

    await client.post("/api/v1/cart/items", json={"product_id": product_id}, headers=headers)
    order = (
        await client.post(f"{CO}/place", json=_body(city_id, use_loyalty_points=True, coupon_code=code), headers=headers)
    ).json()
    assert order["discount_pkr"] == 1000 + 200 * 100
    await client.patch(f"/api/v1/admin/orders/{order['id']}/status", json={"status": "cancelled"}, headers=admin)

    wallet = await _wallet(db, user_id)
    assert wallet.balance_points == 200 and wallet.lifetime_burned == 0 and wallet.lifetime_earned == 0
    assert (await db.get(Coupon, coupon_id, populate_existing=True)).used_count == 0  # type: ignore[union-attr]


# ── Buckets come back when taken out of the cart ──────────────────────────────


@pytest.mark.asyncio
async def test_bucket_removed_from_cart_can_be_edited_and_added_again(client: AsyncClient, db: AsyncSession) -> None:
    base, rose, _ = await _make_builder(db)
    bucket_id, token = await _start(client, base)
    await _edit(client, bucket_id, token, {"op": "add", "component_id": str(rose.id), "qty": 2})
    cart = (await client.post(f"/api/v1/buckets/{bucket_id}/cart?t={token}")).json()
    guest = {"X-Cart-Token": cart["guest_token"]}

    await client.delete(f"/api/v1/cart/items/{cart['items'][0]['id']}", headers=guest)
    assert (await _edit(client, bucket_id, token, {"op": "add", "component_id": str(rose.id)})).status_code == 200
    again = await client.post(f"/api/v1/buckets/{bucket_id}/cart?t={token}", headers=guest)
    assert again.status_code == 201

    await client.delete("/api/v1/cart", headers=guest)  # emptying the cart frees it too
    assert (await _edit(client, bucket_id, token, {"op": "clear"})).status_code == 200


# ── Reviews ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_review_of_unknown_product_is_404_not_500(client: AsyncClient, db: AsyncSession) -> None:
    _, headers = await _signed_in(client, db)
    resp = await client.post("/api/v1/reviews", json={"product_id": str(uuid.uuid4()), "rating": 5}, headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_review_cannot_cite_someone_elses_order_item(client: AsyncClient, db: AsyncSession) -> None:
    city, product = await _shop(db)
    city_id, product_id = city.id, str(product.id)
    _, alice = await _signed_in(client, db)
    _, bob = await _signed_in(client, db)
    await client.post("/api/v1/cart/items", json={"product_id": product_id}, headers=alice)
    item_id = (await client.post(f"{CO}/place", json=_body(city_id), headers=alice)).json()["items"][0]["id"]

    body = {"product_id": product_id, "rating": 1, "order_item_id": item_id}
    assert (await client.post("/api/v1/reviews", json=body, headers=bob)).status_code == 422
    fake = {**body, "order_item_id": str(uuid.uuid4())}
    assert (await client.post("/api/v1/reviews", json=fake, headers=alice)).status_code == 422
    assert (await client.post("/api/v1/reviews", json=body, headers=alice)).status_code == 201


# ── Receipts and input hardening ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_receipt_cannot_reopen_a_paid_order(client: AsyncClient, db: AsyncSession) -> None:
    city, product = await _shop(db)
    city_id, product_id = city.id, product.id
    buyer = await _make_user(db)
    await cart_service.add_item(db, buyer.id, CartItemAdd(product_id=product_id))
    placed = await checkout_service.place_order(db, buyer, _place(city_id, payment_method=PaymentMethod.bank_transfer))
    order = (await db.execute(select(Order).where(Order.id == placed.id))).scalar_one()
    await db.refresh(order, ["payments"])
    order.payments[0].status = PaymentStatus.paid
    order.status = OrderStatus.paid
    await db.flush()

    with pytest.raises(HTTPException) as exc:
        await checkout_service.attach_transfer_proof(db, order, b"img", "r.jpg", "image/jpeg")
    assert exc.value.status_code == 409
    assert order.payments[0].status == PaymentStatus.paid


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "extra",
    [
        {"recipient_phone": "<script>1</script>"},
        {"recipient_phone": "call me"},
        {"landmark": "x" * 1000},
        {"address_line2": "y" * 1000},
    ],
)
async def test_checkout_rejects_junk_fields(client: AsyncClient, db: AsyncSession, extra: dict[str, str]) -> None:
    city, product = await _shop(db)
    city_id, product_id = city.id, str(product.id)
    _, headers = await _signed_in(client, db)
    await client.post("/api/v1/cart/items", json={"product_id": product_id}, headers=headers)
    assert (await client.post(f"{CO}/place", json=_body(city_id, **extra), headers=headers)).status_code == 422


@pytest.mark.asyncio
async def test_saved_address_has_size_and_phone_limits(client: AsyncClient, db: AsyncSession) -> None:
    _, headers = await _signed_in(client, db)
    base = {"recipient_name": "Ammi", "recipient_phone": "0300 1234567", "line1": "House 1", "city_name": "Lahore"}
    assert (await client.post("/api/v1/me/addresses", json=base, headers=headers)).status_code == 201
    huge = {**base, "line1": "x" * 2_000_000}
    assert (await client.post("/api/v1/me/addresses", json=huge, headers=headers)).status_code == 422
    junk = {**base, "recipient_phone": "nope"}
    assert (await client.post("/api/v1/me/addresses", json=junk, headers=headers)).status_code == 422


@pytest.mark.asyncio
async def test_guest_order_still_works_with_varied_phone_styles(client: AsyncClient, db: AsyncSession) -> None:
    city, product = await _shop(db)
    city_id, product_id = city.id, str(product.id)
    cart = (await client.post("/api/v1/cart/items", json={"product_id": product_id})).json()
    body = _body(
        city_id, recipient_phone="(0300) 123-4567", contact_email="g@example.com", contact_phone="+44 7700 900123"
    )
    resp = await client.post(f"{CO}/place", json=body, headers={"X-Cart-Token": cart["guest_token"]})
    assert resp.status_code == 201, resp.text
    assert resp.json()["fulfillments"][0]["recipient_phone"] == "(0300) 123-4567"



@pytest.mark.asyncio
async def test_products_delivered_nowhere_are_not_listed(client: AsyncClient, db: AsyncSession) -> None:
    """Build-your-own parts (a single stem, a wrap) have no cities: they're only sold inside a bucket."""
    city, sold = await _shop(db)
    part = Product(vendor_id=sold.vendor_id, name="Kraft Wrap", slug=f"wrap-{uuid.uuid4().hex[:6]}", base_price_pkr=0)
    db.add(part)
    await db.commit()
    vendor_id, sold_id, part_id = str(sold.vendor_id), str(sold.id), str(part.id)

    listed = (await client.get("/api/v1/products", params={"vendor_id": vendor_id})).json()
    assert [p["id"] for p in listed["items"]] == [sold_id]
    assert part_id not in [p["id"] for p in (await client.get("/api/v1/search", params={"q": "Kraft"})).json()["items"]]
