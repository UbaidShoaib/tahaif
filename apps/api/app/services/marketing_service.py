"""Coupon validation, banner listing, and testimonials."""

from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.loyalty_repository import (
    BannerRepository,
    CouponRepository,
    TestimonialRepository,
)
from app.schemas.loyalty import BannerRead, CouponValidateRead, TestimonialRead


async def validate_coupon(db: AsyncSession, code: str) -> CouponValidateRead:
    repo = CouponRepository(db)
    coupon = await repo.get_by_code(code.upper())

    if not coupon or not coupon.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Coupon not found or inactive")

    now = datetime.now(UTC)
    if coupon.starts_at and coupon.starts_at > now:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Coupon not yet active")
    if coupon.ends_at and coupon.ends_at < now:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Coupon has expired")
    if coupon.usage_limit is not None and coupon.used_count >= coupon.usage_limit:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Coupon usage limit reached")

    return CouponValidateRead.model_validate(coupon)


async def list_banners(db: AsyncSession, slot: str | None = None) -> list[BannerRead]:
    repo = BannerRepository(db)
    banners = await repo.list_active(slot=slot)
    return [BannerRead.model_validate(b) for b in banners]


async def list_testimonials(db: AsyncSession) -> list[TestimonialRead]:
    repo = TestimonialRepository(db)
    testimonials = await repo.list_featured()
    return [TestimonialRead.model_validate(t) for t in testimonials]
