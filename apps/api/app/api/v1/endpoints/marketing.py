import secrets

from fastapi import APIRouter, HTTPException, Query, Response, status
from pydantic import BaseModel, EmailStr

from app.core.config import get_settings
from app.core.deps import DB
from app.schemas.loyalty import BannerRead, CouponValidateRead, TestimonialRead
from app.services import marketing_service

router = APIRouter(tags=["marketing"])

_CACHE_MARKETING = "public, max-age=300, stale-while-revalidate=60"


@router.get("/coupons/{code}/validate", response_model=CouponValidateRead)
async def validate_coupon(code: str, db: DB) -> CouponValidateRead:
    return await marketing_service.validate_coupon(db, code)


@router.get("/banners", response_model=list[BannerRead])
async def list_banners(
    db: DB,
    response: Response,
    slot: str | None = Query(default=None),
) -> list[BannerRead]:
    response.headers["Cache-Control"] = _CACHE_MARKETING
    return await marketing_service.list_banners(db, slot=slot)


@router.get("/testimonials", response_model=list[TestimonialRead])
async def list_testimonials(db: DB, response: Response) -> list[TestimonialRead]:
    response.headers["Cache-Control"] = _CACHE_MARKETING
    return await marketing_service.list_testimonials(db)


# ── Newsletter ─────────────────────────────────────────────────────────────────

class NewsletterSubscribeRequest(BaseModel):
    email: EmailStr


@router.post("/newsletter/subscribe", status_code=status.HTTP_200_OK)
async def newsletter_subscribe(body: NewsletterSubscribeRequest, db: DB) -> dict[str, str]:
    """Subscribe an email address; sends a double opt-in confirmation email."""
    from sqlalchemy import select
    from app.models.loyalty import NewsletterSubscriber
    from app.integrations.resend_client import send_newsletter_confirmation_email

    settings = get_settings()

    result = await db.execute(
        select(NewsletterSubscriber).where(NewsletterSubscriber.email == body.email.lower())
    )
    existing = result.scalar_one_or_none()

    if existing and existing.confirmed:
        return {"message": "Already subscribed"}

    token = secrets.token_urlsafe(32)
    if existing:
        existing.token = token
    else:
        db.add(NewsletterSubscriber(email=body.email.lower(), token=token))
    await db.flush()

    confirm_url = f"{settings.frontend_url}/newsletter/confirm?token={token}"
    if settings.resend_api_key:
        try:
            await send_newsletter_confirmation_email(body.email, confirm_url)
        except Exception:
            pass

    return {"message": "Confirmation email sent. Please check your inbox."}


@router.get("/newsletter/confirm", status_code=status.HTTP_200_OK)
async def newsletter_confirm(token: str, db: DB) -> dict[str, str]:
    from sqlalchemy import select
    from app.models.loyalty import NewsletterSubscriber

    result = await db.execute(
        select(NewsletterSubscriber).where(NewsletterSubscriber.token == token)
    )
    subscriber = result.scalar_one_or_none()
    if not subscriber:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")

    subscriber.confirmed = True
    await db.flush()
    return {"message": "Subscription confirmed. Thank you!"}
