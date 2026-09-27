"""On-time delivery rate shown to buyers as a trust signal."""

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.catalog import City, Vendor
from app.models.order import Fulfillment, FulfillmentStatus, Order
from app.services import stats_service
from tests.test_vendor import (
    _make_city,
    _make_order_with_fulfillment,
    _make_product,
    _make_user,
    _make_vendor,
)

NOW = datetime(2026, 9, 28, 12, 0, tzinfo=UTC)


async def _setup(db: AsyncSession) -> tuple[Vendor, Order, City]:
    city = await _make_city(db)  # Asia/Karachi
    vendor = await _make_vendor(db, city)
    product = await _make_product(db, vendor, city)
    buyer = await _make_user(db)
    order, _ = await _make_order_with_fulfillment(db, vendor, product, city, buyer)
    return vendor, order, city


def _leg(order: Order, vendor: Vendor, city: City, due: date, delivered_at: datetime | None,
         status: FulfillmentStatus = FulfillmentStatus.delivered) -> Fulfillment:
    return Fulfillment(
        order_id=order.id, vendor_id=vendor.id, city_id=city.id,
        recipient_name="Ammi", recipient_phone="+923001234567", address_line1="House 5",
        delivery_date=due, status=status, delivered_at=delivered_at,
    )


@pytest.mark.asyncio
async def test_rate_counts_by_the_city_calendar_day(db: AsyncSession) -> None:
    vendor, order, city = await _setup(db)
    due = date(2026, 9, 20)
    # 23:00 PKT on the due date is 18:00 UTC the same day; 01:00 PKT next day is 20:00 UTC on the due date.
    on_time = [_leg(order, vendor, city, due, datetime(2026, 9, 20, 18, 0, tzinfo=UTC)) for _ in range(18)]
    late_in_pakistan = [_leg(order, vendor, city, due, datetime(2026, 9, 20, 20, 0, tzinfo=UTC)) for _ in range(2)]
    db.add_all(on_time + late_in_pakistan)
    await db.flush()

    stats = await stats_service.on_time_stats(db, vendor.id, now=NOW)

    assert stats.delivered_count == 20
    assert stats.on_time_percent == 90


@pytest.mark.asyncio
async def test_no_rate_below_the_minimum_sample(db: AsyncSession) -> None:
    vendor, order, city = await _setup(db)
    db.add_all(
        [_leg(order, vendor, city, date(2026, 9, 20), datetime(2026, 9, 20, 6, tzinfo=UTC)) for _ in range(19)]
    )
    await db.flush()

    stats = await stats_service.on_time_stats(db, vendor.id, now=NOW)

    assert stats.delivered_count == 19
    assert stats.on_time_percent is None


@pytest.mark.asyncio
async def test_ignores_old_and_undelivered_legs_and_other_vendors(db: AsyncSession) -> None:
    vendor, order, city = await _setup(db)
    other = await _make_vendor(db, city)
    old = NOW - timedelta(days=91)
    db.add_all(
        [_leg(order, vendor, city, old.date(), old) for _ in range(25)]
        + [_leg(order, vendor, city, date(2026, 9, 27), None, FulfillmentStatus.out_for_delivery)]
        + [_leg(order, other, city, date(2026, 9, 20), datetime(2026, 9, 20, 6, tzinfo=UTC)) for _ in range(5)]
    )
    await db.flush()

    stats = await stats_service.on_time_stats(db, vendor.id, now=NOW)

    assert stats.delivered_count == 0
    assert stats.on_time_percent is None


@pytest.mark.asyncio
async def test_endpoint_is_public_and_cacheable(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/stats/on-time", params={"vendor_id": str(uuid.uuid4())})

    assert resp.status_code == 200
    assert resp.json() == {"on_time_percent": None, "delivered_count": 0, "window_days": 90, "min_sample": 20}
    assert "max-age=3600" in resp.headers["cache-control"]
