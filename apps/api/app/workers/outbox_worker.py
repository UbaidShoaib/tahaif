"""Outbox drainer: poll notifications_outbox and dispatch via Resend / Twilio.

Run with arq, or call drain_pending() from a scheduled task.
"""

import json
import uuid
from datetime import UTC, datetime

import sqlalchemy as sa
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.integrations import resend_client
from app.integrations.twilio_client import send_sms, send_whatsapp

logger = structlog.get_logger()

_MAX_ATTEMPTS = 3
_BATCH = 50


async def drain_pending(db: AsyncSession) -> int:
    """Process up to _BATCH pending outbox rows. Returns number processed."""
    rows = (await db.execute(sa.text("""
        SELECT id, channel, to_address, template, payload, attempts
        FROM notifications_outbox
        WHERE status = 'pending' AND attempts < :max_attempts
        ORDER BY created_at ASC
        LIMIT :batch
        FOR UPDATE SKIP LOCKED
    """), {"max_attempts": _MAX_ATTEMPTS, "batch": _BATCH})).mappings().all()

    processed = 0
    for row in rows:
        row_id: uuid.UUID = row["id"]
        channel: str = row["channel"]
        to_address: str = row["to_address"]
        payload: dict = row["payload"] if isinstance(row["payload"], dict) else json.loads(row["payload"])

        try:
            await _dispatch(channel, to_address, row["template"], payload)
            await db.execute(sa.text("""
                UPDATE notifications_outbox
                SET status = 'sent', sent_at = :now, attempts = attempts + 1
                WHERE id = :id
            """), {"now": datetime.now(UTC), "id": row_id})
        except Exception as exc:
            await logger.aerror("outbox_dispatch_failed", id=str(row_id), channel=channel, exc=str(exc))
            await db.execute(sa.text("""
                UPDATE notifications_outbox
                SET attempts = attempts + 1,
                    last_error = :err,
                    status = CASE WHEN attempts + 1 >= :max THEN 'failed' ELSE status END
                WHERE id = :id
            """), {"err": str(exc), "max": _MAX_ATTEMPTS, "id": row_id})

        processed += 1

    await db.commit()
    return processed


async def _dispatch(channel: str, to_address: str, template: str, payload: dict) -> None:  # pragma: no cover
    if channel == "email":
        await _send_email(to_address, template, payload)
    elif channel == "sms":
        await send_sms(to_address, _render_sms(template, payload))
    elif channel == "whatsapp":
        await send_whatsapp(to_address, _render_sms(template, payload))


async def _send_email(to: str, template: str, payload: dict) -> None:  # pragma: no cover
    token = payload.get("public_token", "")
    total = payload.get("total_pkr", 0)
    if template == "order_confirmation":
        await resend_client.send_order_confirmation_email(to, str(token), int(total))


def _render_sms(template: str, payload: dict) -> str:
    token = payload.get("public_token", "")
    total = payload.get("total_pkr", 0)
    if template == "order_confirmation_sms":
        pkr = int(total) / 100
        return (
            f"Tahaif: Your order #{str(token)[:8]} of PKR {pkr:,.0f} has been placed. "
            f"Track it at tahaif.com/track/{token}"
        )
    return f"Tahaif notification: {template}"
