"""Public trust statistics shown to buyers (diaspora Release A)."""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.order_repository import OrderRepository
from app.schemas.stats import OnTimeStats

WINDOW_DAYS = 90
# Below this, a percentage is noise (1 late out of 3 reads as "67% on time"),
# so no rate is published.
MIN_SAMPLE = 20


async def on_time_stats(
    db: AsyncSession, vendor_id: uuid.UUID | None = None, now: datetime | None = None
) -> OnTimeStats:
    since = (now or datetime.now(UTC)) - timedelta(days=WINDOW_DAYS)
    delivered, on_time = await OrderRepository(db).on_time_counts(since, vendor_id)
    rate = round(on_time * 100 / delivered) if delivered >= MIN_SAMPLE else None
    return OnTimeStats(
        on_time_percent=rate,
        delivered_count=delivered,
        window_days=WINDOW_DAYS,
        min_sample=MIN_SAMPLE,
    )
