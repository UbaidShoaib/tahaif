"""Tests for enqueueing order-confirmation notifications into the outbox.

notifications_outbox is created by Alembic migration 0005 and has no ORM model,
so Base.metadata.create_all in conftest does not build it. This module creates
it with the same column types (including the JSONB payload whose cast used to
break the insert) and drops it afterwards.
"""

import uuid
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.workers.notification_tasks import enqueue_order_confirmation

_DDL = [
    "DO $$ BEGIN CREATE TYPE notification_channel AS ENUM ('email','sms','whatsapp'); "
    "EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    "DO $$ BEGIN CREATE TYPE notification_status AS ENUM ('pending','sent','failed'); "
    "EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    """
    CREATE TABLE IF NOT EXISTS notifications_outbox (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        channel notification_channel NOT NULL,
        to_address VARCHAR(255) NOT NULL,
        template VARCHAR(100) NOT NULL,
        payload JSONB NOT NULL,
        status notification_status NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        sent_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
]


@pytest_asyncio.fixture
async def outbox(db: AsyncSession) -> AsyncIterator[AsyncSession]:
    for stmt in _DDL:
        await db.execute(sa.text(stmt))
    await db.commit()
    yield db
    await db.rollback()
    await db.execute(sa.text("DROP TABLE IF EXISTS notifications_outbox"))
    await db.execute(sa.text("DROP TYPE IF EXISTS notification_status"))
    await db.execute(sa.text("DROP TYPE IF EXISTS notification_channel"))
    await db.commit()


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
