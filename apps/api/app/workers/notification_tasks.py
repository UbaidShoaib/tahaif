"""Notification tasks: enqueue order confirmation messages into notifications_outbox."""

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
    payload = {
        "order_id": str(order_id),
        "public_token": str(public_token),
        "total_pkr": order_total_pkr,
    }
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

    await db.execute(sa.text("""
        INSERT INTO notifications_outbox (id, channel, to_address, template, payload, status, attempts, created_at)
        VALUES (:id, :channel, :to_address, :template, :payload, :status, :attempts, :created_at)
    """), rows)

    await logger.ainfo(
        "notification_enqueued",
        order_id=str(order_id),
        count=len(rows),
    )
