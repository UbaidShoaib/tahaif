"""Ordering inside WhatsApp (ADR 0013): the website's checkout as a chat.

The customer picks a city, a gift, an option, a delivery date, writes the card,
gives the recipient's details and chooses how to pay, by tapping buttons and
lists or typing. The order goes through the same cart and checkout as the
website (prices, city availability, cutoffs, stock), with source ``whatsapp``.
Payment and the bank receipt stay on the order link page, as for chat orders
staff enter (ADR 0009).

``handle`` takes one incoming message and returns the replies; the endpoint
sends them once the transaction has committed.
"""

import hashlib
import re
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.phone import InvalidPhoneError, normalize_phone
from app.integrations.whatsapp_cloud import Reply, Row
from app.models.catalog import Product, ProductCity, ProductVariant
from app.models.order import OrderMessage, OrderSource, PaymentMethod
from app.models.whatsapp import WhatsAppConversation, WhatsAppInboundMessage
from app.repositories.catalog_repository import CityRepository, ProductRepository
from app.repositories.order_repository import OrderRepository
from app.schemas.cart import CartItemAdd
from app.schemas.order import CheckoutPlace
from app.services import cart_service, checkout_service, delivery_service
from app.services.cart_service import CartOwner, _unit_price
from app.services.social_order_service import order_ref

# A half-finished order older than this starts again from the top.
SESSION_TTL = timedelta(hours=24)
# After asking for a person (no team number set), the bot stays quiet until the
# chat has been idle this long, so it doesn't talk over staff.
HUMAN_QUIET = timedelta(hours=12)
PAGE_SIZE = 9  # list rows per page; the 10th is "More"
DATE_CHOICES = 10

_RESTART = {"menu", "restart", "start over", "new order", "order", "start"}
_GREETINGS = {"hi", "hello", "hey", "salam", "aoa", "assalam o alaikum", "assalamualaikum", "asalam o alaikum"}
_CANCEL = {"cancel", "stop"}
_HELP = {"help", "agent", "human", "team", "talk to someone", "call me"}
# The website's "Order on WhatsApp" message (apps/web/lib/order-on-whatsapp.ts).
_PRODUCT_LINK = re.compile(r"https?://\S+/p/([\w-]+)")
_SITE_CITY = re.compile(r"^Deliver in: (.+)$", re.MULTILINE)
_SITE_CARD = re.compile(r'^Card message: "(.*)"$', re.MULTILINE | re.DOTALL)
_SITE_REF = re.compile(r"\(ref: ([^)]+)\)")


@dataclass(frozen=True)
class Inbound:
    message_id: str
    phone: str  # digits, as WhatsApp sends them
    profile_name: str | None = None
    text: str | None = None  # what they typed
    choice: str | None = None  # id of the button or list row they tapped
    location: dict[str, Any] | None = None


def parse_webhook(payload: dict[str, Any]) -> list[Inbound]:
    """Customer messages in a Cloud API webhook call. Delivery/read statuses are ignored."""
    out: list[Inbound] = []
    for entry in payload.get("entry") or []:
        for change in entry.get("changes") or []:
            value = change.get("value") or {}
            names = {c.get("wa_id"): (c.get("profile") or {}).get("name") for c in value.get("contacts") or []}
            for m in value.get("messages") or []:
                kind, sender = m.get("type"), m.get("from")
                if not sender or not m.get("id"):
                    continue
                text = choice = None
                location = None
                if kind == "text":
                    text = (m.get("text") or {}).get("body")
                elif kind == "interactive":
                    i = m.get("interactive") or {}
                    choice = (i.get("button_reply") or i.get("list_reply") or {}).get("id")
                elif kind == "button":  # a quick-reply button on a template
                    text = (m.get("button") or {}).get("text")
                elif kind == "location":
                    location = m.get("location") or {}
                out.append(
                    Inbound(
                        message_id=m["id"], phone=sender, profile_name=names.get(sender),
                        text=text, choice=choice, location=location,
                    )
                )
    return out


# ── Helpers ────────────────────────────────────────────────────────────────────


def _pkr(paisa: int) -> str:
    return f"PKR {paisa / 100:,.0f}"


def _norm(text: str | None) -> str:
    return " ".join((text or "").strip().lower().strip("!.?*").split())


def _set(conv: WhatsAppConversation, **values: Any) -> None:
    # A new dict, so SQLAlchemy sees the JSONB change.
    conv.data = {**conv.data, **values}


def _uuid(raw: object) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(raw))
    except ValueError:
        return None


def _picked(msg: Inbound, prefix: str) -> str | None:
    if msg.choice and msg.choice.startswith(prefix + ":"):
        return msg.choice.split(":", 1)[1]
    return None


def _image(product: Product) -> str | None:
    primary = next((img for img in product.images if img.is_primary), None)
    chosen = primary or (product.images[0] if product.images else None)
    # WhatsApp fetches the photo itself, so it must be a public absolute URL.
    return chosen.url if chosen and chosen.url.startswith("https://") else None


def _city_link(product: Product, city_id: uuid.UUID) -> ProductCity | None:
    return next((pc for pc in product.product_cities if pc.city_id == city_id and pc.is_available), None)


def _buyer_phone(conv: WhatsAppConversation) -> str:
    return normalize_phone("+" + conv.phone)


def _hint() -> str:
    return "Type *menu* to start over or *help* to talk to our team."


async def _product(db: AsyncSession, conv: WhatsAppConversation) -> Product | None:
    product_id = _uuid(conv.data.get("product_id"))
    product = await ProductRepository(db).get_by_id(product_id) if product_id else None
    return product if product and product.is_active else None


def _variant(product: Product, conv: WhatsAppConversation) -> ProductVariant | None:
    variant_id = _uuid(conv.data.get("variant_id"))
    return next((v for v in product.variants if v.id == variant_id), None) if variant_id else None


def _paged(rows: list[Row], page: int, more_id: str) -> list[Row]:
    start = page * PAGE_SIZE
    shown = rows[start : start + PAGE_SIZE]
    if len(rows) > start + PAGE_SIZE:
        shown.append(Row(more_id, "More…", "See more choices"))
    return shown


# ── Entry point ────────────────────────────────────────────────────────────────


async def handle(db: AsyncSession, msg: Inbound, now: datetime | None = None) -> list[Reply]:
    """Move one customer's chat forward by one message. Returns the replies to send."""
    now = now or datetime.now(UTC)
    try:
        async with db.begin_nested():
            db.add(WhatsAppInboundMessage(wa_message_id=msg.message_id, phone=msg.phone, received_at=now))
    except IntegrityError:
        return []  # Meta delivered this one before

    await db.execute(insert(WhatsAppConversation).values(
        id=uuid.uuid4(), phone=msg.phone, step="start", data={}, created_at=now, updated_at=now,
    ).on_conflict_do_nothing(index_elements=["phone"]))
    # Locked, so two quick taps from the same person are handled one after the other.
    conv = (
        await db.execute(
            select(WhatsAppConversation)
            .where(WhatsAppConversation.phone == msg.phone)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    if msg.profile_name:
        conv.profile_name = msg.profile_name[:255]

    replies = await _route(db, conv, msg, now)
    conv.updated_at = now
    await db.flush()
    return replies


async def _route(db: AsyncSession, conv: WhatsAppConversation, msg: Inbound, now: datetime) -> list[Reply]:
    said = _norm(msg.text)
    idle = now - conv.updated_at

    if msg.text and (match := _PRODUCT_LINK.search(msg.text)):
        return await _from_website(db, conv, msg.text, match.group(1), now)
    if said in _RESTART or msg.choice == "restart":
        return await _start(db, conv)
    if said in _HELP or msg.choice == "help":
        return _handover(conv)
    if said in _CANCEL:
        conv.step, conv.data = "start", {}
        return [Reply("Okay, I've cancelled that. We won't message you unless you write to us. Type *menu* whenever you'd like to send a gift.")]

    if conv.step == "human":
        if idle < HUMAN_QUIET:
            return []  # the team is answering
        return await _start(db, conv)
    if conv.step not in ("start", "done") and idle > SESSION_TTL:
        return await _start(db, conv, "Welcome back! Let's start a fresh order.")
    if conv.step == "start":
        return await _start(db, conv)
    if conv.step == "done":
        return await _start(db, conv) if said in _GREETINGS else _after_order(conv)

    if page := _picked(msg, "more"):
        _set(conv, page=int(page) if page.isdigit() else 0)
        return await _ask(db, conv, conv.step, now)
    handler = _HANDLERS.get(conv.step)
    if handler is None:
        return await _start(db, conv)
    return await handler(db, conv, msg, now)


async def _start(db: AsyncSession, conv: WhatsAppConversation, intro: str | None = None) -> list[Reply]:
    brand = get_settings().brand_name
    name = f", {conv.profile_name}" if conv.profile_name else ""
    conv.data = {}
    text = intro or (
        f"Assalam-o-Alaikum{name}! Welcome to {brand} 🎁\n"
        "Send cakes, flowers and gifts to your loved ones anywhere in Pakistan, right here on WhatsApp."
    )
    return [Reply(f"{text}\n\n{_hint()}"), *await _ask_city(db, conv)]


def _handover(conv: WhatsAppConversation) -> list[Reply]:
    try:
        team = normalize_phone(get_settings().whatsapp_team_number)
    except InvalidPhoneError:
        team = None
    if team:
        digits = team.lstrip("+")
        return [Reply(f"Our team is happy to help 😊 Message them here: https://wa.me/{digits}\n\nOr carry on with your order below. {_hint()}")]
    conv.step = "human"
    return [Reply("Sure, a member of our team will reply to you here shortly 😊 Type *menu* to go back to ordering yourself.")]


def _after_order(conv: WhatsAppConversation) -> list[Reply]:
    link = conv.data.get("track_link")
    text = "Thank you for your order! 🎁"
    if link:
        text += f"\nTrack it here: {link}"
    return [Reply(text + "\n\nWould you like to send another gift?", buttons=[("restart", "New order"), ("help", "Talk to us")])]


# ── Website "Order on WhatsApp" message ────────────────────────────────────────


async def _from_website(db: AsyncSession, conv: WhatsAppConversation, text: str, slug: str, now: datetime) -> list[Reply]:
    """They tapped "Order on WhatsApp" on a product page: skip what the message already says."""
    product = await ProductRepository(db).get_by_slug(slug)
    if not product or not product.is_active:
        return await _start(db, conv, "Sorry, that gift isn't available any more. Here's what we can deliver:")
    conv.data = {"product_id": str(product.id), "from_website": True}
    if ref := _SITE_REF.search(text):
        _set(conv, campaign=ref.group(1).strip())
    if card := _SITE_CARD.search(text):
        _set(conv, greeting=card.group(1).strip()[:500])
    variant = next((v for v in product.variants if v.is_active and f"({v.name})" in text), None)
    if variant:
        _set(conv, variant_id=str(variant.id))

    greeting = [Reply(f"Assalam-o-Alaikum! Great choice: *{product.name}*{f' ({variant.name})' if variant else ''}. Let's get it delivered.")]
    city_match = _SITE_CITY.search(text)
    available = {pc.city_id for pc in product.product_cities if pc.is_available}
    cities = [c for c in await CityRepository(db).list_active() if c.id in available]
    city = next((c for c in cities if city_match and c.name.lower() == city_match.group(1).strip().lower()), None)
    if city is None:
        return greeting + await _ask_city(db, conv)
    _set(conv, city_id=str(city.id), city_name=city.name)
    if variant is None and any(v.is_active for v in product.variants):
        return greeting + await _ask(db, conv, "variant", now)
    return greeting + await _ask(db, conv, "date", now)


# ── Asking ─────────────────────────────────────────────────────────────────────


async def _ask(db: AsyncSession, conv: WhatsAppConversation, step: str, now: datetime) -> list[Reply]:
    conv.step = step
    if step == "city":
        return await _ask_city(db, conv)
    if step == "product":
        return await _ask_product(db, conv)
    if step == "variant":
        return await _ask_variant(db, conv)
    if step == "date":
        return await _ask_date(db, conv, now)
    if step == "review":
        return await _ask_review(db, conv)
    return [_PROMPTS[step](conv)]


async def _ask_city(db: AsyncSession, conv: WhatsAppConversation) -> list[Reply]:
    conv.step = "city"
    cities = await CityRepository(db).list_active()
    product = await _product(db, conv)
    if product:
        available = {pc.city_id for pc in product.product_cities if pc.is_available}
        cities = [c for c in cities if c.id in available]
    if not cities:
        conv.step, conv.data = "start", {}
        return [Reply("Sorry, we can't deliver that right now. Type *help* to talk to our team.")]
    rows = [Row(f"city:{c.id}", c.name) for c in cities]
    page = int(conv.data.get("page") or 0)
    return [Reply("Which city should we deliver to?", rows=_paged(rows, page, f"more:{page + 1}"), list_button="Choose city")]


async def _ask_product(db: AsyncSession, conv: WhatsAppConversation) -> list[Reply]:
    conv.step = "product"
    city_id = _uuid(conv.data.get("city_id"))
    page = int(conv.data.get("page") or 0)
    products, total = await ProductRepository(db).list(city_id=city_id, page=page + 1, page_size=PAGE_SIZE)
    if not products:
        conv.step = "city"
        return [Reply(f"Sorry, we have no gifts for {conv.data.get('city_name', 'that city')} right now."), *await _ask_city(db, conv)]
    rows = [Row(f"product:{p.id}", p.name, _pkr(p.base_price_pkr)) for p in products]
    if total > (page + 1) * PAGE_SIZE:
        rows.append(Row(f"more:{page + 1}", "More gifts…", "See more"))
    return [
        Reply(
            f"Here are our gifts for {conv.data.get('city_name', 'your city')} 🎁\nPick one, or type its name.",
            rows=rows, list_button="See gifts",
        )
    ]


async def _ask_variant(db: AsyncSession, conv: WhatsAppConversation) -> list[Reply]:
    conv.step = "variant"
    product = await _product(db, conv)
    if product is None:
        return await _ask_product(db, conv)
    rows = [
        Row(f"variant:{v.id}", v.name, _pkr(_unit_price(product, v)))
        for v in product.variants
        if v.is_active and v.has_stock(1)
    ]
    if not rows:
        conv.step = "product"
        return [Reply(f"Sorry, {product.name} is sold out."), *await _ask_product(db, conv)]
    return [Reply(f"Which option of *{product.name}* would you like?", rows=rows[:10], list_button="Choose option")]


async def _ask_date(db: AsyncSession, conv: WhatsAppConversation, now: datetime) -> list[Reply]:
    conv.step = "date"
    product = await _product(db, conv)
    city_id = _uuid(conv.data.get("city_id"))
    pc = _city_link(product, city_id) if product and city_id else None
    if pc is None:
        return await _ask_city(db, conv)
    earliest = delivery_service.get_earliest_delivery_date(pc, now)
    rows = [
        Row(f"date:{d.isoformat()}", f"{d:%a %d %b}", "Earliest possible" if i == 0 else None)
        for i, d in enumerate(earliest + timedelta(days=n) for n in range(DATE_CHOICES))
    ]
    return [Reply("When should it be delivered?", rows=rows, list_button="Choose date")]


async def _ask_review(db: AsyncSession, conv: WhatsAppConversation) -> list[Reply]:
    conv.step = "review"
    d = conv.data
    product = await _product(db, conv)
    city_id = _uuid(d.get("city_id"))
    if product is None or city_id is None:
        return await _start(db, conv, "Sorry, something changed with that gift. Let's start again.")
    variant = _variant(product, conv)

    # A fresh guest cart each time, so the totals are exactly what checkout will charge.
    try:
        cart = await cart_service.add_item(
            db,
            CartOwner(),
            CartItemAdd(
                product_id=product.id,
                variant_id=variant.id if variant else None,
                qty=1,
                greeting_message=d.get("greeting"),
            ),
        )
        method = PaymentMethod(d["payment"])
        quote = await checkout_service.quote(db, None, city_id, payment_method=method, guest_token=cart.guest_token)
    except HTTPException as exc:
        conv.step = "product"
        return [Reply(f"Sorry, {exc.detail}"), *await _ask_product(db, conv)]
    _set(conv, cart_token=cart.guest_token)

    delivery = date.fromisoformat(d["date"])
    lines = [
        "Please check your order:",
        "",
        f"🎁 {product.name}{f' ({variant.name})' if variant else ''}: {_pkr(quote.subtotal_pkr)}",
        f"📅 {delivery:%A %d %B}, {d.get('city_name', '')}",
        f"👤 For {d['recipient_name']}, {d['recipient_phone']}",
        f"🏠 {d['address']}" + (f" (near {d['landmark']})" if d.get("landmark") else ""),
        f'💌 Card: "{d["greeting"]}"' if d.get("greeting") else "💌 No card",
        f"From: {d['gift_from']}" + (" · 🤫 surprise" if d.get("surprise") else ""),
        f"💳 {'Cash on delivery' if method == PaymentMethod.cod else 'Bank transfer'}",
        "",
        f"Gift: {_pkr(quote.subtotal_pkr)}",
        f"Delivery: {_pkr(quote.delivery_pkr)}",
        f"*Total: {_pkr(quote.total_pkr)}*",
    ]
    if await OrderRepository(db).find_duplicate(_buyer_phone(conv), d["recipient_phone"], delivery):
        lines += ["", f"⚠️ You already have an order for {d['recipient_name']} on that day. Only place this one if you want both."]
    site = get_settings().frontend_url
    return [
        Reply("\n".join(lines)),
        Reply(
            f"By placing the order you accept our terms ({site}/terms) and refund policy ({site}/refund).",
            buttons=[("place", "Place order"), ("restart", "Start over")],
        ),
    ]


def _text_prompt(text: str, buttons: list[tuple[str, str]] | None = None) -> Reply:
    return Reply(text, buttons=buttons or [])


def _ask_greeting(conv: WhatsAppConversation) -> Reply:
    if card := conv.data.get("greeting"):
        return _text_prompt(f'Your card will say:\n"{card}"\n\nKeep it, or type a new message.', [("keep", "Keep it"), ("skip", "No card")])
    return _text_prompt("What should the greeting card say? Type your message, or tap *No card*.", [("skip", "No card")])


def _ask_gift_from(conv: WhatsAppConversation) -> Reply:
    name = (conv.profile_name or "").strip()
    buttons = [("from:profile", name)] if name and len(name) <= 20 else []
    return _text_prompt("Who is the gift from? Type the name we should give them (e.g. *Sara from London*).", buttons)


def _ask_payment(conv: WhatsAppConversation) -> Reply:
    buttons = [("pay:bank_transfer", "Bank transfer")]
    note = ""
    if conv.data.get("surprise"):
        # The recipient would be asked to pay for their own surprise.
        note = "\n(Cash on delivery isn't possible for a surprise.)"
    else:
        buttons.append(("pay:cod", "Cash on delivery"))
    return _text_prompt(f"How would you like to pay?{note}", buttons)


_PROMPTS: dict[str, Callable[[WhatsAppConversation], Reply]] = {
    "greeting": _ask_greeting,
    "recipient_name": lambda _c: _text_prompt("What's the recipient's name?"),
    "recipient_phone": lambda _c: _text_prompt("And their phone number? The rider calls it to find them."),
    "address": lambda _c: _text_prompt("What's the full delivery address? Type it, or share a location 📍."),
    "landmark": lambda _c: _text_prompt("Any landmark near the address to help the rider?", [("skip", "Skip")]),
    "surprise": lambda _c: _text_prompt(
        "Should it be a surprise? We won't message the recipient beforehand and the rider won't call ahead.",
        [("surprise:yes", "Yes, surprise"), ("surprise:no", "No")],
    ),
    "gift_from": _ask_gift_from,
    "payment": _ask_payment,
}


# ── Answers ────────────────────────────────────────────────────────────────────


def _again(reason: str, prompt: list[Reply]) -> list[Reply]:
    return [Reply(reason), *prompt]


async def _on_city(db: AsyncSession, conv: WhatsAppConversation, msg: Inbound, now: datetime) -> list[Reply]:
    cities = await CityRepository(db).list_active()
    picked = _uuid(_picked(msg, "city"))
    said = _norm(msg.text)
    city = next((c for c in cities if c.id == picked or (said and c.name.lower().startswith(said))), None)
    if city is None:
        return _again("Please choose a city from the list.", await _ask_city(db, conv))
    _set(conv, city_id=str(city.id), city_name=city.name, page=0)
    product = await _product(db, conv)
    if product is None:
        return await _ask_product(db, conv)
    if _city_link(product, city.id) is None:
        _set(conv, product_id=None, variant_id=None)
        return _again(f"Sorry, {product.name} isn't delivered in {city.name}.", await _ask_product(db, conv))
    if conv.data.get("variant_id") or not any(v.is_active for v in product.variants):
        return await _ask(db, conv, "date", now)
    return await _ask(db, conv, "variant", now)


async def _on_product(db: AsyncSession, conv: WhatsAppConversation, msg: Inbound, now: datetime) -> list[Reply]:
    city_id = _uuid(conv.data.get("city_id"))
    repo = ProductRepository(db)
    product: Product | None = None
    if picked := _uuid(_picked(msg, "product")):
        product = await repo.get_by_id(picked)
    elif said := _norm(msg.text):
        products, _ = await repo.list(city_id=city_id, page=1, page_size=100)
        product = next((p for p in products if said in p.name.lower()), None)
    if product is None or not product.is_active or city_id is None or _city_link(product, city_id) is None:
        return _again("I couldn't find that gift. Please pick one from the list.", await _ask_product(db, conv))
    _set(conv, product_id=str(product.id), variant_id=None, page=0)

    blurb = f"*{product.name}*\nFrom {_pkr(product.base_price_pkr)}"
    if product.description:
        blurb += f"\n\n{product.description[:300]}"
    card = Reply(blurb, image_url=_image(product))
    nxt = "variant" if any(v.is_active for v in product.variants) else "date"
    return [card, *await _ask(db, conv, nxt, now)]


async def _on_variant(db: AsyncSession, conv: WhatsAppConversation, msg: Inbound, now: datetime) -> list[Reply]:
    product = await _product(db, conv)
    if product is None:
        return await _ask_product(db, conv)
    picked = _uuid(_picked(msg, "variant"))
    said = _norm(msg.text)
    variant = next(
        (v for v in product.variants if v.is_active and (v.id == picked or (said and v.name.lower() == said))), None
    )
    if variant is None or not variant.has_stock(1):
        return _again("Please choose an option from the list.", await _ask_variant(db, conv))
    _set(conv, variant_id=str(variant.id))
    return await _ask(db, conv, "date", now)


async def _on_date(db: AsyncSession, conv: WhatsAppConversation, msg: Inbound, now: datetime) -> list[Reply]:
    product = await _product(db, conv)
    city_id = _uuid(conv.data.get("city_id"))
    pc = _city_link(product, city_id) if product and city_id else None
    if product is None or pc is None:
        return await _ask_city(db, conv)
    try:
        chosen = date.fromisoformat(_picked(msg, "date") or "")
        delivery_service.validate_delivery_date(pc, chosen, product.name, now)
    except (ValueError, HTTPException):
        return _again("Please choose a date from the list.", await _ask_date(db, conv, now))
    _set(conv, date=chosen.isoformat())
    return await _ask(db, conv, "greeting", now)


async def _on_greeting(db: AsyncSession, conv: WhatsAppConversation, msg: Inbound, now: datetime) -> list[Reply]:
    if msg.choice == "skip":
        _set(conv, greeting=None)
    elif msg.choice != "keep":
        card = (msg.text or "").strip()
        if not card:
            return [_ask_greeting(conv)]
        if len(card) > 500:
            return _again("That's a bit long for the card; please keep it under 500 characters.", [_ask_greeting(conv)])
        _set(conv, greeting=card)
    return await _ask(db, conv, "recipient_name", now)


async def _on_recipient_name(db: AsyncSession, conv: WhatsAppConversation, msg: Inbound, now: datetime) -> list[Reply]:
    name = " ".join((msg.text or "").split())
    if not 2 <= len(name) <= 255:
        return [_PROMPTS["recipient_name"](conv)]
    _set(conv, recipient_name=name)
    return await _ask(db, conv, "recipient_phone", now)


async def _on_recipient_phone(db: AsyncSession, conv: WhatsAppConversation, msg: Inbound, now: datetime) -> list[Reply]:
    try:
        phone = normalize_phone(msg.text or "")
    except InvalidPhoneError:
        return _again("That doesn't look like a phone number. Please type it like 0300 1234567.", [])
    _set(conv, recipient_phone=phone)
    return await _ask(db, conv, "address", now)


async def _on_address(db: AsyncSession, conv: WhatsAppConversation, msg: Inbound, now: datetime) -> list[Reply]:
    if msg.location is not None:
        loc = msg.location
        lat, lng = loc.get("latitude"), loc.get("longitude")
        pin = f"https://maps.google.com/?q={lat},{lng}" if lat is not None and lng is not None else ""
        named = ", ".join(str(p) for p in (loc.get("name"), loc.get("address")) if p)
        address = f"{named} {pin}".strip() if named else f"Location pin: {pin}"
    else:
        address = " ".join((msg.text or "").split())
    if not 5 <= len(address) <= 500:
        return _again("Please type the full address (house, street, area).", [])
    _set(conv, address=address)
    return await _ask(db, conv, "landmark", now)


async def _on_landmark(db: AsyncSession, conv: WhatsAppConversation, msg: Inbound, now: datetime) -> list[Reply]:
    landmark = None if msg.choice == "skip" else " ".join((msg.text or "").split())[:255] or None
    _set(conv, landmark=landmark)
    return await _ask(db, conv, "surprise", now)


async def _on_surprise(db: AsyncSession, conv: WhatsAppConversation, msg: Inbound, now: datetime) -> list[Reply]:
    answer = _picked(msg, "surprise") or {"yes": "yes", "no": "no"}.get(_norm(msg.text))
    if answer is None:
        return [_PROMPTS["surprise"](conv)]
    _set(conv, surprise=answer == "yes")
    return await _ask(db, conv, "gift_from", now)


async def _on_gift_from(db: AsyncSession, conv: WhatsAppConversation, msg: Inbound, now: datetime) -> list[Reply]:
    name = (conv.profile_name or "") if msg.choice == "from:profile" else " ".join((msg.text or "").split())
    if not name:
        return [_ask_gift_from(conv)]
    _set(conv, gift_from=name[:80])
    return await _ask(db, conv, "payment", now)


async def _on_payment(db: AsyncSession, conv: WhatsAppConversation, msg: Inbound, now: datetime) -> list[Reply]:
    method = _picked(msg, "pay")
    if method not in (PaymentMethod.bank_transfer, PaymentMethod.cod) or (
        method == PaymentMethod.cod and conv.data.get("surprise")
    ):
        return [_ask_payment(conv)]
    _set(conv, payment=method)
    return await _ask(db, conv, "review", now)


async def _on_review(db: AsyncSession, conv: WhatsAppConversation, msg: Inbound, now: datetime) -> list[Reply]:
    if msg.choice != "place":
        return await _ask_review(db, conv)
    d = conv.data
    token = d.get("cart_token")
    if not token:
        return await _ask_review(db, conv)
    key = hashlib.sha256(f"wa-bot:{conv.id}:{token}".encode()).hexdigest()[:64]
    try:
        async with db.begin_nested():
            placed = await checkout_service.place_order(
                db,
                None,
                CheckoutPlace(
                    payment_method=PaymentMethod(d["payment"]),
                    delivery_city_id=uuid.UUID(d["city_id"]),
                    delivery_date=date.fromisoformat(d["date"]),
                    recipient_name=d["recipient_name"],
                    recipient_phone=d["recipient_phone"],
                    address_line1=d["address"],
                    landmark=d.get("landmark"),
                    contact_phone=_buyer_phone(conv),
                    surprise=bool(d.get("surprise")),
                    gift_from=d.get("gift_from"),
                    campaign=d.get("campaign"),
                ),
                key,
                guest_token=token,
                require_contact_email=False,
            )
    except HTTPException as exc:
        # Usually the date's cutoff passed while they were typing, or it sold out.
        if "delivered on" in str(exc.detail):
            return _again(f"Sorry, {exc.detail}", await _ask(db, conv, "date", now))
        return _again(f"Sorry, we couldn't place that: {exc.detail}", await _start(db, conv, "Let's try again."))

    repo = OrderRepository(db)
    order = await repo.get_by_id(placed.id)
    assert order is not None
    name = conv.profile_name or "customer"
    order.source = OrderSource.whatsapp
    order.source_ref = f"WhatsApp bot · {name} · +{conv.phone}"[:255]
    # They saw the full summary and accepted the terms in the chat; that's the
    # confirmation the order link page would otherwise ask for (ADR 0009).
    order.customer_confirmed_at = now
    # The summary went out in the chat, so the staff queue mustn't ask for it again.
    db.add(OrderMessage(order_id=order.id, kind="order_summary", sent_by=None, sent_at=now))
    await db.flush()

    link = f"{get_settings().frontend_url}/track/{order.public_token}"
    conv.step, conv.data, conv.last_order_id = "done", {"track_link": link}, order.id
    lines = [f"✅ Order #{order_ref(order)} placed! Total: *{_pkr(order.total_pkr)}*", ""]
    if d["payment"] == PaymentMethod.bank_transfer:
        lines += [
            "Please pay by bank transfer. Our account details are on your order page; upload the receipt there too:",
            link,
            "",
            "We'll start preparing the gift as soon as the payment is confirmed.",
        ]
    else:
        lines += ["Please pay the rider in cash at delivery.", "", f"Track your order: {link}"]
    lines += ["", "We'll keep you posted here. Thank you! 🎁"]
    return [Reply("\n".join(lines))]


_HANDLERS: dict[str, Callable[[AsyncSession, WhatsAppConversation, Inbound, datetime], Awaitable[list[Reply]]]] = {
    "city": _on_city,
    "product": _on_product,
    "variant": _on_variant,
    "date": _on_date,
    "greeting": _on_greeting,
    "recipient_name": _on_recipient_name,
    "recipient_phone": _on_recipient_phone,
    "address": _on_address,
    "landmark": _on_landmark,
    "surprise": _on_surprise,
    "gift_from": _on_gift_from,
    "payment": _on_payment,
    "review": _on_review,
}
