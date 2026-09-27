"""Outbox drainer: poll notifications_outbox and dispatch via Resend / Twilio.

Run with arq, or call drain_pending() from a scheduled task.
"""

import json
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

import sqlalchemy as sa
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.integrations import resend_client
from app.integrations.twilio_client import send_sms, send_whatsapp
from app.workers.notification_tasks import (
    FULFILLMENT_UPDATE_TEMPLATE,
    RECIPIENT_ON_THE_WAY_TEMPLATE,
    RECIPIENT_SURPRISE_TEMPLATE,
)

if TYPE_CHECKING:
    import uuid

logger = structlog.get_logger()

_MAX_ATTEMPTS = 3
_BATCH = 50


async def drain_pending(db: AsyncSession) -> int:
    """Send up to _BATCH pending outbox rows. Returns the number processed.

    Each row is claimed (FOR UPDATE SKIP LOCKED), sent and committed on its own,
    so a crash or restart mid-batch never re-sends messages that already went
    out, and concurrent drainers never pick the same row.
    """
    processed = 0
    tried: list[uuid.UUID] = []  # retry failures on a later run, not in a tight loop
    while processed < _BATCH:
        row = (
            (
                await db.execute(
                    sa.text("""
            SELECT id, channel, to_address, template, payload
            FROM notifications_outbox
            WHERE status = 'pending' AND attempts < :max_attempts
              AND NOT (id = ANY(CAST(:tried AS uuid[])))
            ORDER BY created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        """),
                    {"max_attempts": _MAX_ATTEMPTS, "tried": tried},
                )
            )
            .mappings()
            .first()
        )
        if row is None:
            break
        row_id: uuid.UUID = row["id"]
        tried.append(row_id)
        channel: str = row["channel"]
        payload: dict[str, Any] = (
            row["payload"]
            if isinstance(row["payload"], dict)
            else json.loads(row["payload"])
        )
        try:
            await _dispatch(channel, row["to_address"], row["template"], payload)
            await db.execute(
                sa.text("""
                UPDATE notifications_outbox
                SET status = 'sent', sent_at = :now, attempts = attempts + 1
                WHERE id = :id
            """),
                {"now": datetime.now(UTC), "id": row_id},
            )
        except Exception as exc:
            await logger.aerror(
                "outbox_dispatch_failed", id=str(row_id), channel=channel, exc=str(exc)
            )
            await db.execute(
                sa.text("""
                UPDATE notifications_outbox
                SET attempts = attempts + 1,
                    last_error = :err,
                    status = CASE WHEN attempts + 1 >= :max THEN 'failed' ELSE status END
                WHERE id = :id
            """),
                {"err": str(exc)[:1000], "max": _MAX_ATTEMPTS, "id": row_id},
            )
        await db.commit()
        processed += 1
    return processed


async def _dispatch(
    channel: str, to_address: str, template: str, payload: dict[str, Any]
) -> None:  # pragma: no cover
    if channel == "email":
        await _send_email(to_address, template, payload)
    elif channel == "sms":
        await send_sms(to_address, _render_sms(template, payload))
    elif channel == "whatsapp":
        await send_whatsapp(to_address, _render_sms(template, payload))


async def _send_email(
    to: str, template: str, payload: dict[str, Any]
) -> None:  # pragma: no cover
    token = payload.get("public_token", "")
    total = payload.get("total_pkr", 0)
    if template == "order_confirmation":
        await resend_client.send_order_confirmation_email(to, str(token), int(total))
    elif template == FULFILLMENT_UPDATE_TEMPLATE:
        headline, body = fulfillment_update_text(payload)
        await resend_client.send_fulfillment_update_email(to, str(token), headline, body)


def _render_sms(template: str, payload: dict[str, Any]) -> str:
    settings = get_settings()
    token = payload.get("public_token", "")
    total = payload.get("total_pkr", 0)
    if template == "order_confirmation_sms":
        pkr = int(total) / 100
        return (
            f"{settings.brand_name}: Your order #{str(token)[:8]} of PKR {pkr:,.0f} has been placed. "
            f"Track it at {settings.frontend_url}/track/{token}"
        )
    if template == FULFILLMENT_UPDATE_TEMPLATE:
        headline, body = fulfillment_update_text(payload)
        return (
            f"{settings.brand_name}: {headline}\n{body}\n"
            f"Track it live: {settings.frontend_url}/track/{token}"
        )
    if template in (RECIPIENT_ON_THE_WAY_TEMPLATE, RECIPIENT_SURPRISE_TEMPLATE):
        return recipient_text(template, payload, settings.brand_name)
    return f"{settings.brand_name} notification: {template}"


def recipient_text(template: str, payload: dict[str, Any], brand_name: str) -> str:
    """WhatsApp text for the person receiving the gift. Warm, no prices or links."""
    name = str(payload.get("recipient_name") or "").strip()
    greeting = f"Assalam-o-Alaikum {name}! " if name else "Assalam-o-Alaikum! "
    sender = str(payload.get("gift_from") or "").strip() or "someone who loves you"
    note = " Scan the QR code on the card to hear a message from them." if payload.get("has_note") else ""
    if template == RECIPIENT_SURPRISE_TEMPLATE:
        return f"{greeting}Surprise! The gift you just received is from {sender}, sent with love through {brand_name}.{note}"
    return (
        f"{greeting}A gift from {sender} is on its way to you today with {brand_name}. "
        "Please keep your phone nearby in case the rider needs directions."
    )


# Warm, reassuring copy: the buyer is usually far away and can't check in person.
_FULFILLMENT_COPY: dict[str, tuple[str, str]] = {
    "preparing": (
        "Your gift for {name} is being prepared",
        "The shop has started preparing your order with care.",
    ),
    "dispatched": (
        "Your gift for {name} is on its way",
        "It has left the shop and is heading to {name}.",
    ),
    "out_for_delivery": (
        "Your gift for {name} is out for delivery",
        "The rider is on the way and will reach {name} soon.",
    ),
    "delivered": (
        "Your gift has been delivered to {name}",
        "It reached {name} safely. Thank you for staying close from afar.",
    ),
    "failed": (
        "We couldn't deliver your gift to {name} yet",
        "Our team will contact you shortly to arrange a new delivery.",
    ),
}


def fulfillment_update_text(payload: dict[str, Any]) -> tuple[str, str]:
    """Headline and body for a fulfillment status update."""
    name = str(payload.get("recipient_name") or "your loved one")
    headline, body = _FULFILLMENT_COPY.get(
        str(payload.get("status")), ("Your order has an update", "Open the tracking page for details.")
    )
    body = body.format(name=name)
    if payload.get("status") == "delivered" and payload.get("has_photo"):
        body += " See the delivery photo on the tracking page."
    return headline.format(name=name), body
