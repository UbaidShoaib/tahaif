"""Back-office orders: search, date range and paging, and the full order page with staff notes."""

import re
import uuid
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import Order, OrderStatus
from app.models.user import User
from app.repositories.order_repository import OrderRepository
from app.repositories.user_repository import UserRepository
from app.schemas.order import (
    AdminFulfillmentRead,
    AdminOrderDetail,
    AdminOrderItemRead,
    AdminOrderPage,
    AdminOrderSummary,
    AdminPaymentRead,
    OrderEvent,
    StaffNoteRead,
)
from app.services import checkout_service, proof_service, social_order_service

# Staff pick dates as they see them in Pakistan, not UTC.
_STAFF_TZ = ZoneInfo("Asia/Karachi")
_CODE = re.compile(r"^#?[0-9a-fA-F]{4,}$")
# A phone search keeps the last 10 digits, so 0300…, +92 300… and 92300… all match.
_PHONE_TAIL = 10
_MIN_PHONE_DIGITS = 4


def _start_of(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=_STAFF_TZ)


def parse_query(q: str | None) -> dict[str, str | None]:
    """Split a free-text search into what it could be: order code, phone digits, name or email."""
    q = (q or "").strip()
    if not q:
        return {"text": None, "digits": None, "token_prefix": None}
    digits = re.sub(r"\D", "", q)
    is_phone = len(digits) >= _MIN_PHONE_DIGITS and re.fullmatch(r"[\d\s+()-]+", q) is not None
    return {
        # A name never looks like a code or a phone, so only search names when it can't be one.
        "text": None if is_phone else q,
        "digits": digits[-_PHONE_TAIL:] if is_phone else None,
        "token_prefix": q.lstrip("#").lower() if _CODE.match(q) else None,
    }


def _summary(o: Order) -> AdminOrderSummary:
    payment = o.payments[0] if o.payments else None
    return AdminOrderSummary(
        id=o.id,
        public_token=o.public_token,
        status=o.status,
        user_id=o.user_id,
        total_pkr=o.total_pkr,
        currency=o.currency,
        placed_at=o.placed_at,
        payment_method=payment.method if payment else None,
        payment_status=payment.status if payment else None,
        proof_url=proof_service.signed_proof_url(payment.proof_url) if payment else None,
        source=o.source,
        buyer_name=(o.user.full_name if o.user else None) or o.gift_from,
        buyer_phone=social_order_service.buyer_phone(o),
        recipients=[f.recipient_name for f in o.fulfillments],
        delivery_date=min((f.delivery_date for f in o.fulfillments), default=None),
        customer_confirmed_at=o.customer_confirmed_at,
    )


async def list_orders(
    db: AsyncSession,
    *,
    status: OrderStatus | None = None,
    q: str | None = None,
    placed_from: date | None = None,
    placed_to: date | None = None,
    offset: int = 0,
    limit: int = 50,
) -> AdminOrderPage:
    """`placed_to` is inclusive: the whole of that day in Pakistan."""
    orders, total = await OrderRepository(db).search_for_admin(
        status=status,
        **parse_query(q),
        placed_from=_start_of(placed_from) if placed_from else None,
        placed_before=_start_of(placed_to + timedelta(days=1)) if placed_to else None,
        offset=offset,
        limit=limit,
    )
    return AdminOrderPage(items=[_summary(o) for o in orders], total=total, offset=offset, limit=limit)


# Hand-sent WhatsApp messages as they read on the timeline.
_MESSAGE_LABELS = {
    "order_summary": "Order summary sent on WhatsApp",
    "payment_reminder": "Payment reminder sent on WhatsApp",
    "payment_received": "Payment receipt sent on WhatsApp",
    "dispatched": "Dispatch message sent on WhatsApp",
    "out_for_delivery": "Out-for-delivery message sent on WhatsApp",
    "delivered": "Delivered message sent on WhatsApp",
}


def _person(user: User | None) -> str | None:
    return (user.full_name or user.email) if user else None


def _timeline(o: Order) -> list[OrderEvent]:
    events = [OrderEvent(at=o.placed_at, label=f"Placed ({o.source})")]
    if o.customer_confirmed_at:
        events.append(OrderEvent(at=o.customer_confirmed_at, label="Buyer confirmed the order"))
    for p in o.payments:
        if p.verified_at:
            events.append(OrderEvent(at=p.verified_at, label=f"Payment {str(p.status).replace('_', ' ')}"))
    for f in o.fulfillments:
        if f.dispatched_at:
            events.append(OrderEvent(at=f.dispatched_at, label=f"Dispatched to {f.recipient_name}"))
        if f.delivered_at:
            who = f" (received by {f.received_by})" if f.received_by else ""
            events.append(OrderEvent(at=f.delivered_at, label=f"Delivered to {f.recipient_name}{who}"))
    for m in o.manual_messages:
        events.append(OrderEvent(at=m.sent_at, label=_MESSAGE_LABELS.get(m.kind, f"{m.kind} sent on WhatsApp")))
    return sorted(events, key=lambda e: e.at)


async def get_order_detail(db: AsyncSession, order_id: uuid.UUID) -> AdminOrderDetail:
    o = await OrderRepository(db).get_for_admin(order_id)
    if not o:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    base = checkout_service._order_to_read(o)
    items_by_id = {i.id: i for i in o.items}
    fulfillments_by_id = {f.id: f for f in o.fulfillments}
    payment = o.payments[0] if o.payments else None
    taken_by = await UserRepository(db).get_by_id(o.created_by_staff_id) if o.created_by_staff_id else None

    return AdminOrderDetail(
        **base.model_dump(exclude={"items", "fulfillments"}),
        items=[
            AdminOrderItemRead(**i.model_dump(), customization=items_by_id[i.id].customization) for i in base.items
        ],
        fulfillments=[
            AdminFulfillmentRead(
                **f.model_dump(),
                address_line2=fulfillments_by_id[f.id].address_line2,
                landmark=fulfillments_by_id[f.id].landmark,
                vendor_phone=fulfillments_by_id[f.id].vendor.contact_phone,
            )
            for f in base.fulfillments
        ],
        user_id=o.user_id,
        buyer_name=_person(o.user) if o.user and o.user.full_name else o.gift_from,
        buyer_email=o.user.email if o.user else o.contact_email,
        buyer_phone=social_order_service.buyer_phone(o),
        buyer_note=o.notes,
        coupon_code=o.coupon_code,
        source_ref=o.source_ref,
        campaign=o.campaign,
        taken_by=_person(taken_by),
        payment=AdminPaymentRead(
            method=payment.method,
            status=payment.status,
            amount_pkr=payment.amount_pkr,
            amount_charged=payment.amount_charged,
            currency=payment.currency,
            proof_url=proof_service.signed_proof_url(payment.proof_url),
            provider_ref=payment.provider_ref,
            verified_at=payment.verified_at,
        ) if payment else None,
        staff_notes=[
            StaffNoteRead(id=n.id, body=n.body, author_name=_person(n.author), created_at=n.created_at)
            for n in o.staff_notes
        ],
        timeline=_timeline(o),
    )


async def add_staff_note(db: AsyncSession, order_id: uuid.UUID, author: User, body: str) -> StaffNoteRead:
    repo = OrderRepository(db)
    if not await repo.get_by_id(order_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    note = await repo.add_staff_note(order_id, author.id, body.strip())
    return StaffNoteRead(id=note.id, body=note.body, author_name=_person(author), created_at=note.created_at)
