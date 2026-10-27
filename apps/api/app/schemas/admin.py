"""Back-office views and edits: coupons, users, exchange rates, occasions and shops."""

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field, model_validator

from app.models.catalog import FxRateSource
from app.models.loyalty import CouponType
from app.models.user import UserRole
from app.schemas.catalog import OccasionRead

# ── Coupons ───────────────────────────────────────────────────────────────────


class CouponRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    code: str
    coupon_type: CouponType
    value: Decimal = Field(description="Percent off, or rupees off for a fixed coupon; unused for free delivery")
    min_order_pkr: int | None = Field(description="Smallest subtotal it works on, in paisa")
    usage_limit: int | None
    per_customer_limit: int | None
    used_count: int
    is_active: bool
    starts_at: datetime | None
    ends_at: datetime | None
    created_at: datetime


def _check_window(starts_at: datetime | None, ends_at: datetime | None) -> None:
    if starts_at and ends_at and ends_at <= starts_at:
        raise ValueError("The end must be after the start")


class CouponCreate(BaseModel):
    code: str = Field(min_length=2, max_length=50, pattern=r"^[A-Za-z0-9_-]+$")
    coupon_type: CouponType
    value: Decimal = Field(gt=0)
    min_order_pkr: int | None = Field(default=None, ge=0)
    usage_limit: int | None = Field(default=None, ge=1)
    per_customer_limit: int | None = Field(
        default=None, ge=1, description="How many orders one buyer may use it on; 1 for a first-order code"
    )
    starts_at: datetime | None = None
    ends_at: datetime | None = None

    @model_validator(mode="after")
    def _sensible(self) -> "CouponCreate":
        if self.coupon_type == CouponType.percent and self.value > 100:
            raise ValueError("A percent coupon can take at most 100% off")
        _check_window(self.starts_at, self.ends_at)
        return self


class CouponUpdate(BaseModel):
    """Limits and dates; send null to remove one. The code and type stay as they are,
    since orders already placed refer to them."""

    value: Decimal | None = Field(default=None, gt=0)
    min_order_pkr: int | None = Field(default=None, ge=0)
    usage_limit: int | None = Field(default=None, ge=1)
    per_customer_limit: int | None = Field(default=None, ge=1)
    starts_at: datetime | None = None
    ends_at: datetime | None = None


# ── Users ─────────────────────────────────────────────────────────────────────


class AdminUserRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    email: str
    full_name: str | None
    phone: str | None
    role: UserRole
    is_verified: bool
    created_at: datetime


# ── Exchange rates ────────────────────────────────────────────────────────────


class FxRateRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    quote_currency: str
    rate: Decimal = Field(description="How much of the currency one rupee buys")
    source: FxRateSource
    fetched_at: datetime


class FxCurrencyRead(BaseModel):
    """One currency buyers can pay in: the automatic rate, any manual override, and which is charged."""

    quote_currency: str
    auto: FxRateRead | None
    manual: FxRateRead | None
    effective_rate: Decimal | None = Field(description="Manual wins over automatic; null = not chargeable yet")


# ── Occasions ─────────────────────────────────────────────────────────────────


class AdminOccasionRead(OccasionRead):
    product_count: int = Field(description="Products shown on the occasion's page")


# ── Shops ─────────────────────────────────────────────────────────────────────


class AdminShopRead(BaseModel):
    """An approved shop (applications live in their own list), open or closed."""

    id: uuid.UUID
    name: str
    slug: str
    description: str | None
    logo_url: str | None
    contact_phone: str | None
    city_id: uuid.UUID
    city_name: str
    is_active: bool
    is_house: bool = Field(description="No owner account: run by staff")
    owner_email: str | None
    product_count: int
    live_product_count: int
    bank_account_title: str | None
    bank_name: str | None
    bank_iban: str | None


class AdminShopUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    logo_url: str | None = None
    contact_phone: str | None = Field(default=None, max_length=30)
    city_id: uuid.UUID | None = None
    is_active: bool | None = Field(default=None, description="false closes the shop: its products go off sale")
