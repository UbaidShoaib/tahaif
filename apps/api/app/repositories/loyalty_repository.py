"""Repository layer for loyalty, reviews, coupons, and banners."""

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.loyalty import (
    Banner,
    Coupon,
    LoyaltyLedger,
    LoyaltyWallet,
    Review,
    Testimonial,
)


class LoyaltyRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_wallet(self, user_id: uuid.UUID) -> LoyaltyWallet | None:
        result = await self._db.execute(
            select(LoyaltyWallet).where(LoyaltyWallet.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def get_or_create_wallet(self, user_id: uuid.UUID) -> LoyaltyWallet:
        wallet = await self.get_wallet(user_id)
        if not wallet:
            wallet = LoyaltyWallet(user_id=user_id)
            self._db.add(wallet)
            await self._db.flush()
        return wallet

    async def add_ledger_entry(
        self,
        user_id: uuid.UUID,
        delta_points: int,
        reason: str,
        order_id: uuid.UUID | None = None,
    ) -> LoyaltyLedger:
        entry = LoyaltyLedger(
            user_id=user_id,
            order_id=order_id,
            delta_points=delta_points,
            reason=reason,
        )
        self._db.add(entry)
        await self._db.flush()
        return entry

    async def award_points(
        self,
        user_id: uuid.UUID,
        points: int,
        reason: str,
        order_id: uuid.UUID | None = None,
    ) -> LoyaltyWallet:
        wallet = await self.get_or_create_wallet(user_id)
        wallet.balance_points += points
        wallet.lifetime_earned += points
        wallet.updated_at = datetime.now(UTC)
        await self._db.flush()
        await self.add_ledger_entry(user_id, points, reason, order_id)
        return wallet

    async def burn_points(
        self,
        user_id: uuid.UUID,
        points: int,
        reason: str,
        order_id: uuid.UUID | None = None,
    ) -> LoyaltyWallet:
        wallet = await self.get_or_create_wallet(user_id)
        if wallet.balance_points < points:
            from fastapi import HTTPException, status
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Insufficient loyalty points (have {wallet.balance_points}, need {points})",
            )
        wallet.balance_points -= points
        wallet.lifetime_burned += points
        wallet.updated_at = datetime.now(UTC)
        await self._db.flush()
        await self.add_ledger_entry(user_id, -points, reason, order_id)
        return wallet

    async def list_ledger(
        self, user_id: uuid.UUID, limit: int = 50
    ) -> list[LoyaltyLedger]:
        result = await self._db.execute(
            select(LoyaltyLedger)
            .where(LoyaltyLedger.user_id == user_id)
            .order_by(LoyaltyLedger.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())


class ReviewRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def create(self, **kwargs: Any) -> Review:
        review = Review(**kwargs)
        self._db.add(review)
        await self._db.flush()
        await self._db.refresh(review)
        return review

    async def get_by_user_and_product(
        self, user_id: uuid.UUID, product_id: uuid.UUID
    ) -> Review | None:
        result = await self._db.execute(
            select(Review).where(
                Review.user_id == user_id, Review.product_id == product_id
            )
        )
        return result.scalar_one_or_none()

    async def list_for_product(
        self, product_id: uuid.UUID, published_only: bool = True, limit: int = 50
    ) -> list[Review]:
        q = select(Review).where(Review.product_id == product_id)
        if published_only:
            q = q.where(Review.is_published.is_(True))
        q = q.order_by(Review.created_at.desc()).limit(limit)
        result = await self._db.execute(q)
        return list(result.scalars().all())


class CouponRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_by_code(self, code: str) -> Coupon | None:
        result = await self._db.execute(
            select(Coupon).where(Coupon.code == code.upper())
        )
        return result.scalar_one_or_none()

    async def create(self, **kwargs: Any) -> Coupon:
        coupon = Coupon(**kwargs)
        self._db.add(coupon)
        await self._db.flush()
        await self._db.refresh(coupon)
        return coupon


class BannerRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def list_active(self, slot: str | None = None) -> list[Banner]:
        now = datetime.now(UTC)
        q = select(Banner).where(
            Banner.is_active.is_(True),
            (Banner.starts_at.is_(None)) | (Banner.starts_at <= now),
            (Banner.ends_at.is_(None)) | (Banner.ends_at >= now),
        )
        if slot:
            q = q.where(Banner.slot == slot)
        q = q.order_by(Banner.slot, Banner.sort_order)
        result = await self._db.execute(q)
        return list(result.scalars().all())

    async def create(self, **kwargs: Any) -> Banner:
        banner = Banner(**kwargs)
        self._db.add(banner)
        await self._db.flush()
        await self._db.refresh(banner)
        return banner


class TestimonialRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def list_featured(self, limit: int = 10) -> list[Testimonial]:
        result = await self._db.execute(
            select(Testimonial)
            .where(Testimonial.is_featured.is_(True))
            .order_by(Testimonial.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def create(self, **kwargs: Any) -> Testimonial:
        t = Testimonial(**kwargs)
        self._db.add(t)
        await self._db.flush()
        await self._db.refresh(t)
        return t
