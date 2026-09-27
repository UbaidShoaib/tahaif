"""Tests for enqueueing order and delivery-status notifications into the outbox.

notifications_outbox has no ORM model; the `outbox` fixture in conftest builds
it with the migration's column types (including the JSONB payload whose cast
used to break the insert).
"""

import uuid

import pytest
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.workers.notification_tasks import (
    enqueue_fulfillment_update,
    enqueue_order_confirmation,
)
from app.workers.outbox_worker import _render_sms, fulfillment_update_text


async def _rows_for(db: AsyncSession, order_id: uuid.UUID) -> list[sa.Row[tuple[str, str, str, str, int]]]:
    result = await db.execute(
        sa.text(
            "SELECT channel::text AS channel, to_address, status::text AS status, "
            "payload->>'public_token' AS token, (payload->>'total_pkr')::bigint AS total "
            "FROM notifications_outbox WHERE payload->>'order_id' = :oid ORDER BY channel"
        ),
        {"oid": str(order_id)},
    )
    return list(result.all())


@pytest.mark.asyncio
async def test_enqueue_writes_email_row_with_jsonb_payload(outbox: AsyncSession) -> None:
    order_id, token = uuid.uuid4(), uuid.uuid4()

    await enqueue_order_confirmation(
        db=outbox,
        order_id=order_id,
        user_email="buyer@example.com",
        user_phone=None,
        order_total_pkr=535000,
        public_token=token,
    )

    rows = await _rows_for(outbox, order_id)
    assert len(rows) == 1
    row = rows[0]
    assert row.channel == "email"
    assert row.to_address == "buyer@example.com"
    assert row.status == "pending"
    # Payload is stored as real JSONB, so its fields are queryable.
    assert row.token == str(token)
    assert row.total == 535000


@pytest.mark.asyncio
async def test_enqueue_adds_sms_row_when_phone_known(outbox: AsyncSession) -> None:
    order_id = uuid.uuid4()

    await enqueue_order_confirmation(
        db=outbox,
        order_id=order_id,
        user_email="buyer@example.com",
        user_phone="+447700900123",
        order_total_pkr=100,
        public_token=uuid.uuid4(),
    )

    rows = await _rows_for(outbox, order_id)
    assert [r.channel for r in rows] == ["email", "sms"]
    assert rows[1].to_address == "+447700900123"


async def _update_rows(db: AsyncSession, order_id: uuid.UUID) -> list[sa.Row[tuple[str, str, str]]]:
    result = await db.execute(
        sa.text(
            "SELECT channel::text AS channel, to_address, payload->>'status' AS status "
            "FROM notifications_outbox WHERE payload->>'order_id' = :oid "
            "AND template = 'fulfillment_update' ORDER BY channel"
        ),
        {"oid": str(order_id)},
    )
    return list(result.all())


async def _enqueue_update(db: AsyncSession, order_id: uuid.UUID, status: str, phone: str | None) -> int:
    return await enqueue_fulfillment_update(
        db=db,
        order_id=order_id,
        fulfillment_id=uuid.uuid4(),
        public_token=uuid.uuid4(),
        status=status,
        recipient_name="Ammi Jaan",
        buyer_email="ali@example.co.uk",
        buyer_phone=phone,
    )


@pytest.mark.asyncio
async def test_fulfillment_update_queues_email_and_whatsapp(outbox: AsyncSession) -> None:
    order_id = uuid.uuid4()

    queued = await _enqueue_update(outbox, order_id, "out_for_delivery", "+447700900123")

    rows = await _update_rows(outbox, order_id)
    assert queued == 2
    assert [(r.channel, r.to_address) for r in rows] == [
        ("email", "ali@example.co.uk"),
        ("whatsapp", "+447700900123"),
    ]
    assert {r.status for r in rows} == {"out_for_delivery"}


@pytest.mark.asyncio
async def test_fulfillment_update_without_phone_queues_email_only(outbox: AsyncSession) -> None:
    order_id = uuid.uuid4()

    assert await _enqueue_update(outbox, order_id, "delivered", None) == 1
    assert [r.channel for r in await _update_rows(outbox, order_id)] == ["email"]


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["pending", "ready"])
async def test_internal_statuses_queue_nothing(outbox: AsyncSession, status: str) -> None:
    order_id = uuid.uuid4()

    assert await _enqueue_update(outbox, order_id, status, "+447700900123") == 0
    assert await _update_rows(outbox, order_id) == []


@pytest.mark.parametrize("status", ["preparing", "dispatched", "out_for_delivery", "delivered", "failed"])
def test_every_notifiable_status_has_personal_copy(status: str) -> None:
    headline, body = fulfillment_update_text({"status": status, "recipient_name": "Ammi Jaan"})
    assert "Ammi Jaan" in headline
    assert body


def test_whatsapp_text_links_to_tracking() -> None:
    token = uuid.uuid4()
    text = _render_sms(
        "fulfillment_update",
        {"status": "delivered", "recipient_name": "Ammi Jaan", "public_token": str(token)},
    )
    assert "delivered to Ammi Jaan" in text
    assert f"/track/{token}" in text


def test_copy_falls_back_when_recipient_name_missing() -> None:
    headline, _ = fulfillment_update_text({"status": "dispatched", "recipient_name": ""})
    assert "your loved one" in headline


def test_delivered_copy_points_to_photo_when_there_is_one() -> None:
    _, with_photo = fulfillment_update_text({"status": "delivered", "recipient_name": "Ammi", "has_photo": True})
    _, without = fulfillment_update_text({"status": "delivered", "recipient_name": "Ammi"})
    assert "delivery photo" in with_photo
    assert "delivery photo" not in without


# ── Recipient messages ───────────────────────────────────────────────────────

from app.workers.notification_tasks import (  # noqa: E402
    enqueue_recipient_update,
    recipient_template,
)
from app.workers.outbox_worker import recipient_text  # noqa: E402


@pytest.mark.parametrize(
    ("status", "surprise", "expected"),
    [
        ("out_for_delivery", False, "recipient_on_the_way"),
        ("delivered", False, None),
        ("preparing", False, None),
        ("out_for_delivery", True, None),
        ("dispatched", True, None),
        ("delivered", True, "recipient_surprise_reveal"),
    ],
)
def test_recipient_template_rules(status: str, surprise: bool, expected: str | None) -> None:
    assert recipient_template(status, surprise) == expected


def test_recipient_heads_up_names_the_sender_without_prices_or_links() -> None:
    text = recipient_text("recipient_on_the_way", {"recipient_name": "Ammi", "gift_from": "Ali"}, "Tahaif")
    assert text.startswith("Assalam-o-Alaikum Ammi! A gift from Ali is on its way to you today")
    assert "http" not in text
    assert "PKR" not in text


def test_surprise_reveal_mentions_the_card_note_when_there_is_one() -> None:
    with_note = recipient_text(
        "recipient_surprise_reveal", {"recipient_name": "Ammi", "gift_from": "Ali", "has_note": True}, "Tahaif"
    )
    assert "Surprise! The gift you just received is from Ali" in with_note
    assert "Scan the QR code on the card" in with_note


def test_recipient_text_falls_back_when_sender_unknown() -> None:
    text = recipient_text("recipient_on_the_way", {"recipient_name": "", "gift_from": None}, "Tahaif")
    assert text.startswith("Assalam-o-Alaikum! A gift from someone who loves you")


@pytest.mark.asyncio
async def test_recipient_update_queues_one_whatsapp_row(outbox: AsyncSession) -> None:
    order_id = uuid.uuid4()

    queued = await enqueue_recipient_update(
        db=outbox,
        order_id=order_id,
        fulfillment_id=uuid.uuid4(),
        status="out_for_delivery",
        surprise=False,
        recipient_name="Ammi",
        recipient_phone="+923001234567",
        gift_from="Ali",
    )

    result = await outbox.execute(
        sa.text("SELECT channel::text, to_address, template FROM notifications_outbox WHERE payload->>'order_id' = :o"),
        {"o": str(order_id)},
    )
    assert queued == 1
    assert [tuple(r) for r in result.all()] == [("whatsapp", "+923001234567", "recipient_on_the_way")]
