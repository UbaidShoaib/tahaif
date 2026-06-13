import enum
import uuid
from datetime import datetime, time
from decimal import Decimal
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy import (
    UUID,
    BigInteger,
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Table,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.user import User


class CustomizationFieldType(enum.StrEnum):
    text = "text"
    image = "image"
    select = "select"


class FxRateSource(enum.StrEnum):
    auto = "auto"
    manual = "manual"


# ── M2M association tables ─────────────────────────────────────────────────────
product_occasions_table = Table(
    "product_occasions",
    Base.metadata,
    Column("product_id", UUID(), ForeignKey("products.id", ondelete="CASCADE"), primary_key=True),
    Column("occasion_id", UUID(), ForeignKey("occasions.id", ondelete="CASCADE"), primary_key=True),
)

product_categories_table = Table(
    "product_categories",
    Base.metadata,
    Column("product_id", UUID(), ForeignKey("products.id", ondelete="CASCADE"), primary_key=True),
    Column("category_id", UUID(), ForeignKey("categories.id", ondelete="CASCADE"), primary_key=True),
)


# ── City ───────────────────────────────────────────────────────────────────────
class City(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "cities"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    vendors: Mapped[list["Vendor"]] = relationship(back_populates="city")
    product_cities: Mapped[list["ProductCity"]] = relationship(back_populates="city")


# ── Vendor ─────────────────────────────────────────────────────────────────────
class Vendor(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "vendors"

    city_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("cities.id", ondelete="RESTRICT"), nullable=False, index=True)
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    logo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    city: Mapped["City"] = relationship(back_populates="vendors")
    owner: Mapped["User | None"] = relationship()
    products: Mapped[list["Product"]] = relationship(back_populates="vendor")


# ── Category ───────────────────────────────────────────────────────────────────
class Category(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "categories"

    parent_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    parent: Mapped["Category | None"] = relationship(remote_side="Category.id", back_populates="children")
    children: Mapped[list["Category"]] = relationship(back_populates="parent")


# ── Occasion ───────────────────────────────────────────────────────────────────
class Occasion(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "occasions"

    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    name_ur: Mapped[str | None] = mapped_column(String(100), nullable=True)
    banner_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    products: Mapped[list["Product"]] = relationship(secondary=product_occasions_table, back_populates="occasions")


# ── Product ────────────────────────────────────────────────────────────────────
class Product(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "products"

    vendor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("vendors.id", ondelete="RESTRICT"), nullable=False, index=True)
    # Legacy single-category FK — kept for backwards compat. Use product_categories M2M for new queries.
    category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    base_price_pkr: Mapped[int] = mapped_column(BigInteger, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    vendor: Mapped["Vendor"] = relationship(back_populates="products")
    images: Mapped[list["ProductImage"]] = relationship(back_populates="product", cascade="all, delete-orphan", order_by="ProductImage.sort_order")
    product_cities: Mapped[list["ProductCity"]] = relationship(back_populates="product", cascade="all, delete-orphan")
    variants: Mapped[list["ProductVariant"]] = relationship(back_populates="product", cascade="all, delete-orphan")
    customization_fields: Mapped[list["CustomizationField"]] = relationship(back_populates="product", cascade="all, delete-orphan", order_by="CustomizationField.sort_order")
    occasions: Mapped[list["Occasion"]] = relationship(secondary=product_occasions_table, back_populates="products")
    categories: Mapped[list["Category"]] = relationship(secondary=product_categories_table)


# ── ProductVariant ─────────────────────────────────────────────────────────────
class ProductVariant(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "product_variants"

    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    sku: Mapped[str | None] = mapped_column(String(100), unique=True, nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    price_delta_pkr: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    stock_qty: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    attrs: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    product: Mapped["Product"] = relationship(back_populates="variants")


# ── ProductImage ───────────────────────────────────────────────────────────────
class ProductImage(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "product_images"

    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    alt_text: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    product: Mapped["Product"] = relationship(back_populates="images")


# ── ProductCity ────────────────────────────────────────────────────────────────
class ProductCity(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "product_cities"
    __table_args__ = (UniqueConstraint("product_id", "city_id"),)

    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    city_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("cities.id", ondelete="CASCADE"), nullable=False, index=True)
    price_override_pkr: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    delivery_fee_pkr: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    lead_time_hours: Mapped[int] = mapped_column(Integer, default=24, nullable=False)
    same_day_cutoff: Mapped[time | None] = mapped_column(Time, nullable=True)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    product: Mapped["Product"] = relationship(back_populates="product_cities")
    city: Mapped["City"] = relationship(back_populates="product_cities")


# ── CustomizationField ─────────────────────────────────────────────────────────
class CustomizationField(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "customization_fields"

    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    field_type: Mapped[CustomizationFieldType] = mapped_column(Enum(CustomizationFieldType, name="customization_field_type", create_type=False), nullable=False)
    required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    max_len: Mapped[int | None] = mapped_column(Integer, nullable=True)
    options: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    product: Mapped["Product"] = relationship(back_populates="customization_fields")


# ── FxRate ─────────────────────────────────────────────────────────────────────
class FxRate(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "fx_rates"

    base_currency: Mapped[str] = mapped_column(String(3), nullable=False, default="PKR")
    quote_currency: Mapped[str] = mapped_column(String(3), nullable=False)
    rate: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    source: Mapped[FxRateSource] = mapped_column(Enum(FxRateSource, name="fx_rate_source", create_type=False), nullable=False, default=FxRateSource.auto)
    set_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()"))

    setter: Mapped["User | None"] = relationship()
