"""Ordering inside WhatsApp through the Cloud API bot (ADR 0013)."""
import hashlib
import hmac
import json
import random
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.integrations import whatsapp_cloud
from app.integrations.whatsapp_cloud import Reply, Row, to_payload
from app.models.catalog import ProductImage, ProductVariant
from app.models.order import OrderMessage, OrderSource, PaymentMethod, PaymentStatus
from app.models.user import UserRole
from app.models.whatsapp import WhatsAppConversation
from app.repositories.order_repository import OrderRepository
from app.services import whatsapp_bot_service as bot
from app.services.whatsapp_bot_service import Inbound
from tests.test_checkout import (
    _login,
    _make_city,
    _make_product,
    _make_user,
    _make_vendor,
)

_SECRET = "test-app-secret"


def _phone() -> str:
    return f"92300{random.randint(1000000, 9999999)}"


class Chat:
    """One customer talking to the bot."""

    def __init__(self, db: AsyncSession, phone: str | None = None, name: str | None = "Sara") -> None:
        self.db, self.phone, self.name = db, phone or _phone(), name

    async def say(self, text: str | None = None, *, tap: str | None = None, **extra: Any) -> list[Reply]:
        msg = Inbound(
            message_id=f"wamid.{uuid.uuid4().hex}", phone=self.phone, profile_name=self.name,
            text=text, choice=tap, **extra,
        )
        return await bot.handle(self.db, msg)

    async def conv(self) -> WhatsAppConversation:
        result = await self.db.execute(select(WhatsAppConversation).where(WhatsAppConversation.phone == self.phone))
        return result.scalar_one()


def _ids(replies: list[Reply]) -> list[str]:
    return [r.id for reply in replies for r in reply.rows] + [b for reply in replies for b, _ in reply.buttons]


def _all_text(replies: list[Reply]) -> str:
    return "\n".join(r.text for r in replies)


async def _catalog(db: AsyncSession) -> tuple[Any, Any]:
    city = await _make_city(db)
    vendor = await _make_vendor(db, city)
    product = await _make_product(db, vendor, city)
    # The session still holds the product from before its city was added; each
    # webhook call gets a fresh session in production.
    await db.refresh(product, ["product_cities"])
    return city, product


async def _to_review(chat: Chat, city: Any, product: Any, *, surprise: bool = False) -> list[Reply]:
    await chat.say("Hi")
    await chat.say(tap=f"city:{city.id}")
    replies = await chat.say(tap=f"product:{product.id}")
    first_date = next(i for i in _ids(replies) if i.startswith("date:"))
    await chat.say(tap=first_date)
    await chat.say("Happy birthday Ammi")
    return await _details(chat, surprise=surprise)


async def _details(chat: Chat, *, surprise: bool = False) -> list[Reply]:
    """From the recipient's name to the review."""
    await chat.say("Ammi Jaan")
    await chat.say("0300 1234567")
    await chat.say("12 Main Boulevard, Gulberg")
    await chat.say(tap="skip")
    await chat.say(tap="surprise:yes" if surprise else "surprise:no")
    await chat.say(tap="from:profile")
    return await chat.say(tap="pay:bank_transfer")


# ── The whole order ────────────────────────────────────────────────────────────


async def test_full_order_in_chat(db: AsyncSession) -> None:
    city, product = await _catalog(db)
    chat = Chat(db)

    welcome = await chat.say("Assalam o alaikum")
    assert "Welcome to" in welcome[0].text and "Sara" in welcome[0].text
    assert any(i.startswith("city:") for i in _ids(welcome))  # other suites' cities may fill page 1

    products = await chat.say(tap=f"city:{city.id}")
    assert f"product:{product.id}" in _ids(products)

    dates = await chat.say(tap=f"product:{product.id}")
    assert product.name in dates[0].text  # the gift's card first
    date_ids = [i for i in _ids(dates) if i.startswith("date:")]
    assert len(date_ids) == bot.DATE_CHOICES

    card = await chat.say(tap=date_ids[0])
    assert "greeting card" in card[0].text
    assert "recipient's name" in (await chat.say("Happy birthday Ammi"))[0].text
    assert "phone number" in (await chat.say("Ammi Jaan"))[0].text
    assert "address" in (await chat.say("0300 1234567"))[0].text
    assert "landmark" in (await chat.say("12 Main Boulevard, Gulberg"))[0].text
    assert "surprise" in (await chat.say("Near the park"))[0].text
    gift_from = await chat.say(tap="surprise:no")
    assert ("from:profile", "Sara") in gift_from[0].buttons
    pay = await chat.say("Sara (London)")
    assert {b for b, _ in pay[0].buttons} == {"pay:bank_transfer", "pay:cod"}

    review = await chat.say(tap="pay:cod")
    summary = review[0].text
    assert "Ammi Jaan" in summary and "+923001234567" in summary and "Near the park" in summary
    assert "Happy birthday Ammi" in summary and "Cash on delivery" in summary
    assert "Total: PKR 950" in summary  # 750 gift + 200 delivery
    assert ("place", "Place order") in review[1].buttons

    done = await chat.say(tap="place")
    assert "placed" in done[0].text and "cash" in done[0].text

    conv = await chat.conv()
    assert conv.step == "done" and conv.last_order_id is not None
    order = await OrderRepository(db).get_by_id(conv.last_order_id)
    assert order is not None
    assert order.source == "whatsapp"
    assert order.contact_phone == f"+{chat.phone}"
    assert order.source_ref is not None and "Sara" in order.source_ref
    assert order.customer_confirmed_at is not None
    assert order.gift_from == "Sara (London)"
    assert order.total_pkr == 95000
    assert order.payments[0].method == PaymentMethod.cod
    f = order.fulfillments[0]
    assert (f.recipient_name, f.recipient_phone, f.landmark) == ("Ammi Jaan", "+923001234567", "Near the park")
    assert order.items[0].greeting_message == "Happy birthday Ammi"
    # The chat sent the summary, so staff aren't asked to send it again.
    assert await OrderRepository(db).get_message(order.id, "order_summary") is not None

    again = await chat.say("thanks")
    assert "Track it here" in again[0].text and ("restart", "New order") in again[0].buttons


async def test_bank_transfer_points_to_the_order_page(db: AsyncSession) -> None:
    city, product = await _catalog(db)
    chat = Chat(db)
    await _to_review(chat, city, product)
    done = await chat.say(tap="place")
    conv = await chat.conv()
    order = await OrderRepository(db).get_by_id(conv.last_order_id)  # type: ignore[arg-type]
    assert order is not None
    assert f"/track/{order.public_token}" in done[0].text
    assert "bank transfer" in done[0].text and "receipt" in done[0].text


async def test_surprise_hides_cash_on_delivery(db: AsyncSession) -> None:
    city, product = await _catalog(db)
    chat = Chat(db)
    await _to_review(chat, city, product, surprise=True)
    conv = await chat.conv()
    conv.step = "payment"
    pay = await chat.say("x")
    assert [b for b, _ in pay[0].buttons] == ["pay:bank_transfer"]
    still = await chat.say(tap="pay:cod")
    assert (await chat.conv()).step == "payment" and "pay" in still[0].text


async def test_variants_are_offered_and_priced(db: AsyncSession) -> None:
    city, product = await _catalog(db)
    big = ProductVariant(product_id=product.id, name="2 kg", price_delta_pkr=50000, stock_qty=None)
    gone = ProductVariant(product_id=product.id, name="5 kg", price_delta_pkr=90000, stock_qty=0)
    db.add_all([big, gone])
    await db.flush()
    await db.refresh(product, ["variants"])
    chat = Chat(db)
    await chat.say("hi")
    await chat.say(tap=f"city:{city.id}")
    options = await chat.say(tap=f"product:{product.id}")
    rows = {r.id: r for reply in options for r in reply.rows}
    assert rows[f"variant:{big.id}"].description == "PKR 1,250"
    assert f"variant:{gone.id}" not in rows  # sold out
    dates = await chat.say("2 KG")
    assert any(i.startswith("date:") for i in _ids(dates))
    assert (await chat.conv()).data["items"] == [{"product_id": str(product.id), "variant_id": str(big.id), "qty": 1}]


# ── Typing instead of tapping, and mistakes ────────────────────────────────────


async def test_typed_city_and_product_names(db: AsyncSession) -> None:
    city, product = await _catalog(db)
    chat = Chat(db)
    await chat.say("hello")
    await chat.say(city.name.lower())
    assert (await chat.conv()).step == "product"
    await chat.say(product.name.split()[-1])  # the unique suffix
    assert (await chat.conv()).step == "date"


async def test_bad_answers_are_asked_again(db: AsyncSession) -> None:
    city, product = await _catalog(db)
    chat = Chat(db)
    await chat.say("hi")
    assert "choose a city" in (await chat.say("Atlantis"))[0].text
    await chat.say(tap=f"city:{city.id}")
    assert "couldn't find" in (await chat.say("nonexistent gift"))[0].text
    await chat.say(tap=f"product:{product.id}")
    assert "choose a date" in (await chat.say("yesterday"))[0].text
    past = (datetime.now(UTC).date() - timedelta(days=1)).isoformat()
    assert "choose a date" in (await chat.say(tap=f"date:{past}"))[0].text


async def test_bad_phone_and_short_address(db: AsyncSession) -> None:
    city, product = await _catalog(db)
    chat = Chat(db)
    await _to_review(chat, city, product)
    conv = await chat.conv()
    conv.step = "recipient_phone"
    assert "doesn't look like a phone" in (await chat.say("call me maybe"))[0].text
    await chat.say("0321 7654321")
    assert "full address" in (await chat.say("abc"))[0].text


async def test_location_pin_as_address(db: AsyncSession) -> None:
    chat = Chat(db)
    await chat.say("hi")
    conv = await chat.conv()
    conv.step = "address"
    await chat.say(location={"latitude": 31.52, "longitude": 74.35, "name": "Liberty Market"})
    data = (await chat.conv()).data
    assert data["address"] == "Liberty Market https://maps.google.com/?q=31.52,74.35"


# ── Commands and housekeeping ──────────────────────────────────────────────────


async def test_menu_restarts_and_cancel_clears(db: AsyncSession) -> None:
    city, product = await _catalog(db)
    chat = Chat(db)
    await _to_review(chat, city, product)
    restarted = await chat.say("Menu")
    assert "Welcome" in restarted[0].text and (await chat.conv()).step == "city"
    cancelled = await chat.say("cancel")
    assert "cancelled" in cancelled[0].text
    conv = await chat.conv()
    assert conv.step == "start" and conv.data == {}


async def test_same_message_twice_is_handled_once(db: AsyncSession) -> None:
    chat = Chat(db)
    msg = Inbound(message_id=f"wamid.{uuid.uuid4().hex}", phone=chat.phone, text="hi")
    assert await bot.handle(db, msg)
    assert await bot.handle(db, msg) == []


async def test_stale_order_starts_over(db: AsyncSession) -> None:
    city, product = await _catalog(db)
    chat = Chat(db)
    await chat.say("hi")
    await chat.say(tap=f"city:{city.id}")
    conv = await chat.conv()
    conv.updated_at = datetime.now(UTC) - bot.SESSION_TTL - timedelta(minutes=1)
    await db.flush()
    replies = await chat.say(tap=f"product:{product.id}")
    assert "Welcome back" in replies[0].text and (await chat.conv()).step == "city"


async def test_help_hands_over_to_the_team(db: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    await _catalog(db)
    chat = Chat(db)
    await chat.say("hi")
    monkeypatch.setattr(get_settings(), "whatsapp_team_number", "0300 7654321")
    linked = await chat.say("help")
    assert "https://wa.me/923007654321" in linked[0].text
    assert (await chat.conv()).step == "city"  # they can carry on

    monkeypatch.setattr(get_settings(), "whatsapp_team_number", "")
    assert "team will reply" in (await chat.say("agent"))[0].text
    assert await chat.say("are you there?") == []  # quiet while staff answer
    assert "Welcome" in (await chat.say("menu"))[0].text


async def test_order_on_whatsapp_message_from_the_website(db: AsyncSession) -> None:
    city, product = await _catalog(db)
    chat = Chat(db)
    text = (
        "Assalam-o-Alaikum! I'd like to order:\n"
        f"• {product.name} — Rs 750\n"
        f"Deliver in: {city.name}\n"
        'Card message: "Eid Mubarak"\n'
        f"https://tahaif.pk/p/{product.slug}\n"
        "(ref: Eid Reel)"
    )
    replies = await chat.say(text)
    assert product.name in replies[0].text
    assert any(i.startswith("date:") for i in _ids(replies))  # city and gift already known
    data = (await chat.conv()).data
    assert data["campaign"] == "Eid Reel" and data["greeting"] == "Eid Mubarak"

    await chat.say(tap=next(i for i in _ids(replies) if i.startswith("date:")))
    assert (await chat.conv()).step == "greeting"
    await chat.say(tap="keep")
    assert (await chat.conv()).data["greeting"] == "Eid Mubarak"


async def test_website_message_without_city_asks_for_one(db: AsyncSession) -> None:
    city, product = await _catalog(db)
    other = await _make_city(db)  # the product isn't delivered here
    replies = await Chat(db).say(f"I'd like this https://tahaif.pk/p/{product.slug}")
    ids = _ids(replies)
    assert f"city:{city.id}" in ids and f"city:{other.id}" not in ids


async def test_campaign_from_website_lands_on_the_order(db: AsyncSession) -> None:
    city, product = await _catalog(db)
    chat = Chat(db)
    dates = await chat.say(f"Deliver in: {city.name}\nhttps://tahaif.pk/p/{product.slug}\n(ref: Eid Reel)")
    await chat.say(tap=next(i for i in _ids(dates) if i.startswith("date:")))
    await chat.say(tap="skip")
    await _details(chat)
    await chat.say(tap="place")
    order = await OrderRepository(db).get_by_id((await chat.conv()).last_order_id)  # type: ignore[arg-type]
    assert order is not None and order.campaign == "eid-reel"


async def test_duplicate_order_is_flagged_in_review(db: AsyncSession) -> None:
    city, product = await _catalog(db)
    chat = Chat(db)
    await _to_review(chat, city, product)
    await chat.say(tap="place")
    review = await _to_review(chat, city, product)
    assert "already have an order" in review[0].text


async def test_bot_orders_never_double_place(db: AsyncSession) -> None:
    city, product = await _catalog(db)
    chat = Chat(db)
    await _to_review(chat, city, product)
    await chat.say(tap="place")
    again = await chat.say(tap="place")  # a second tap on the old button
    assert "Track it here" in again[0].text
    count = (await db.execute(select(OrderMessage).where(OrderMessage.order_id == (await chat.conv()).last_order_id))).all()
    assert len(count) == 1


# ── Webhook payloads and replies ───────────────────────────────────────────────


def _webhook(phone: str, message: dict[str, Any]) -> dict[str, Any]:
    return {
        "object": "whatsapp_business_account",
        "entry": [{"changes": [{"field": "messages", "value": {
            "contacts": [{"wa_id": phone, "profile": {"name": "Sara"}}],
            "messages": [{"from": phone, "id": f"wamid.{uuid.uuid4().hex}", **message}],
        }}]}],
    }


def test_parse_webhook_reads_text_taps_and_locations() -> None:
    text = bot.parse_webhook(_webhook("923001", {"type": "text", "text": {"body": "hi"}}))
    assert text[0].text == "hi" and text[0].profile_name == "Sara"
    tap = bot.parse_webhook(_webhook("923001", {"type": "interactive", "interactive": {
        "type": "list_reply", "list_reply": {"id": "city:x", "title": "Lahore"}}}))
    assert tap[0].choice == "city:x"
    button = bot.parse_webhook(_webhook("923001", {"type": "interactive", "interactive": {
        "type": "button_reply", "button_reply": {"id": "place", "title": "Place order"}}}))
    assert button[0].choice == "place"
    loc = bot.parse_webhook(_webhook("923001", {"type": "location", "location": {"latitude": 1, "longitude": 2}}))
    assert loc[0].location == {"latitude": 1, "longitude": 2}
    statuses = {"entry": [{"changes": [{"value": {"statuses": [{"id": "wamid.1", "status": "read"}]}}]}]}
    assert bot.parse_webhook(statuses) == []


def test_reply_payloads_respect_whatsapp_limits() -> None:
    buttons = to_payload("92300", Reply("Pick", buttons=[("a", "A very long button title here"), ("b", "B"), ("c", "C"), ("d", "D")]))
    action = buttons["interactive"]["action"]
    assert len(action["buttons"]) == 3 and len(action["buttons"][0]["reply"]["title"]) <= 20
    rows = [Row(f"r{i}", "x" * 40, "y" * 100) for i in range(12)]
    listed = to_payload("92300", Reply("Pick", rows=rows, list_button="Choose city"))["interactive"]
    sent_rows = listed["action"]["sections"][0]["rows"]
    assert len(sent_rows) == 10 and len(sent_rows[0]["title"]) <= 24 and len(sent_rows[0]["description"]) <= 72
    image = to_payload("92300", Reply("Cake", image_url="https://cdn.example/cake.jpg"))
    assert image["type"] == "image" and image["image"]["caption"] == "Cake"
    text = to_payload("92300", Reply("z" * 5000))
    assert text["type"] == "text" and len(text["text"]["body"]) == 4096


# ── Webhook endpoint ───────────────────────────────────────────────────────────


@pytest.fixture
def bot_on(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, list[Reply]]]:
    settings = get_settings()
    monkeypatch.setattr(settings, "whatsapp_bot_enabled", True)
    monkeypatch.setattr(settings, "whatsapp_app_secret", _SECRET)
    monkeypatch.setattr(settings, "whatsapp_verify_token", "verify-me")
    sent: list[tuple[str, list[Reply]]] = []

    async def fake_send(to: str, replies: list[Reply]) -> None:
        sent.append((to, replies))

    monkeypatch.setattr(whatsapp_cloud, "send", fake_send)
    return sent


def _signed(payload: dict[str, Any]) -> tuple[bytes, dict[str, str]]:
    body = json.dumps(payload).encode()
    sig = hmac.new(_SECRET.encode(), body, hashlib.sha256).hexdigest()
    return body, {"X-Hub-Signature-256": f"sha256={sig}", "Content-Type": "application/json"}


async def test_webhook_verification(client: AsyncClient, bot_on: Any) -> None:  # noqa: ARG001
    ok = await client.get("/api/v1/whatsapp/webhook", params={
        "hub.mode": "subscribe", "hub.verify_token": "verify-me", "hub.challenge": "12345"})
    assert ok.status_code == 200 and ok.text == "12345"
    bad = await client.get("/api/v1/whatsapp/webhook", params={
        "hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "12345"})
    assert bad.status_code == 403


async def test_webhook_replies_after_a_signed_message(client: AsyncClient, bot_on: list[Any]) -> None:
    phone = _phone()
    body, headers = _signed(_webhook(phone, {"type": "text", "text": {"body": "hi"}}))
    resp = await client.post("/api/v1/whatsapp/webhook", content=body, headers=headers)
    assert resp.status_code == 200
    assert bot_on and bot_on[0][0] == phone and "Welcome" in bot_on[0][1][0].text


async def test_webhook_refuses_unsigned_calls(client: AsyncClient, bot_on: list[Any]) -> None:
    body = json.dumps(_webhook(_phone(), {"type": "text", "text": {"body": "hi"}})).encode()
    resp = await client.post("/api/v1/whatsapp/webhook", content=body, headers={"X-Hub-Signature-256": "sha256=00"})
    assert resp.status_code == 401 and bot_on == []


async def test_webhook_is_off_by_default(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "whatsapp_bot_enabled", False)
    assert (await client.post("/api/v1/whatsapp/webhook", content=b"{}")).status_code == 404
    assert (await client.get("/api/v1/whatsapp/webhook")).status_code == 404


# ── WhatsApp catalog and cart ──────────────────────────────────────────────────


async def _photo(db: AsyncSession, product: Any) -> None:
    db.add(ProductImage(product_id=product.id, url=f"https://cdn.example/{product.slug}.jpg", is_primary=True))
    await db.flush()
    await db.refresh(product, ["images"])


@pytest.fixture
def catalog_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "whatsapp_catalog_id", "1234567890")


async def test_catalog_is_offered_after_the_city(db: AsyncSession, catalog_on: None) -> None:  # noqa: ARG001
    city, product = await _catalog(db)
    await _photo(db, product)
    no_photo = await _make_product(db, await _make_vendor(db, city), city)
    chat = Chat(db)
    await chat.say("hi")
    replies = await chat.say(tap=f"city:{city.id}")
    listed = replies[-1]
    assert str(product.id) in listed.products and str(no_photo.id) not in listed.products
    payload = to_payload(chat.phone, listed)["interactive"]
    assert payload["type"] == "product_list" and payload["action"]["catalog_id"] == "1234567890"


async def test_cart_from_the_catalog_becomes_the_order(db: AsyncSession, catalog_on: None) -> None:  # noqa: ARG001
    city, cake = await _catalog(db)
    flowers = await _make_product(db, await _make_vendor(db, city), city, price=30000)
    await db.refresh(flowers, ["product_cities"])
    chat = Chat(db)
    await chat.say("hi")
    await chat.say(tap=f"city:{city.id}")
    dates = await chat.say(cart=[(str(cake.id), 2), (str(flowers.id), 1)])
    assert "Got your cart" in dates[0].text
    first = next(i for i in _ids(dates) if i.startswith("date:"))
    await chat.say(tap=first)
    await chat.say(tap="skip")
    review = await _details(chat)
    assert f"2 × {cake.name}" in review[0].text and f"1 × {flowers.name}" in review[0].text
    assert "Total: PKR 2,200" in review[0].text  # 2×750 + 300 + 2 shops × 200 delivery
    await chat.say(tap="place")
    order = await OrderRepository(db).get_by_id((await chat.conv()).last_order_id)  # type: ignore[arg-type]
    assert order is not None
    assert sorted(i.qty for i in order.items) == [1, 2] and order.total_pkr == 220000


async def test_cart_before_a_city_asks_where_it_can_go(db: AsyncSession) -> None:
    city, product = await _catalog(db)
    other = await _make_city(db)
    replies = await Chat(db).say(cart=[(str(product.id), 1)])
    ids = _ids(replies)
    assert f"city:{city.id}" in ids and f"city:{other.id}" not in ids


async def test_cart_with_gifts_not_delivered_in_the_city(db: AsyncSession) -> None:
    city, product = await _catalog(db)
    elsewhere, other = await _catalog(db)
    chat = Chat(db)
    await chat.say("hi")
    await chat.say(tap=f"city:{city.id}")
    replies = await chat.say(cart=[(str(product.id), 1), (str(other.id), 1)])
    assert "can't deliver all of that" in _all_text(replies)
    _ = elsewhere


async def test_cart_with_unknown_items(db: AsyncSession) -> None:
    await _catalog(db)
    replies = await Chat(db).say(cart=[(str(uuid.uuid4()), 1)])
    assert "aren't available any more" in replies[0].text


async def test_catalog_feed(client: AsyncClient, db: AsyncSession, bot_on: Any) -> None:  # noqa: ARG001
    city, product = await _catalog(db)
    await _photo(db, product)
    sized = await _make_product(db, await _make_vendor(db, city), city)
    await _photo(db, sized)
    small = ProductVariant(product_id=sized.id, name="1 kg", price_delta_pkr=0, stock_qty=None)
    gone = ProductVariant(product_id=sized.id, name="3 kg", price_delta_pkr=60000, stock_qty=0)
    db.add_all([small, gone])
    await db.flush()
    await db.refresh(sized, ["variants", "product_cities"])
    await db.commit()
    plain = (str(product.id), product.name, product.slug)
    group, group_name, small_id, gone_id = str(sized.id), sized.name, str(small.id), str(gone.id)
    resp = await client.get("/api/v1/whatsapp/catalog.csv")
    assert resp.status_code == 200 and resp.headers["content-type"].startswith("text/csv")
    rows = {r.split(",")[0]: r for r in resp.text.splitlines()}
    assert f"{plain[0]},,{plain[1]}," in rows[plain[0]]
    assert "750.00 PKR" in rows[plain[0]] and f"/p/{plain[2]}" in rows[plain[0]]
    assert group not in rows  # listed by option instead
    assert rows[small_id].startswith(f"{small_id},{group},{group_name} (1 kg),")
    assert "out of stock" in rows[gone_id] and "1350.00 PKR" in rows[gone_id]


# ── Paying by bank transfer in the chat ────────────────────────────────────────


async def _bank_order(db: AsyncSession, chat: Chat) -> Any:
    city, product = await _catalog(db)
    await _to_review(chat, city, product)
    placed = await chat.say(tap="place")
    order = await OrderRepository(db).get_by_id((await chat.conv()).last_order_id)  # type: ignore[arg-type]
    assert order is not None
    return order, placed


async def test_bank_details_are_sent_in_the_chat(db: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "bank_account_name", "Tahaif Gifts, MCB Bank")
    monkeypatch.setattr(get_settings(), "bank_iban", "PK36MUCB0000001234567890")
    _, placed = await _bank_order(db, Chat(db))
    text = placed[0].text
    assert "PK36MUCB0000001234567890" in text and "Tahaif Gifts, MCB Bank" in text
    assert "transfer *PKR 950*" in text and "photo or screenshot" in text


@pytest.fixture
def receipts(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, str]]:
    stored: list[tuple[str, str]] = []

    async def fake_download(media_id: str) -> tuple[bytes, str]:
        return b"jpeg-bytes", "image/jpeg"

    async def fake_upload(order_id: str, filename: str, data: bytes, content_type: str) -> str:
        stored.append((order_id, content_type))
        return f"https://s3.example/proofs/{order_id}/receipt.jpg"

    from app.services import checkout_service

    monkeypatch.setattr(whatsapp_cloud, "download_media", fake_download)
    monkeypatch.setattr(checkout_service, "upload_proof", fake_upload)
    return stored


async def test_receipt_photo_goes_to_the_order(db: AsyncSession, receipts: list[Any]) -> None:
    chat = Chat(db)
    order, _ = await _bank_order(db, chat)
    replies = await chat.say(media={"id": "media-1", "mime_type": "image/jpeg"})
    assert "got your receipt" in replies[0].text
    assert receipts == [(str(order.id), "image/jpeg")]
    payment = (await OrderRepository(db).reload(order)).payments[0]
    assert payment.status == PaymentStatus.awaiting_verification and payment.proof_url


async def test_receipt_without_an_order_waiting(db: AsyncSession, receipts: list[Any]) -> None:
    replies = await Chat(db).say(media={"id": "media-1", "mime_type": "image/jpeg"})
    assert "none of your orders is waiting" in replies[0].text and receipts == []


async def test_receipt_of_the_wrong_kind(db: AsyncSession, receipts: list[Any], monkeypatch: pytest.MonkeyPatch) -> None:  # noqa: ARG001
    chat = Chat(db)
    await _bank_order(db, chat)

    async def gif(media_id: str) -> tuple[bytes, str]:
        return b"gif", "image/gif"

    monkeypatch.setattr(whatsapp_cloud, "download_media", gif)
    replies = await chat.say(media={"id": "media-2"})
    assert "photo (JPG or PNG) or a PDF" in replies[0].text

    async def broken(media_id: str) -> tuple[bytes, str]:
        raise whatsapp_cloud.MediaDownloadError("gone")

    monkeypatch.setattr(whatsapp_cloud, "download_media", broken)
    assert "couldn't open" in (await chat.say(media={"id": "media-3"}))[0].text


def test_parse_webhook_reads_carts_and_photos() -> None:
    cart = bot.parse_webhook(_webhook("923001", {"type": "order", "order": {"catalog_id": "1", "product_items": [
        {"product_retailer_id": "abc", "quantity": 2, "item_price": 750, "currency": "PKR"}]}}))
    assert cart[0].cart == [("abc", 2)]
    photo = bot.parse_webhook(_webhook("923001", {"type": "image", "image": {"id": "m1", "mime_type": "image/jpeg"}}))
    assert photo[0].media == {"id": "m1", "mime_type": "image/jpeg"}


async def test_staff_approval_is_sent_to_the_customer(
    client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    chat = Chat(db)
    order, _ = await _bank_order(db, chat)
    staff = await _make_user(db, role=UserRole.staff)
    await db.commit()
    order_id, email = order.id, staff.email
    notices: list[tuple[Any, ...]] = []

    async def capture(*args: Any) -> None:
        notices.append(args)

    monkeypatch.setattr(bot, "send_payment_notice", capture)
    headers = {"Authorization": f"Bearer {await _login(client, email)}"}
    resp = await client.post(f"/api/v1/admin/orders/{order_id}/verify-payment", json={"verified": True}, headers=headers)
    assert resp.status_code == 200
    (sent_for, to, replies, verified), = notices
    assert (sent_for, to, verified) == (order_id, chat.phone, True)
    assert "Payment received" in replies[0].text

    resp = await client.post(f"/api/v1/admin/orders/{order_id}/verify-payment", json={"verified": False}, headers=headers)
    assert "couldn't confirm the payment" in notices[-1][2][0].text


async def test_no_payment_notice_for_other_orders(db: AsyncSession) -> None:
    order, _ = await _bank_order(db, Chat(db))
    order.source = OrderSource.instagram
    assert bot.payment_notice(order, True) is None


async def test_sent_approval_is_ticked_off_in_the_staff_queue(db: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    from sqlalchemy import NullPool
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from tests.conftest import TEST_DB_URL

    order, _ = await _bank_order(db, Chat(db))
    await db.commit()
    engine = create_async_engine(TEST_DB_URL, poolclass=NullPool)
    monkeypatch.setattr(bot, "AsyncSessionLocal", async_sessionmaker(engine, expire_on_commit=False))
    results = iter([False, True])

    async def fake_send(to: str, replies: list[Reply]) -> bool:
        return next(results)

    monkeypatch.setattr(whatsapp_cloud, "send", fake_send)
    order_id = order.id
    await bot.send_payment_notice(order_id, "92300", [Reply("x")], True)  # refused: outside 24 h
    assert await OrderRepository(db).get_message(order_id, "payment_received") is None
    await bot.send_payment_notice(order_id, "92300", [Reply("x")], True)
    assert await OrderRepository(db).get_message(order_id, "payment_received") is not None
    await engine.dispose()

