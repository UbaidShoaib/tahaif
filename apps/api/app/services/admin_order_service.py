"""Back-office order list: search, date range and paging for staff."""

import re
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import Order, OrderStatus
from app.repositories.order_repository import OrderRepository
from app.schemas.order import AdminOrderPage, AdminOrderSummary
from app.services import proof_service, social_order_service

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
