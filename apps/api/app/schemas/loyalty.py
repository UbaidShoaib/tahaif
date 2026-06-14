import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class LoyaltyWalletRead(BaseModel):
    balance_points: int
    lifetime_earned: int
    lifetime_burned: int
    updated_at: datetime

    model_config = {"from_attributes": True}


class LoyaltyLedgerEntryRead(BaseModel):
    id: uuid.UUID
    delta_points: int
    reason: str
    order_id: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ReviewCreate(BaseModel):
    product_id: uuid.UUID
    order_item_id: uuid.UUID | None = None
    rating: int = Field(ge=1, le=5)
    title: str | None = Field(default=None, max_length=255)
    body: str | None = None


class ReviewRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    product_id: uuid.UUID
    order_item_id: uuid.UUID | None
    rating: int
    title: str | None
    body: str | None
    is_published: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class CouponValidateRead(BaseModel):
    code: str
    coupon_type: str
    value: Decimal
    min_order_pkr: int | None
    ends_at: datetime | None

    model_config = {"from_attributes": True}


class BannerRead(BaseModel):
    id: uuid.UUID
    slot: str
    image_url: str
    link_url: str | None
    title: str | None
    subtitle: str | None
    sort_order: int

    model_config = {"from_attributes": True}


class TestimonialRead(BaseModel):
    id: uuid.UUID
    name: str
    body: str
    rating: int
    image_url: str | None
    is_featured: bool

    model_config = {"from_attributes": True}
