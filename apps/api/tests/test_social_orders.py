"""Orders staff take from Instagram/WhatsApp chats and hand-sent WhatsApp messages (ADR 0009)."""
import random
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import unquote

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.phone import InvalidPhoneError, normalize_phone
from app.models.order import FulfillmentStatus, OrderMessage, PaymentStatus
from app.models.user import UserRole
from app.repositories.order_repository import OrderRepository
from tests.test_checkout import (
    _TOMORROW,
    _login,
    _make_city,
    _make_product,
    _make_user,
    _make_vendor,
)

# ── Phone normalisation ────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("0300 1234567", "+923001234567"),
        ("0300-123-4567", "+923001234567"),
        ("3001234567", "+923001234567"),
        ("+92 300 1234567", "+923001234567"),
        ("0092 300 1234567", "+923001234567"),
        ("+44 7700 900123", "+447700900123"),
        ("00447700900123", "+447700900123"),
    ],
)
def test_normalize_phone(raw: str, expected: str) -> None:
    assert normalize_phone(raw) == expected


@pytest.mark.parametrize("raw", ["", "12345", "abc", "+1234567890123456"])
def test_normalize_phone_rejects_junk(raw: str) -> None:
    with pytest.raises(InvalidPhoneError):
        normalize_phone(raw)


# ── Helpers ────────────────────────────────────────────────────────────────────


async def _staff_headers(client: AsyncClient, db: AsyncSession) -> dict[str, str]:
    staff = await _make_user(db, role=UserRole.staff)
    return {"Authorization": f"Bearer {await _login(client, staff.email)}"}


async def _catalog(db: AsyncSession) -> tuple[str, str]:
    city = await _make_city(db)
    vendor = await _make_vendor(db, city)
    product = await _make_product(db, vendor, city)
    return str(product.id), str(city.id)


def _body(product_id: str, city_id: str, **extra: object) -> dict[str, Any]:
    # A fresh UK buyer number per order, so duplicate detection never trips across tests.
    buyer = f"+44 7700 {random.randint(100000, 999999)}"
    return {
        "source": "instagram",
        "source_ref": "@sara.uk",
        "campaign": "reel_eid_cakes",
        "buyer_phone": buyer,
        "items": [{"product_id": product_id, "qty": 2, "greeting_message": "Happy birthday Ammi"}],
        "payment_method": "bank_transfer",
        "delivery_city_id": city_id,
        "delivery_date": _TOMORROW,
        "recipient_name": "Ammi Jaan",
        "recipient_phone": "0300 1234567",
        "address_line1": "12 Main Boulevard, Gulberg",
        "gift_from": "Sara (London)",
        **extra,
    }


async def _place(client: AsyncClient, headers: dict[str, str], body: dict[str, Any]) -> dict[str, Any]:
    resp = await client.post("/api/v1/admin/orders/assisted", json=body, headers=headers)
    assert resp.status_code == 201, resp.text
    data: dict[str, Any] = resp.json()
    return data


def _msg(messages: list[dict[str, Any]], kind: str) -> dict[str, Any]:
    return next(m for m in messages if m["kind"] == kind)


# ── Placing ────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_staff_places_order_without_email(client: AsyncClient, db: AsyncSession) -> None:
    headers = await _staff_headers(client, db)
    product_id, city_id = await _catalog(db)

    body = _body(product_id, city_id)
    buyer = normalize_phone(body["buyer_phone"])
    data = await _place(client, headers, body)
    order = data["order"]

    assert order["source"] == "instagram"
    assert order["needs_confirmation"] is True
    assert order["status"] == "pending_payment"
    # Checkout's own pricing: 2 × 750 + 200 delivery.
    assert order["subtotal_pkr"] == 150000
    assert order["total_pkr"] == 170000
    assert order["items"][0]["greeting_message"] == "Happy birthday Ammi"
    assert order["fulfillments"][0]["recipient_phone"] == "+923001234567"

    stored = await OrderRepository(db).get_by_public_token(order["public_token"])
    assert stored is not None
    assert stored.contact_phone == buyer
    assert stored.contact_email is None
    assert stored.source_ref == "@sara.uk"
    assert stored.campaign == "reel_eid_cakes"
    assert stored.created_by_staff_id is not None

    summary = _msg(data["messages"], "order_summary")
    assert summary["due"] is True
    assert summary["url"].startswith(f"https://wa.me/{buyer[1:]}?text=")
    text = unquote(summary["url"].split("text=", 1)[1])
    assert f"/track/{order['public_token']}" in text
    assert "PKR 1,700" in text
    assert "upload your receipt" in text


@pytest.mark.asyncio
async def test_customers_cannot_place_assisted_orders(client: AsyncClient, db: AsyncSession) -> None:
    customer = await _make_user(db)
    headers = {"Authorization": f"Bearer {await _login(client, customer.email)}"}
    product_id, city_id = await _catalog(db)
    resp = await client.post("/api/v1/admin/orders/assisted", json=_body(product_id, city_id), headers=headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_web_source_is_rejected(client: AsyncClient, db: AsyncSession) -> None:
    headers = await _staff_headers(client, db)
    product_id, city_id = await _catalog(db)
    resp = await client.post(
        "/api/v1/admin/orders/assisted", json=_body(product_id, city_id, source="web"), headers=headers
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_surprise_cod_is_refused(client: AsyncClient, db: AsyncSession) -> None:
    headers = await _staff_headers(client, db)
    product_id, city_id = await _catalog(db)
    resp = await client.post(
        "/api/v1/admin/orders/assisted",
        json=_body(product_id, city_id, surprise=True, payment_method="cod"),
        headers=headers,
    )
    assert resp.status_code == 400
    assert "surprise" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_bad_phone_is_422(client: AsyncClient, db: AsyncSession) -> None:
    headers = await _staff_headers(client, db)
    product_id, city_id = await _catalog(db)
    resp = await client.post(
        "/api/v1/admin/orders/assisted", json=_body(product_id, city_id, buyer_phone="call me"), headers=headers
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_duplicate_needs_override(client: AsyncClient, db: AsyncSession) -> None:
    headers = await _staff_headers(client, db)
    product_id, city_id = await _catalog(db)
    first = _body(product_id, city_id)
    await _place(client, headers, first)

    # Same buyer typed differently, same recipient, same day.
    typed_differently = "00" + first["buyer_phone"].replace("+", "").replace(" ", "")
    again = _body(product_id, city_id, buyer_phone=typed_differently, recipient_phone="+923001234567")
    resp = await client.post("/api/v1/admin/orders/assisted", json=again, headers=headers)
    assert resp.status_code == 409

    await _place(client, headers, {**again, "allow_duplicate": True})


@pytest.mark.asyncio
async def test_idempotency_key_returns_same_order(client: AsyncClient, db: AsyncSession) -> None:
    headers = await _staff_headers(client, db)
    product_id, city_id = await _catalog(db)
    keyed = {**headers, "Idempotency-Key": "dm-42-double-click"}
    first = await _place(client, keyed, _body(product_id, city_id))
    second = await _place(client, keyed, _body(product_id, city_id))
    assert first["order"]["id"] == second["order"]["id"]


@pytest.mark.asyncio
async def test_city_rules_still_apply(client: AsyncClient, db: AsyncSession) -> None:
    headers = await _staff_headers(client, db)
    product_id, city_id = await _catalog(db)
    resp = await client.post(
        "/api/v1/admin/orders/assisted",
        json=_body(product_id, city_id, delivery_date=datetime.now(UTC).date().isoformat()),
        headers=headers,
    )
    assert resp.status_code == 422  # checkout's own date check: 24 h lead time, today is too soon


# ── Buyer confirmation ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_buyer_confirms_and_fixes_address(client: AsyncClient, db: AsyncSession) -> None:
    headers = await _staff_headers(client, db)
    product_id, city_id = await _catalog(db)
    token = (await _place(client, headers, _body(product_id, city_id)))["order"]["public_token"]

    resp = await client.post(
        f"/api/v1/orders/by-token/{token}/confirm",
        json={"accept_terms": True, "address_line1": "14 Main Boulevard, Gulberg III", "recipient_phone": "0321 7654321"},
    )
    assert resp.status_code == 200, resp.text
    order = resp.json()
    assert order["needs_confirmation"] is False
    assert order["customer_confirmed_at"] is not None
    assert order["fulfillments"][0]["address_line1"] == "14 Main Boulevard, Gulberg III"
    assert order["fulfillments"][0]["recipient_phone"] == "+923217654321"

    stored = await OrderRepository(db).get_by_public_token(token)
    assert stored is not None
    assert stored.marketing_opt_in_at is None  # unticked by default

    # Confirming again is a no-op, not an edit.
    again = await client.post(
        f"/api/v1/orders/by-token/{token}/confirm", json={"accept_terms": True, "address_line1": "Somewhere else 1"}
    )
    assert again.json()["fulfillments"][0]["address_line1"] == "14 Main Boulevard, Gulberg III"


@pytest.mark.asyncio
async def test_confirm_requires_terms(client: AsyncClient, db: AsyncSession) -> None:
    headers = await _staff_headers(client, db)
    product_id, city_id = await _catalog(db)
    token = (await _place(client, headers, _body(product_id, city_id)))["order"]["public_token"]
    resp = await client.post(f"/api/v1/orders/by-token/{token}/confirm", json={"accept_terms": False})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_confirm_records_marketing_opt_in(client: AsyncClient, db: AsyncSession) -> None:
    headers = await _staff_headers(client, db)
    product_id, city_id = await _catalog(db)
    token = (await _place(client, headers, _body(product_id, city_id)))["order"]["public_token"]
    await client.post(f"/api/v1/orders/by-token/{token}/confirm", json={"accept_terms": True, "marketing_opt_in": True})
    stored = await OrderRepository(db).get_by_public_token(token)
    assert stored is not None and stored.marketing_opt_in_at is not None


@pytest.mark.asyncio
async def test_confirm_after_payment_is_refused(client: AsyncClient, db: AsyncSession) -> None:
    headers = await _staff_headers(client, db)
    product_id, city_id = await _catalog(db)
    order = (await _place(client, headers, _body(product_id, city_id)))["order"]
    await client.post(f"/api/v1/admin/orders/{order['id']}/verify-payment", json={"verified": True}, headers=headers)
    resp = await client.post(f"/api/v1/orders/by-token/{order['public_token']}/confirm", json={"accept_terms": True})
    assert resp.status_code == 409


# ── Hand-sent messages and the queue ───────────────────────────────────────────


async def _queue_kinds(client: AsyncClient, headers: dict[str, str], order_id: str) -> set[str]:
    resp = await client.get("/api/v1/admin/whatsapp/queue", headers=headers)
    assert resp.status_code == 200
    return {e["message"]["kind"] for e in resp.json() if e["order_id"] == order_id}


@pytest.mark.asyncio
async def test_message_lifecycle(client: AsyncClient, db: AsyncSession) -> None:
    headers = await _staff_headers(client, db)
    product_id, city_id = await _catalog(db)
    order = (await _place(client, headers, _body(product_id, city_id)))["order"]
    oid = order["id"]

    assert await _queue_kinds(client, headers, oid) == {"order_summary"}

    sent = await client.post(f"/api/v1/admin/orders/{oid}/whatsapp/order_summary/sent", headers=headers)
    assert sent.status_code == 200 and sent.json()["sent_at"] is not None
    # Marking twice is harmless.
    again = await client.post(f"/api/v1/admin/orders/{oid}/whatsapp/order_summary/sent", headers=headers)
    assert again.json()["sent_at"] == sent.json()["sent_at"]
    assert await _queue_kinds(client, headers, oid) == set()

    # Six hours without a reply → one reminder.
    stored = await OrderRepository(db).get_by_id(order["id"])
    assert stored is not None
    msg = next(m for m in stored.manual_messages if m.kind == "order_summary")
    msg.sent_at = datetime.now(UTC) - timedelta(hours=7)
    await db.flush()
    db.expire(stored)
    assert await _queue_kinds(client, headers, oid) == {"payment_reminder"}
    await client.post(f"/api/v1/admin/orders/{oid}/whatsapp/payment_reminder/sent", headers=headers)

    # Payment verified → "payment received".
    await client.post(f"/api/v1/admin/orders/{oid}/verify-payment", json={"verified": True}, headers=headers)
    assert await _queue_kinds(client, headers, oid) == {"payment_received"}
    await client.post(f"/api/v1/admin/orders/{oid}/whatsapp/payment_received/sent", headers=headers)

    # Delivered straight away → only "delivered" is due, not the earlier steps.
    stored = await OrderRepository(db).get_by_id(order["id"])
    assert stored is not None
    stored.fulfillments[0].status = FulfillmentStatus.delivered
    await db.flush()
    assert await _queue_kinds(client, headers, oid) == {"delivered"}


@pytest.mark.asyncio
async def test_reminder_not_due_once_receipt_uploaded(client: AsyncClient, db: AsyncSession) -> None:
    headers = await _staff_headers(client, db)
    product_id, city_id = await _catalog(db)
    order = (await _place(client, headers, _body(product_id, city_id)))["order"]
    await client.post(f"/api/v1/orders/by-token/{order['public_token']}/confirm", json={"accept_terms": True})

    stored = await OrderRepository(db).get_by_id(order["id"])
    assert stored is not None
    db.add(OrderMessage(order_id=stored.id, kind="order_summary", sent_at=datetime.now(UTC) - timedelta(hours=8)))
    stored.payments[0].status = PaymentStatus.awaiting_verification
    await db.flush()
    db.expire(stored)  # tests share one session; the API would load the order fresh
    assert await _queue_kinds(client, headers, order["id"]) == set()


@pytest.mark.asyncio
async def test_cancelled_orders_leave_the_queue(client: AsyncClient, db: AsyncSession) -> None:
    headers = await _staff_headers(client, db)
    product_id, city_id = await _catalog(db)
    order = (await _place(client, headers, _body(product_id, city_id)))["order"]
    await client.patch(f"/api/v1/admin/orders/{order['id']}/status", json={"status": "cancelled"}, headers=headers)
    assert await _queue_kinds(client, headers, order["id"]) == set()


@pytest.mark.asyncio
async def test_order_messages_endpoint_and_unknown_kind(client: AsyncClient, db: AsyncSession) -> None:
    headers = await _staff_headers(client, db)
    product_id, city_id = await _catalog(db)
    oid = (await _place(client, headers, _body(product_id, city_id)))["order"]["id"]

    resp = await client.get(f"/api/v1/admin/orders/{oid}/whatsapp", headers=headers)
    assert resp.status_code == 200
    assert [m["kind"] for m in resp.json()] == [
        "order_summary", "payment_reminder", "payment_received", "dispatched", "out_for_delivery", "delivered",
    ]
    bad = await client.post(f"/api/v1/admin/orders/{oid}/whatsapp/hello/sent", headers=headers)
    assert bad.status_code == 422


@pytest.mark.asyncio
async def test_admin_order_list_shows_source(client: AsyncClient, db: AsyncSession) -> None:
    headers = await _staff_headers(client, db)
    product_id, city_id = await _catalog(db)
    body = _body(product_id, city_id, source="whatsapp")
    oid = (await _place(client, headers, body))["order"]["id"]
    rows = (await client.get("/api/v1/admin/orders", headers=headers)).json()
    row = next(r for r in rows if r["id"] == oid)
    assert row["source"] == "whatsapp"
    assert row["buyer_phone"] == normalize_phone(body["buyer_phone"])
    assert row["customer_confirmed_at"] is None


# ── Automatic WhatsApp off by default ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_whatsapp_rows_dropped_when_api_disabled(outbox: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    import uuid

    import sqlalchemy as sa

    from app.core.config import get_settings
    from app.workers.notification_tasks import enqueue_fulfillment_update

    monkeypatch.setattr(get_settings(), "whatsapp_api_enabled", False)
    order_id = uuid.uuid4()
    count = await enqueue_fulfillment_update(
        outbox, order_id, uuid.uuid4(), uuid.uuid4(), "dispatched", "Ammi", "buyer@example.com", "+447700900123"
    )
    assert count == 2  # both were wanted…
    channels = (
        await outbox.execute(
            sa.text("SELECT channel FROM notifications_outbox WHERE payload->>'order_id' = :oid"),
            {"oid": str(order_id)},
        )
    ).scalars().all()
    assert list(channels) == ["email"]  # …but only email is queued


# ── Recipient messages by hand while the WhatsApp API is off ───────────────────


@pytest.fixture
def api_off(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "whatsapp_api_enabled", False)


async def _set_fulfillment(db: AsyncSession, order_id: str, status: FulfillmentStatus) -> None:
    stored = await OrderRepository(db).get_by_id(order_id)  # type: ignore[arg-type]
    assert stored is not None
    stored.fulfillments[0].status = status
    await db.flush()
    db.expire(stored)


async def _due(client: AsyncClient, headers: dict[str, str], order_id: str) -> dict[str, dict[str, Any]]:
    resp = await client.get("/api/v1/admin/whatsapp/queue", headers=headers)
    return {e["message"]["kind"]: e for e in resp.json() if e["order_id"] == order_id}


@pytest.mark.asyncio
@pytest.mark.usefixtures("api_off")
async def test_recipient_messages_for_normal_gift(client: AsyncClient, db: AsyncSession) -> None:
    headers = await _staff_headers(client, db)
    product_id, city_id = await _catalog(db)
    order = (await _place(client, headers, _body(product_id, city_id)))["order"]
    oid = order["id"]

    await _set_fulfillment(db, oid, FulfillmentStatus.out_for_delivery)
    due = await _due(client, headers, oid)
    on_way = due["recipient_on_the_way"]
    assert on_way["buyer_phone"] == "+923001234567"  # goes to the recipient
    assert on_way["message"]["to"] == "recipient"
    assert on_way["message"]["url"].startswith("https://wa.me/923001234567?text=")
    text = on_way["message"]["text"]
    assert "Ammi Jaan" in text and "Sara (London)" in text
    assert "PKR" not in text and "/track/" not in text  # no prices or tracking for the recipient

    sent = await client.post(f"/api/v1/admin/orders/{oid}/whatsapp/recipient_on_the_way/sent", headers=headers)
    assert sent.status_code == 200 and sent.json()["sent_at"]

    await _set_fulfillment(db, oid, FulfillmentStatus.delivered)
    delivered = (await _due(client, headers, oid))["recipient_delivered"]["message"]["text"]
    assert "We hope you love your gift from Sara (London)" in delivered
    assert "/thanks/" in delivered


@pytest.mark.asyncio
@pytest.mark.usefixtures("api_off")
async def test_surprise_gets_no_heads_up_only_reveal(client: AsyncClient, db: AsyncSession) -> None:
    headers = await _staff_headers(client, db)
    product_id, city_id = await _catalog(db)
    oid = (await _place(client, headers, _body(product_id, city_id, surprise=True)))["order"]["id"]

    kinds = [m["kind"] for m in (await client.get(f"/api/v1/admin/orders/{oid}/whatsapp", headers=headers)).json()]
    assert "recipient_on_the_way" not in kinds and "recipient_delivered" in kinds

    await _set_fulfillment(db, oid, FulfillmentStatus.out_for_delivery)
    assert "recipient_on_the_way" not in await _due(client, headers, oid)
    bad = await client.post(f"/api/v1/admin/orders/{oid}/whatsapp/recipient_on_the_way/sent", headers=headers)
    assert bad.status_code == 400

    await _set_fulfillment(db, oid, FulfillmentStatus.delivered)
    reveal = (await _due(client, headers, oid))["recipient_delivered"]["message"]["text"]
    assert "Surprise!" in reveal


@pytest.mark.asyncio
async def test_no_manual_recipient_messages_when_api_on(client: AsyncClient, db: AsyncSession) -> None:
    headers = await _staff_headers(client, db)
    product_id, city_id = await _catalog(db)
    oid = (await _place(client, headers, _body(product_id, city_id)))["order"]["id"]
    msgs = (await client.get(f"/api/v1/admin/orders/{oid}/whatsapp", headers=headers)).json()
    assert all(m["to"] == "buyer" for m in msgs)


# ── Urdu versions ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_every_buyer_message_has_an_urdu_version(client: AsyncClient, db: AsyncSession) -> None:
    headers = await _staff_headers(client, db)
    product_id, city_id = await _catalog(db)
    data = await _place(client, headers, _body(product_id, city_id))
    token = data["order"]["public_token"]

    for m in data["messages"]:
        assert m["text_ur"] and m["text_ur"] != m["text"]
        assert m["url_ur"].split("?text=")[0] == m["url"].split("?text=")[0]  # same chat
        assert unquote(m["url_ur"].split("text=", 1)[1]) == m["text_ur"]

    summary = _msg(data["messages"], "order_summary")["text_ur"]
    assert summary.startswith("السلام علیکم!")
    assert f"/track/{token}" in summary  # links, order number and amount stay as-is
    assert "PKR 1,700" in summary and "رسید" in summary
    assert "Ammi Jaan کے لیے" in summary


@pytest.mark.asyncio
@pytest.mark.usefixtures("api_off")
async def test_recipient_messages_in_urdu(client: AsyncClient, db: AsyncSession) -> None:
    headers = await _staff_headers(client, db)
    product_id, city_id = await _catalog(db)
    oid = (await _place(client, headers, _body(product_id, city_id, surprise=True)))["order"]["id"]
    await _set_fulfillment(db, oid, FulfillmentStatus.delivered)

    reveal = (await _due(client, headers, oid))["recipient_delivered"]["message"]["text_ur"]
    assert reveal.startswith("السلام علیکم Ammi Jaan!")
    assert "سرپرائز" in reveal and "Sara (London) کی طرف سے" in reveal
    assert "/thanks/" in reveal and "PKR" not in reveal and "/track/" not in reveal


def test_urdu_recipient_text_without_sender_or_name() -> None:
    from app.services.message_texts_ur import recipient_text_ur

    text = recipient_text_ur(
        "recipient_on_the_way", surprise=False, recipient_name=" ", gift_from=None,
        has_note=False, thanks_url=None, brand="Bouquet Bar",
    )
    assert text.startswith("السلام علیکم! آپ کے کسی چاہنے والے کی طرف سے")
    assert "Bouquet Bar" in text
