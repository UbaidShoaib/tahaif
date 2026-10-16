"""Orders taken in Instagram DMs and WhatsApp chats (ADR 0009).

Staff enter the order through the normal checkout (same prices, city rules,
cutoffs and coupons). The buyer then confirms it on the order link page.
WhatsApp messages are sent by hand: this module writes the text and a wa.me
link, works out which message each order is due, and records what was sent.
"""

import hashlib
import uuid
from datetime import UTC, datetime, timedelta
from urllib.parse import quote

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.phone import InvalidPhoneError, normalize_phone, wa_me_digits
from app.models.order import (
    FulfillmentStatus,
    Order,
    OrderSource,
    OrderStatus,
    PaymentMethod,
    PaymentStatus,
)
from app.models.user import User
from app.repositories.order_repository import OrderRepository
from app.schemas.cart import CartItemAdd
from app.schemas.order import CheckoutPlace, OrderRead
from app.schemas.social_order import (
    AssistedOrderCreate,
    AssistedOrderRead,
    MessageKind,
    OrderConfirm,
    WhatsAppMessageRead,
    WhatsAppQueueEntry,
)
from app.services import cart_service, checkout_service
from app.services.cart_service import CartOwner

# A customer who hasn't confirmed after this long gets one reminder.
REMINDER_AFTER = timedelta(hours=6)
QUEUE_WINDOW = timedelta(days=30)

_LABELS: dict[MessageKind, str] = {
    "order_summary": "Send order summary",
    "payment_reminder": "Payment reminder",
    "payment_received": "Payment received",
    "dispatched": "Dispatched",
    "out_for_delivery": "Out for delivery",
    "delivered": "Delivered",
}

# Furthest delivery step reached → the message for it. Only the latest step is
# due: nobody needs "dispatched" after "delivered".
_STAGE_RANK = {
    FulfillmentStatus.dispatched: 1,
    FulfillmentStatus.out_for_delivery: 2,
    FulfillmentStatus.delivered: 3,
}
_STAGE_KIND: dict[int, MessageKind] = {1: "dispatched", 2: "out_for_delivery", 3: "delivered"}
_CLOSED = frozenset({OrderStatus.cancelled, OrderStatus.refunded})


def _bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def order_ref(order: Order) -> str:
    return str(order.public_token)[:8].upper()


def buyer_phone(order: Order) -> str | None:
    return order.contact_phone or (order.user.phone if order.user else None)


def _is_paid(order: Order) -> bool:
    return bool(order.payments) and order.payments[0].status == PaymentStatus.paid


def _waiting_on_buyer(order: Order) -> bool:
    """Not confirmed yet, or a bank transfer with no receipt uploaded."""
    if order.customer_confirmed_at is None:
        return True
    payment = order.payments[0] if order.payments else None
    return payment is not None and payment.status == PaymentStatus.pending_proof


# ── Placing ────────────────────────────────────────────────────────────────────


async def create_assisted_order(
    db: AsyncSession, staff: User, body: AssistedOrderCreate, idempotency_key: str | None = None
) -> AssistedOrderRead:
    """Place an order on a chat customer's behalf, through the normal checkout."""
    try:
        phone = normalize_phone(body.buyer_phone)
        recipient_phone = normalize_phone(body.recipient_phone)
    except InvalidPhoneError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    # The recipient would be asked to pay for their own surprise.
    if body.surprise and body.payment_method == PaymentMethod.cod:
        raise _bad_request("Cash on delivery isn't possible for a surprise gift; use bank transfer")

    repo = OrderRepository(db)
    hashed_key = hashlib.sha256(idempotency_key.encode()).hexdigest()[:64] if idempotency_key else None
    if hashed_key and (existing := await repo.get_by_idempotency_key(hashed_key)):
        return AssistedOrderRead(order=checkout_service._order_to_read(existing), messages=messages_for(existing))

    if not body.allow_duplicate and await repo.find_duplicate(phone, recipient_phone, body.delivery_date):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This buyer already has an order to this recipient on that date. Check with them, "
            "then place it again with allow_duplicate.",
        )

    # A throwaway guest cart, so pricing and validation are exactly checkout's.
    token: str | None = None
    for item in body.items:
        cart = await cart_service.add_item(
            db,
            CartOwner(guest_token=token),
            CartItemAdd(
                product_id=item.product_id,
                variant_id=item.variant_id,
                qty=item.qty,
                greeting_message=item.greeting_message,
            ),
        )
        token = cart.guest_token

    placed = await checkout_service.place_order(
        db,
        None,
        CheckoutPlace(
            payment_method=body.payment_method,
            delivery_city_id=body.delivery_city_id,
            delivery_date=body.delivery_date,
            recipient_name=body.recipient_name,
            recipient_phone=recipient_phone,
            address_line1=body.address_line1,
            address_line2=body.address_line2,
            landmark=body.landmark,
            notes=body.notes,
            coupon_code=body.coupon_code,
            contact_email=body.buyer_email,
            contact_phone=phone,
            surprise=body.surprise,
            gift_from=body.gift_from,
        ),
        hashed_key,
        guest_token=token,
        require_contact_email=False,
    )

    order = await repo.get_by_id(placed.id)
    assert order is not None
    order.source = body.source
    order.source_ref = body.source_ref
    order.campaign = checkout_service.normalize_campaign(body.campaign)
    order.created_by_staff_id = staff.id
    await db.flush()
    order = await repo.reload(order)
    return AssistedOrderRead(order=checkout_service._order_to_read(order), messages=messages_for(order))


# ── Buyer confirmation (order link page) ───────────────────────────────────────


async def confirm_order(db: AsyncSession, public_token: uuid.UUID, body: OrderConfirm) -> OrderRead:
    """The buyer checks the order, fixes recipient details if needed, and accepts the terms."""
    repo = OrderRepository(db)
    order = await repo.get_by_public_token(public_token)
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    if order.customer_confirmed_at is not None:
        return checkout_service._order_to_read(order)
    if order.status != OrderStatus.pending_payment:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This order can no longer be changed")

    changes: dict[str, str | None] = {}
    if body.recipient_phone is not None:
        try:
            changes["recipient_phone"] = normalize_phone(body.recipient_phone)
        except InvalidPhoneError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    for field in ("recipient_name", "address_line1", "address_line2", "landmark"):
        value = getattr(body, field)
        if value is not None:
            changes[field] = value.strip() or None
    if changes.get("recipient_name") is None and "recipient_name" in changes:
        raise _bad_request("Recipient name can't be empty")
    if changes.get("address_line1") is None and "address_line1" in changes:
        raise _bad_request("Address can't be empty")
    for fulfillment in order.fulfillments:
        for field, value in changes.items():
            setattr(fulfillment, field, value)

    now = datetime.now(UTC)
    order.customer_confirmed_at = now
    if body.marketing_opt_in:
        order.marketing_opt_in_at = now
    await db.flush()
    return checkout_service._order_to_read(await repo.reload(order))


# ── Hand-sent WhatsApp messages ────────────────────────────────────────────────


def _text(order: Order, kind: MessageKind) -> str:
    settings = get_settings()
    brand = settings.brand_name
    link = f"{settings.frontend_url}/track/{order.public_token}"
    ref = order_ref(order)
    recipient = order.fulfillments[0].recipient_name if order.fulfillments else "your loved one"
    total = f"PKR {order.total_pkr / 100:,.0f}"
    if kind == "order_summary":
        lines = [f"Assalam-o-Alaikum! Thank you for ordering from {brand}.", "", f"Order #{ref}"]
        lines += [
            f"• {i.qty} × {i.product.name}" + (f" ({i.variant.name})" if i.variant else "") for i in order.items
        ]
        if order.fulfillments:
            f = order.fulfillments[0]
            lines.append(f"For {f.recipient_name}, {f.delivery_date:%a %d %b}")
        lines += [f"Total: {total}", "", f"Please check the details and confirm here: {link}"]
        if order.payments and order.payments[0].method == PaymentMethod.bank_transfer:
            lines.append("Our bank details are on that page; please upload your receipt there too.")
        return "\n".join(lines)
    if kind == "payment_reminder":
        return (
            f"Hi! Just a reminder about your {brand} order #{ref} for {recipient}. "
            f"It's waiting for your confirmation{' and payment' if not _is_paid(order) else ''}: {link}"
        )
    if kind == "payment_received":
        return f"Payment received for order #{ref}, thank you! We're getting {recipient}'s gift ready. Track it: {link}"
    if kind == "dispatched":
        return f"Your gift for {recipient} (order #{ref}) has left the shop. Track it: {link}"
    if kind == "out_for_delivery":
        return f"Your gift for {recipient} is out for delivery now 🚚 Track it live: {link}"
    return f"Delivered! 🎁 {recipient} has received your gift (order #{ref}). See the delivery photo: {link}"


def _due_kinds(order: Order, now: datetime) -> set[MessageKind]:
    if order.status in _CLOSED:
        return set()
    sent = {m.kind: m.sent_at for m in order.manual_messages}
    due: set[MessageKind] = set()
    if order.source != OrderSource.web and order.status == OrderStatus.pending_payment:
        summary_at = sent.get("order_summary")
        if summary_at is None:
            due.add("order_summary")
        elif "payment_reminder" not in sent and now - summary_at >= REMINDER_AFTER and _waiting_on_buyer(order):
            due.add("payment_reminder")
    if _is_paid(order) and order.payments[0].method != PaymentMethod.cod and "payment_received" not in sent:
        due.add("payment_received")
    stage = max((_STAGE_RANK.get(f.status, 0) for f in order.fulfillments), default=0)
    if stage and _STAGE_KIND[stage] not in sent:
        due.add(_STAGE_KIND[stage])
    return due


def messages_for(order: Order, now: datetime | None = None) -> list[WhatsAppMessageRead]:
    """Every message staff can send for this order, with which are due now."""
    phone = buyer_phone(order)
    if not phone:
        return []
    now = now or datetime.now(UTC)
    due = _due_kinds(order, now)
    sent = {m.kind: m.sent_at for m in order.manual_messages}
    try:
        digits = wa_me_digits(normalize_phone(phone))
    except InvalidPhoneError:
        return []
    out = []
    for kind, label in _LABELS.items():
        text = _text(order, kind)
        out.append(
            WhatsAppMessageRead(
                kind=kind,
                label=label,
                text=text,
                url=f"https://wa.me/{digits}?text={quote(text)}",
                due=kind in due,
                sent_at=sent.get(kind),
            )
        )
    return out


async def order_messages(db: AsyncSession, order_id: uuid.UUID) -> list[WhatsAppMessageRead]:
    order = await OrderRepository(db).get_by_id(order_id)
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    return messages_for(order)


async def mark_sent(db: AsyncSession, staff: User, order_id: uuid.UUID, kind: MessageKind) -> WhatsAppMessageRead:
    """Record that staff sent this message; sending twice is harmless (first send kept)."""
    repo = OrderRepository(db)
    order = await repo.get_by_id(order_id)
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    if await repo.get_message(order_id, kind) is None:
        try:
            async with db.begin_nested():
                await repo.add_message(order_id=order_id, kind=kind, sent_by=staff.id, sent_at=datetime.now(UTC))
        except IntegrityError:
            pass  # a colleague marked it at the same moment
    # The loaded order's message list predates the insert; drop it so reload refetches.
    db.expire(order, ["manual_messages"])
    order = await repo.reload(order)
    return next(m for m in messages_for(order) if m.kind == kind)


async def queue(db: AsyncSession, source: OrderSource | None = None) -> list[WhatsAppQueueEntry]:
    """Messages due across recent open orders, oldest order first."""
    now = datetime.now(UTC)
    orders = await OrderRepository(db).list_open_since(now - QUEUE_WINDOW)
    entries: list[WhatsAppQueueEntry] = []
    for order in reversed(orders):
        if source and order.source != source:
            continue
        phone = buyer_phone(order)
        if not phone:
            continue
        for message in messages_for(order, now):
            if message.due:
                entries.append(
                    WhatsAppQueueEntry(
                        order_id=order.id,
                        order_ref=order_ref(order),
                        source=OrderSource(order.source),
                        buyer_phone=phone,
                        placed_at=order.placed_at,
                        message=message,
                    )
                )
    return entries
