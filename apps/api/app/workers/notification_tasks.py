"""Notification tasks: enqueue order confirmation and delivery-status messages into notifications_outbox."""

import json
import uuid
from datetime import UTC, datetime

import sqlalchemy as sa
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger()

_ORDER_CONFIRM_EMAIL_TEMPLATE = "order_confirmation"
_ORDER_CONFIRM_SMS_TEMPLATE = "order_confirmation_sms"


async def enqueue_order_confirmation(
    db: AsyncSession,
    order_id: uuid.UUID,
    user_email: str,
    user_phone: str | None,
    order_total_pkr: int,
    public_token: uuid.UUID,
) -> None:
    """Insert email (and optional SMS) rows into notifications_outbox."""
    payload = json.dumps({
        "order_id": str(order_id),
        "public_token": str(public_token),
        "total_pkr": order_total_pkr,
    })
    now = datetime.now(UTC)

    rows: list[dict[str, object]] = [
        {
            "id": uuid.uuid4(),
            "channel": "email",
            "to_address": user_email,
            "template": _ORDER_CONFIRM_EMAIL_TEMPLATE,
            "payload": payload,
            "status": "pending",
            "attempts": 0,
            "created_at": now,
        }
    ]

    if user_phone:
        rows.append(
            {
                "id": uuid.uuid4(),
                "channel": "sms",
                "to_address": user_phone,
                "template": _ORDER_CONFIRM_SMS_TEMPLATE,
                "payload": payload,
                "status": "pending",
                "attempts": 0,
                "created_at": now,
            }
        )

    await _insert(db, rows)
    await logger.ainfo("notification_enqueued", order_id=str(order_id), count=len(rows))


# Fulfillment steps worth telling the buyer about. "ready" is an internal
# kitchen step and "pending" is the starting state, so neither sends anything.
FULFILLMENT_UPDATE_TEMPLATE = "fulfillment_update"
NOTIFIABLE_FULFILLMENT_STATUSES: frozenset[str] = frozenset(
    {"preparing", "dispatched", "out_for_delivery", "delivered", "failed"}
)


async def enqueue_fulfillment_update(
    db: AsyncSession,
    order_id: uuid.UUID,
    fulfillment_id: uuid.UUID,
    public_token: uuid.UUID,
    status: str,
    recipient_name: str,
    buyer_email: str | None,
    buyer_phone: str | None,
) -> int:
    """Tell the buyer a fulfillment moved to a new status: email, plus WhatsApp
    when a phone is known (overseas buyers read WhatsApp, not local SMS).

    Returns the number of rows queued; statuses outside
    NOTIFIABLE_FULFILLMENT_STATUSES queue nothing.
    """
    if status not in NOTIFIABLE_FULFILLMENT_STATUSES:
        return 0
    payload = json.dumps({
        "order_id": str(order_id),
        "fulfillment_id": str(fulfillment_id),
        "public_token": str(public_token),
        "status": status,
        "recipient_name": recipient_name,
    })
    now = datetime.now(UTC)
    targets = [("email", buyer_email), ("whatsapp", buyer_phone)]
    rows: list[dict[str, object]] = [
        {
            "id": uuid.uuid4(),
            "channel": channel,
            "to_address": address,
            "template": FULFILLMENT_UPDATE_TEMPLATE,
            "payload": payload,
            "status": "pending",
            "attempts": 0,
            "created_at": now,
        }
        for channel, address in targets
        if address
    ]
    if rows:
        await _insert(db, rows)
        await logger.ainfo(
            "fulfillment_notification_enqueued",
            order_id=str(order_id),
            status=status,
            count=len(rows),
        )
    return len(rows)


async def _insert(db: AsyncSession, rows: list[dict[str, object]]) -> None:
    await db.execute(sa.text("""
        INSERT INTO notifications_outbox (id, channel, to_address, template, payload, status, attempts, created_at)
        VALUES (:id, :channel, :to_address, :template, CAST(:payload AS jsonb), :status, :attempts, :created_at)
    """), rows)
