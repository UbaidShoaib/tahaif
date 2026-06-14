from fastapi import APIRouter, Query

from app.core.deps import DB
from app.schemas.loyalty import BannerRead, CouponValidateRead, TestimonialRead
from app.services import marketing_service

router = APIRouter(tags=["marketing"])


@router.get("/coupons/{code}/validate", response_model=CouponValidateRead)
async def validate_coupon(code: str, db: DB) -> CouponValidateRead:
    return await marketing_service.validate_coupon(db, code)


@router.get("/banners", response_model=list[BannerRead])
async def list_banners(
    db: DB,
    slot: str | None = Query(default=None),
) -> list[BannerRead]:
    return await marketing_service.list_banners(db, slot=slot)


@router.get("/testimonials", response_model=list[TestimonialRead])
async def list_testimonials(db: DB) -> list[TestimonialRead]:
    return await marketing_service.list_testimonials(db)
