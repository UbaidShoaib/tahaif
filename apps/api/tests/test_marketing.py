"""Tests for coupons, banners, and testimonials endpoints."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.loyalty import Banner, Coupon, CouponType, Testimonial
from app.repositories.loyalty_repository import BannerRepository, CouponRepository, TestimonialRepository


# ── Helpers ───────────────────────────────────────────────────────────────────


async def _make_coupon(
    db: AsyncSession,
    code: str = "SAVE10",
    coupon_type: CouponType = CouponType.percent,
    value: Decimal = Decimal("10.00"),
    is_active: bool = True,
    ends_at: datetime | None = None,
    usage_limit: int | None = None,
    used_count: int = 0,
) -> Coupon:
    coupon = Coupon(
        code=code,
        coupon_type=coupon_type,
        value=value,
        is_active=is_active,
        ends_at=ends_at,
        usage_limit=usage_limit,
        used_count=used_count,
    )
    db.add(coupon)
    await db.flush()
    return coupon


async def _make_banner(
    db: AsyncSession,
    slot: str = "hero",
    image_url: str = "https://cdn.example.com/hero.jpg",
    is_active: bool = True,
) -> Banner:
    return await BannerRepository(db).create(slot=slot, image_url=image_url, is_active=is_active)


async def _make_testimonial(db: AsyncSession, is_featured: bool = True) -> Testimonial:
    return await TestimonialRepository(db).create(
        name="Happy Customer",
        body="Great service!",
        rating=5,
        is_featured=is_featured,
    )


# ── GET /coupons/{code}/validate ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_validate_coupon_valid(client: AsyncClient, db: AsyncSession) -> None:
    await _make_coupon(db, code="VALID10")

    resp = await client.get("/api/v1/coupons/VALID10/validate")
    assert resp.status_code == 200
    data = resp.json()
    assert data["code"] == "VALID10"
    assert data["coupon_type"] == "percent"
    assert float(data["value"]) == 10.0


@pytest.mark.asyncio
async def test_validate_coupon_case_insensitive(client: AsyncClient, db: AsyncSession) -> None:
    await _make_coupon(db, code="UPPER20")

    resp = await client.get("/api/v1/coupons/upper20/validate")
    assert resp.status_code == 200
    assert resp.json()["code"] == "UPPER20"


@pytest.mark.asyncio
async def test_validate_coupon_not_found(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/coupons/NOTEXIST/validate")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_validate_coupon_inactive(client: AsyncClient, db: AsyncSession) -> None:
    await _make_coupon(db, code="INACTIVE", is_active=False)

    resp = await client.get("/api/v1/coupons/INACTIVE/validate")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_validate_coupon_expired(client: AsyncClient, db: AsyncSession) -> None:
    past = datetime.now(UTC) - timedelta(days=1)
    await _make_coupon(db, code="EXPIRED", ends_at=past)

    resp = await client.get("/api/v1/coupons/EXPIRED/validate")
    assert resp.status_code == 400
    assert "expired" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_validate_coupon_usage_limit_reached(client: AsyncClient, db: AsyncSession) -> None:
    await _make_coupon(db, code="USED", usage_limit=5, used_count=5)

    resp = await client.get("/api/v1/coupons/USED/validate")
    assert resp.status_code == 400
    assert "limit" in resp.json()["detail"].lower()


# ── GET /banners ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_banners_empty(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/banners")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_list_banners_returns_active(client: AsyncClient, db: AsyncSession) -> None:
    await _make_banner(db, slot="hero", image_url="https://cdn.example.com/h.jpg")

    resp = await client.get("/api/v1/banners?slot=hero")
    assert resp.status_code == 200
    data = resp.json()
    assert any(b["slot"] == "hero" for b in data)


@pytest.mark.asyncio
async def test_list_banners_filters_by_slot(client: AsyncClient, db: AsyncSession) -> None:
    await _make_banner(db, slot="sidebar", image_url="https://cdn.example.com/s.jpg")

    resp = await client.get("/api/v1/banners?slot=hero")
    assert resp.status_code == 200
    # sidebar banner should NOT appear when filtering for hero
    assert all(b["slot"] == "hero" for b in resp.json())


@pytest.mark.asyncio
async def test_list_banners_hides_inactive(client: AsyncClient, db: AsyncSession) -> None:
    await _make_banner(db, slot="promo", image_url="https://cdn.example.com/p.jpg", is_active=False)

    resp = await client.get("/api/v1/banners?slot=promo")
    assert resp.status_code == 200
    assert resp.json() == []


# ── GET /testimonials ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_testimonials_empty(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/testimonials")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_list_testimonials_returns_featured(
    client: AsyncClient, db: AsyncSession
) -> None:
    await _make_testimonial(db, is_featured=True)

    resp = await client.get("/api/v1/testimonials")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    assert data[0]["name"] == "Happy Customer"


@pytest.mark.asyncio
async def test_list_testimonials_hides_non_featured(
    client: AsyncClient, db: AsyncSession
) -> None:
    t = await _make_testimonial(db, is_featured=False)
    t_id = str(t.id)

    resp = await client.get("/api/v1/testimonials")
    assert resp.status_code == 200
    ids = [x["id"] for x in resp.json()]
    assert t_id not in ids
