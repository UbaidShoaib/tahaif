"""Sorting and price filtering of the storefront product list (redesign phase 7)."""
import uuid
from datetime import UTC, date, datetime, time, timedelta

import pytest
from fastapi import HTTPException
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.catalog import ProductCity, Vendor
from app.models.user import UserRole
from app.repositories.catalog_repository import (
    CityRepository,
    ProductRepository,
    VendorRepository,
)
from app.repositories.user_repository import UserRepository
from app.services import catalog_service


async def _vendor_with_products(db: AsyncSession) -> tuple[Vendor, uuid.UUID]:
    """A vendor with three products; returns the vendor and a city id.

    Base prices: Apple 300, Banana 100, Cherry 200 (paisa).
    In the city, Cherry is overridden to 50 and Banana is not delivered
    (Banana is delivered in another city, so it is still in the unfiltered list).
    """
    suffix = uuid.uuid4().hex[:6]
    user = await UserRepository(db).create(
        email=f"list_{suffix}@example.com", password_hash=hash_password("Password1"), role=UserRole.vendor
    )
    city = await CityRepository(db).create(name=f"C{suffix}", slug=f"c-{suffix}", timezone="Asia/Karachi")
    other = await CityRepository(db).create(name=f"O{suffix}", slug=f"o-{suffix}", timezone="Asia/Karachi")
    vendor = await VendorRepository(db).create(
        city_id=city.id, owner_user_id=user.id, name=f"V{suffix}", slug=f"v-{suffix}"
    )
    repo = ProductRepository(db)
    now = datetime.now(UTC)
    created = {}
    for i, (name, price) in enumerate([("Apple", 300), ("Banana", 100), ("Cherry", 200)]):
        p = await repo.create(vendor_id=vendor.id, name=name, slug=f"{name.lower()}-{suffix}", base_price_pkr=price)
        p.created_at = now - timedelta(days=10 - i)  # Cherry is newest
        created[name] = p
    db.add_all(
        [
            ProductCity(product_id=created["Apple"].id, city_id=city.id, delivery_fee_pkr=0, lead_time_hours=24),
            ProductCity(
                product_id=created["Cherry"].id, city_id=city.id, delivery_fee_pkr=0, lead_time_hours=24,
                price_override_pkr=50,
            ),
            ProductCity(
                product_id=created["Banana"].id, city_id=city.id, delivery_fee_pkr=0, lead_time_hours=24,
                is_available=False,
            ),
            ProductCity(product_id=created["Banana"].id, city_id=other.id, delivery_fee_pkr=0, lead_time_hours=24),
        ]
    )
    await db.flush()
    return vendor, city.id


def _names(result: object) -> list[str]:
    return [p.name for p in result.items]  # type: ignore[attr-defined]


@pytest.mark.asyncio
async def test_default_order_is_alphabetical(db: AsyncSession) -> None:
    vendor, _ = await _vendor_with_products(db)
    result = await catalog_service.list_products(db, vendor_id=vendor.id)
    assert _names(result) == ["Apple", "Banana", "Cherry"]


@pytest.mark.asyncio
async def test_sort_by_price(db: AsyncSession) -> None:
    vendor, _ = await _vendor_with_products(db)
    asc = await catalog_service.list_products(db, vendor_id=vendor.id, sort="price_asc")
    desc = await catalog_service.list_products(db, vendor_id=vendor.id, sort="price_desc")
    assert _names(asc) == ["Banana", "Cherry", "Apple"]
    assert _names(desc) == ["Apple", "Cherry", "Banana"]


@pytest.mark.asyncio
async def test_sort_newest_first(db: AsyncSession) -> None:
    vendor, _ = await _vendor_with_products(db)
    result = await catalog_service.list_products(db, vendor_id=vendor.id, sort="newest")
    assert _names(result) == ["Cherry", "Banana", "Apple"]


@pytest.mark.asyncio
async def test_price_filter_uses_base_price_without_city(db: AsyncSession) -> None:
    vendor, _ = await _vendor_with_products(db)
    result = await catalog_service.list_products(db, vendor_id=vendor.id, min_price_pkr=150, max_price_pkr=300)
    assert _names(result) == ["Apple", "Cherry"]
    assert result.total == 2


@pytest.mark.asyncio
async def test_city_price_override_drives_filter_and_sort(db: AsyncSession) -> None:
    vendor, city_id = await _vendor_with_products(db)
    # In the city Cherry costs 50 and Banana isn't delivered.
    cheap = await catalog_service.list_products(db, vendor_id=vendor.id, city_id=city_id, max_price_pkr=100)
    assert _names(cheap) == ["Cherry"]
    by_price = await catalog_service.list_products(db, vendor_id=vendor.id, city_id=city_id, sort="price_asc")
    assert _names(by_price) == ["Cherry", "Apple"]


@pytest.mark.asyncio
async def test_pages_do_not_overlap_when_sorted(db: AsyncSession) -> None:
    vendor, _ = await _vendor_with_products(db)
    first = await catalog_service.list_products(db, vendor_id=vendor.id, sort="price_desc", page=1, page_size=2)
    second = await catalog_service.list_products(db, vendor_id=vendor.id, sort="price_desc", page=2, page_size=2)
    assert first.total == 3
    assert _names(first) + _names(second) == ["Apple", "Cherry", "Banana"]


@pytest.mark.asyncio
async def test_min_greater_than_max_is_rejected(db: AsyncSession) -> None:
    with pytest.raises(HTTPException) as exc:
        await catalog_service.list_products(db, min_price_pkr=500, max_price_pkr=100)
    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_endpoint_accepts_sort_and_price(client: AsyncClient, db: AsyncSession) -> None:
    vendor, _ = await _vendor_with_products(db)
    resp = await client.get(
        "/api/v1/products", params={"vendor_id": str(vendor.id), "sort": "price_asc", "max_price_pkr": 250}
    )
    assert resp.status_code == 200
    assert [p["name"] for p in resp.json()["items"]] == ["Banana", "Cherry"]


@pytest.mark.asyncio
async def test_endpoint_rejects_unknown_sort_and_negative_price(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/products", params={"sort": "cheapest"})).status_code == 422
    assert (await client.get("/api/v1/products", params={"min_price_pkr": -1})).status_code == 422


async def _timed_products(db: AsyncSession) -> uuid.UUID:
    """Three gifts in one Karachi-time city: same-day until 14:00, 24h lead, 72h lead."""
    suffix = uuid.uuid4().hex[:6]
    user = await UserRepository(db).create(
        email=f"due_{suffix}@example.com", password_hash=hash_password("Password1"), role=UserRole.vendor
    )
    city = await CityRepository(db).create(name=f"D{suffix}", slug=f"d-{suffix}", timezone="Asia/Karachi")
    vendor = await VendorRepository(db).create(
        city_id=city.id, owner_user_id=user.id, name=f"W{suffix}", slug=f"w-{suffix}"
    )
    repo = ProductRepository(db)
    for name, lead, cutoff in [("Fast", 24, time(14, 0)), ("Day", 24, None), ("Slow", 72, None)]:
        p = await repo.create(vendor_id=vendor.id, name=name, slug=f"{name.lower()}-{suffix}", base_price_pkr=100)
        db.add(ProductCity(product_id=p.id, city_id=city.id, lead_time_hours=lead, same_day_cutoff=cutoff))
    await db.flush()
    return city.id


@pytest.mark.asyncio
async def test_deliver_on_counts_same_day_cutoff_and_lead_time(db: AsyncSession) -> None:
    city_id = await _timed_products(db)
    now = datetime(2026, 10, 26, 5, 0, tzinfo=UTC)  # 10:00 in Karachi

    async def names(day: date, at: datetime = now) -> list[str]:
        res = await catalog_service.list_products(db, city_id=city_id, deliver_on=day, now=at)
        return _names(res)

    assert await names(date(2026, 10, 26)) == ["Fast"]
    assert await names(date(2026, 10, 27)) == ["Day", "Fast"]
    assert await names(date(2026, 10, 29)) == ["Day", "Fast", "Slow"]
    # After the cutoff nothing arrives today.
    assert await names(date(2026, 10, 26), datetime(2026, 10, 26, 10, 0, tzinfo=UTC)) == []


@pytest.mark.asyncio
async def test_deliver_on_needs_a_city(client: AsyncClient) -> None:
    res = await client.get("/api/v1/products", params={"deliver_on": "2026-10-27"})
    assert res.status_code == 422
