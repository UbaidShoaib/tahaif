"""Review submission and listing service."""

import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.catalog import Product
from app.models.order import OrderItem
from app.models.user import User
from app.repositories.loyalty_repository import ReviewRepository
from app.schemas.loyalty import ReviewCreate, ReviewRead


async def submit_review(
    db: AsyncSession, user: User, data: ReviewCreate
) -> ReviewRead:
    repo = ReviewRepository(db)
    if await db.get(Product, data.product_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    if data.order_item_id is not None:
        # Only a line of the reviewer's own order, for this product, can back a review.
        item = await db.get(OrderItem, data.order_item_id, options=[selectinload(OrderItem.order)])
        if item is None or item.product_id != data.product_id or item.order.user_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="That order item isn't one of your purchases of this product",
            )

    await repo.lock_user_product(user.id, data.product_id)
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
