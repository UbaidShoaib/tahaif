"""Guest cart and guest checkout (ADR 0004)."""
import io
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import Cart, Order
from app.repositories.loyalty_repository import LoyaltyRepository
from app.services.cart_service import hash_token
from tests.test_checkout import (
    _TOMORROW,
    _login,
    _make_city,
    _make_product,
    _make_user,
    _make_vendor,
)


async def _catalog(db: AsyncSession) -> tuple[str, str]:
    city = await _make_city(db)
    vendor = await _make_vendor(db, city)
    product = await _make_product(db, vendor, city)
    return str(product.id), str(city.id)


async def _guest_add(client: AsyncClient, product_id: str, token: str | None = None, qty: int = 1) -> dict[str, Any]:
    headers = {"X-Cart-Token": token} if token else {}
    resp = await client.post("/api/v1/cart/items", json={"product_id": product_id, "qty": qty}, headers=headers)
    assert resp.status_code == 201, resp.text
    data: dict[str, Any] = resp.json()
    return data


def _kwargs(mock: AsyncMock) -> dict[str, Any]:
    assert mock.await_args is not None
    return dict(mock.await_args.kwargs)


def _place_body(city_id: str, **extra: object) -> dict[str, Any]:
    return {
        "payment_method": "cod",
        "delivery_city_id": city_id,
        "delivery_date": _TOMORROW,
        "recipient_name": "Ammi Jaan",
        "recipient_phone": "+923001234567",
        "address_line1": "12 Main Boulevard, Gulberg",
        **extra,
    }


# ── Guest cart ─────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_guest_cart_round_trip_with_token(client: AsyncClient, db: AsyncSession) -> None:
    product_id, _ = await _catalog(db)
    first = await _guest_add(client, product_id)
    token = first["guest_token"]

    # Same token → same cart; adding again increases the quantity.
    second = await _guest_add(client, product_id, token)
    assert second["id"] == first["id"]
    assert second["guest_token"] == token
    assert second["item_count"] == 2

    got = (await client.get("/api/v1/cart", headers={"X-Cart-Token": token})).json()
    assert got["item_count"] == 2

    item_id = got["items"][0]["id"]
    patched = await client.patch(f"/api/v1/cart/items/{item_id}", json={"qty": 5}, headers={"X-Cart-Token": token})
    assert patched.json()["item_count"] == 5

    removed = await client.delete(f"/api/v1/cart/items/{item_id}", headers={"X-Cart-Token": token})
    assert removed.json()["item_count"] == 0


@pytest.mark.asyncio
async def test_only_the_token_hash_is_stored(client: AsyncClient, db: AsyncSession) -> None:
    product_id, _ = await _catalog(db)
    token = (await _guest_add(client, product_id))["guest_token"]
    stored = (await db.execute(select(Cart).where(Cart.session_token == hash_token(token)))).scalar_one()
    assert stored.session_token != token
    assert stored.user_id is None
    assert stored.expires_at is not None


@pytest.mark.asyncio
async def test_unknown_token_sees_an_empty_cart_and_cannot_touch_items(client: AsyncClient, db: AsyncSession) -> None:
    product_id, _ = await _catalog(db)
    cart = await _guest_add(client, product_id)
    item_id = cart["items"][0]["id"]
    stranger = {"X-Cart-Token": "not-a-real-token"}

    assert (await client.get("/api/v1/cart", headers=stranger)).json()["item_count"] == 0
    resp = await client.patch(f"/api/v1/cart/items/{item_id}", json={"qty": 3}, headers=stranger)
    assert resp.status_code == 404
    resp = await client.delete(f"/api/v1/cart/items/{item_id}", headers=stranger)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_expired_guest_cart_is_ignored(client: AsyncClient, db: AsyncSession) -> None:
    product_id, _ = await _catalog(db)
    token = (await _guest_add(client, product_id))["guest_token"]
    cart = (await db.execute(select(Cart).where(Cart.session_token == hash_token(token)))).scalar_one()
    cart.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    await db.flush()

    assert (await client.get("/api/v1/cart", headers={"X-Cart-Token": token})).json()["item_count"] == 0


@pytest.mark.asyncio
async def test_signing_in_merges_the_guest_cart(client: AsyncClient, db: AsyncSession) -> None:
    city = await _make_city(db)
    vendor = await _make_vendor(db, city)
    shared = str((await _make_product(db, vendor, city)).id)
    guest_only = str((await _make_product(db, vendor, city)).id)
    user = await _make_user(db)
    bearer = {"Authorization": f"Bearer {await _login(client, user.email)}"}

    # The user already has one of the products; the guest adds both.
    await client.post("/api/v1/cart/items", json={"product_id": shared, "qty": 1}, headers=bearer)
    token = (await _guest_add(client, shared, qty=2))["guest_token"]
    await client.post(
        "/api/v1/cart/items",
        json={"product_id": guest_only, "qty": 1, "greeting_message": "Eid Mubarak"},
        headers={"X-Cart-Token": token},
    )

    merged = (await client.get("/api/v1/cart", headers={**bearer, "X-Cart-Token": token})).json()
    assert merged["guest_token"] is None
    qty = {i["product_id"]: i["qty"] for i in merged["items"]}
    assert qty == {shared: 3, guest_only: 1}
    assert next(i for i in merged["items"] if i["product_id"] == guest_only)["greeting_message"] == "Eid Mubarak"

    # The guest cart is gone.
    gone = await db.execute(select(Cart).where(Cart.session_token == hash_token(token)))
    assert gone.scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_invalid_bearer_is_not_treated_as_a_guest(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/cart", headers={"Authorization": "Bearer expired.or.bad"})
    assert resp.status_code == 401


# ── Guest checkout ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_guest_quote(client: AsyncClient, db: AsyncSession) -> None:
    product_id, city_id = await _catalog(db)
    token = (await _guest_add(client, product_id))["guest_token"]
    resp = await client.post(f"/api/v1/checkout/quote?city_id={city_id}", headers={"X-Cart-Token": token})
    assert resp.status_code == 200
    body = resp.json()
    assert body["subtotal_pkr"] == 75000
    assert body["delivery_pkr"] == 20000
    assert body["currency"] == "PKR"


@pytest.mark.asyncio
async def test_guests_cannot_use_loyalty_points(client: AsyncClient, db: AsyncSession) -> None:
    product_id, city_id = await _catalog(db)
    token = (await _guest_add(client, product_id))["guest_token"]
    resp = await client.post(
        f"/api/v1/checkout/quote?city_id={city_id}&use_loyalty_points=true", headers={"X-Cart-Token": token}
    )
    assert resp.status_code == 400
    assert "Sign in" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_guest_places_an_order_with_contact_details(client: AsyncClient, db: AsyncSession) -> None:
    product_id, city_id = await _catalog(db)
    token = (await _guest_add(client, product_id))["guest_token"]
    with patch("app.workers.notification_tasks.enqueue_order_confirmation", new_callable=AsyncMock) as notify:
        resp = await client.post(
            "/api/v1/checkout/place",
            json=_place_body(city_id, contact_email="buyer@example.co.uk", contact_phone="+447700900123"),
            headers={"X-Cart-Token": token, "Idempotency-Key": str(uuid.uuid4())},
        )
    assert resp.status_code == 201, resp.text
    order = (await db.execute(select(Order).where(Order.public_token == uuid.UUID(resp.json()["public_token"])))).scalar_one()
    assert order.user_id is None
    assert order.contact_email == "buyer@example.co.uk"
    assert order.contact_phone == "+447700900123"

    # Confirmation goes to the guest's email and phone.
    assert _kwargs(notify)["user_email"] == "buyer@example.co.uk"
    assert _kwargs(notify)["user_phone"] == "+447700900123"

    # The guest cart is emptied.
    assert (await client.get("/api/v1/cart", headers={"X-Cart-Token": token})).json()["item_count"] == 0


@pytest.mark.asyncio
async def test_guest_retry_with_same_idempotency_key_returns_the_same_order(client: AsyncClient, db: AsyncSession) -> None:
    product_id, city_id = await _catalog(db)
    token = (await _guest_add(client, product_id))["guest_token"]
    headers = {"X-Cart-Token": token, "Idempotency-Key": str(uuid.uuid4())}
    body = _place_body(city_id, contact_email="buyer@example.com", contact_phone="+923001112233")
    first = await client.post("/api/v1/checkout/place", json=body, headers=headers)
    again = await client.post("/api/v1/checkout/place", json=body, headers=headers)
    assert first.status_code == 201
    assert again.json()["id"] == first.json()["id"]


@pytest.mark.asyncio
async def test_signed_in_orders_keep_no_contact_copy_and_still_earn_points(client: AsyncClient, db: AsyncSession) -> None:
    product_id, city_id = await _catalog(db)
    user = await _make_user(db)
    user_id = user.id
    bearer = {"Authorization": f"Bearer {await _login(client, user.email)}"}
    await client.post("/api/v1/cart/items", json={"product_id": product_id, "qty": 1}, headers=bearer)
    resp = await client.post("/api/v1/checkout/place", json=_place_body(city_id), headers=bearer)
    assert resp.status_code == 201
    order = (await db.execute(select(Order).where(Order.id == uuid.UUID(resp.json()["id"])))).scalar_one()
    assert order.user_id == user_id
    assert order.contact_email is None
    wallet = await LoyaltyRepository(db).get_wallet(user_id)
    assert wallet is not None
    await db.refresh(wallet)
    assert wallet.lifetime_earned > 0


# ── Bank-transfer receipts for guests ─────────────────────────────────────────


async def _guest_bank_order(client: AsyncClient, db: AsyncSession) -> dict[str, Any]:
    product_id, city_id = await _catalog(db)
    token = (await _guest_add(client, product_id))["guest_token"]
    resp = await client.post(
        "/api/v1/checkout/place",
        json=_place_body(city_id, payment_method="bank_transfer", contact_email="g@example.com", contact_phone="+923000000001"),
        headers={"X-Cart-Token": token},
    )
    assert resp.status_code == 201, resp.text
    data: dict[str, Any] = resp.json()
    return data


@pytest.mark.asyncio
async def test_guest_uploads_a_receipt_by_public_token(client: AsyncClient, db: AsyncSession) -> None:
    order = await _guest_bank_order(client, db)
    with patch(
        "app.services.checkout_service.upload_proof", new_callable=AsyncMock, return_value="https://s3/receipt.jpg"
    ) as upload:
        resp = await client.post(
            f"/api/v1/orders/by-token/{order['public_token']}/proof",
            files={"file": ("receipt.jpg", io.BytesIO(b"jpegdata"), "image/jpeg")},
        )
    assert resp.status_code == 200
    assert resp.json() == {"proof_url": "https://s3/receipt.jpg"}
    assert _kwargs(upload)["order_id"] == order["id"]


@pytest.mark.asyncio
async def test_receipt_upload_rejects_unknown_tokens_and_reads_at_most_10mb(client: AsyncClient, db: AsyncSession) -> None:
    missing = await client.post(
        f"/api/v1/orders/by-token/{uuid.uuid4()}/proof",
        files={"file": ("r.jpg", io.BytesIO(b"x"), "image/jpeg")},
    )
    assert missing.status_code == 404

    order = await _guest_bank_order(client, db)
    big = b"0" * (10 * 1024 * 1024 + 50)
    with patch("app.services.checkout_service.upload_proof", new_callable=AsyncMock, return_value="u") as upload:
        await client.post(
            f"/api/v1/orders/by-token/{order['public_token']}/proof",
            files={"file": ("r.jpg", io.BytesIO(big), "image/jpeg")},
        )
    # Only the cap + 1 byte is read, so upload_proof can reject it without the rest in memory.
    assert len(_kwargs(upload)["data"]) == 10 * 1024 * 1024 + 1
