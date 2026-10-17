import uuid
from datetime import datetime, time
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

# ── City ──────────────────────────────────────────────────────────────────────

class CityRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    slug: str
    timezone: str
    is_active: bool


class CityCreate(BaseModel):
    name: str = Field(max_length=100)
    slug: str = Field(max_length=100, pattern=r"^[a-z0-9-]+$")
    timezone: str = Field(max_length=64)


class CityUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=100)
    timezone: str | None = Field(default=None, max_length=64)
    is_active: bool | None = None


# ── Vendor ────────────────────────────────────────────────────────────────────

class VendorRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    city_id: uuid.UUID
    owner_user_id: uuid.UUID | None
    name: str
    slug: str
    description: str | None
    logo_url: str | None
    is_active: bool


class VendorCreate(BaseModel):
    city_id: uuid.UUID
    name: str = Field(max_length=255)
    slug: str = Field(max_length=255, pattern=r"^[a-z0-9-]+$")
    description: str | None = None
    logo_url: str | None = None


class VendorUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    description: str | None = None
    logo_url: str | None = None
    is_active: bool | None = None


# ── Category ──────────────────────────────────────────────────────────────────

class CategoryRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    parent_id: uuid.UUID | None
    name: str
    slug: str
    sort_order: int
    is_active: bool
    children: list["CategoryRead"] = []


class CategoryCreate(BaseModel):
    parent_id: uuid.UUID | None = None
    name: str = Field(max_length=100)
    slug: str = Field(max_length=100, pattern=r"^[a-z0-9-]+$")
    sort_order: int = 0


class CategoryUpdate(BaseModel):
    parent_id: uuid.UUID | None = None
    name: str | None = Field(default=None, max_length=100)
    sort_order: int | None = None
    is_active: bool | None = None


# ── ProductImage ──────────────────────────────────────────────────────────────

class ProductImageRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    url: str
    alt_text: str | None
    sort_order: int
    is_primary: bool


# ── ProductCity ───────────────────────────────────────────────────────────────

class ProductCityRead(BaseModel):
    model_config = {"from_attributes": True}

    city_id: uuid.UUID
    price_override_pkr: int | None
    delivery_fee_pkr: int
    lead_time_hours: int
    same_day_cutoff: time | None
    is_available: bool


class ProductCityUpsert(BaseModel):
    city_id: uuid.UUID
    price_override_pkr: int | None = Field(default=None, ge=0)
    delivery_fee_pkr: int = Field(default=0, ge=0)
    lead_time_hours: int = Field(default=24, ge=0)
    same_day_cutoff: time | None = None
    is_available: bool = True


# ── ProductVariant ────────────────────────────────────────────────────────────

class ProductVariantRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    price_delta_pkr: int
    stock_qty: int | None = Field(description="null = made to order, not counted; 0 = sold out")
    attrs: dict[str, object] | None
    is_active: bool


class ProductVariantWrite(BaseModel):
    """Add or change a size/option. On PATCH, omitted fields are left alone."""

    name: str = Field(min_length=1, max_length=255, examples=["2 lb"])
    price_delta_pkr: int = Field(default=0, ge=-10_000_000_00, le=10_000_000_00, description="Added to the base price, in paisa")
    stock_qty: int | None = Field(default=None, ge=0, le=1_000_000, description="null = not counted")
    is_active: bool = True


class ProductVariantUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    price_delta_pkr: int | None = Field(default=None, ge=-10_000_000_00, le=10_000_000_00)
    stock_qty: int | None = Field(default=None, ge=0, le=1_000_000)
    is_active: bool | None = None


# ── VendorSummary (embedded in ProductRead) ───────────────────────────────────

class VendorSummary(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    slug: str


# ── Product ───────────────────────────────────────────────────────────────────

class ProductRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    vendor_id: uuid.UUID
    category_id: uuid.UUID | None
    name: str
    slug: str
    description: str | None
    base_price_pkr: int
    is_active: bool
    images: list[ProductImageRead] = []
    product_cities: list[ProductCityRead] = []
    variants: list[ProductVariantRead] = []
    vendor: VendorSummary | None = None


class OccasionSummary(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    slug: str
    name: str


class AdminProductDetail(ProductRead):
    """The product editor's view: everything buyers see plus what only staff edit."""

    occasions: list[OccasionSummary] = Field(description="Occasion pages the product appears on")


class ProductImageOrder(BaseModel):
    image_ids: list[uuid.UUID] = Field(min_length=1, max_length=50, description="Every photo of the product, first to last")


class ProductOccasionsSet(BaseModel):
    occasion_ids: list[uuid.UUID] = Field(max_length=50, description="The full set; occasions left out are removed")


class ProductCreate(BaseModel):
    vendor_id: uuid.UUID
    category_id: uuid.UUID | None = None
    name: str = Field(max_length=255)
    slug: str = Field(max_length=255, pattern=r"^[a-z0-9-]+$")
    description: str | None = None
    base_price_pkr: int = Field(ge=0)


class ProductUpdate(BaseModel):
    category_id: uuid.UUID | None = None
    name: str | None = Field(default=None, max_length=255)
    description: str | None = None
    base_price_pkr: int | None = Field(default=None, ge=0)
    is_active: bool | None = None


# ── Occasion ──────────────────────────────────────────────────────────────────

class OccasionRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    slug: str
    name: str
    name_ur: str | None
    banner_url: str | None
    starts_at: datetime | None
    ends_at: datetime | None
    sort_order: int
    is_active: bool


class OccasionCreate(BaseModel):
    slug: str = Field(max_length=100, pattern=r"^[a-z0-9-]+$")
    name: str = Field(max_length=100)
    name_ur: str | None = Field(default=None, max_length=100)
    banner_url: str | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    sort_order: int = 0


class OccasionUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=100)
    name_ur: str | None = Field(default=None, max_length=100)
    banner_url: str | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    sort_order: int | None = None
    is_active: bool | None = None


# ── List responses ────────────────────────────────────────────────────────────

ProductSort = Literal["recommended", "price_asc", "price_desc", "newest"]
"""Storefront listing order. "recommended" keeps the historical alphabetical order."""


class PaginatedProducts(BaseModel):
    items: list[ProductRead]
    total: int
    page: int
    page_size: int


class FxRatesRead(BaseModel):
    """PKR→currency rates buyers can currently be charged in (PKR is always 1)."""

    base: str = "PKR"
    rates: dict[str, Decimal]
