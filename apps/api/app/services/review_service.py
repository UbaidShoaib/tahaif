"""Review submission and listing service."""

import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.repositories.loyalty_repository import ReviewRepository
from app.schemas.loyalty import ReviewCreate, ReviewRead


async def submit_review(
    db: AsyncSession, user: User, data: ReviewCreate
) -> ReviewRead:
    repo = ReviewRepository(db)

    existing = await repo.get_by_user_and_product(user.id, data.product_id)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already reviewed this product",
        )

    review = await repo.create(
        user_id=user.id,
        product_id=data.product_id,
        order_item_id=data.order_item_id,
        rating=data.rating,
        title=data.title,
        body=data.body,
        is_published=False,
    )
    return ReviewRead.model_validate(review)


async def list_reviews(
    db: AsyncSession,
    product_id: uuid.UUID,
    published_only: bool = True,
) -> list[ReviewRead]:
    repo = ReviewRepository(db)
    reviews = await repo.list_for_product(product_id, published_only=published_only)
    return [ReviewRead.model_validate(r) for r in reviews]
