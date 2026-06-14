import uuid

from fastapi import APIRouter, Query, status

from app.core.deps import DB, CurrentUser
from app.schemas.loyalty import ReviewCreate, ReviewRead
from app.services import review_service

router = APIRouter(prefix="/reviews", tags=["reviews"])


@router.post("", response_model=ReviewRead, status_code=status.HTTP_201_CREATED)
async def submit_review(
    body: ReviewCreate, user: CurrentUser, db: DB
) -> ReviewRead:
    return await review_service.submit_review(db, user, body)


@router.get("", response_model=list[ReviewRead])
async def list_reviews(
    db: DB,
    product_id: uuid.UUID = Query(...),
) -> list[ReviewRead]:
    return await review_service.list_reviews(db, product_id, published_only=True)
