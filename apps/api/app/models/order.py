import enum
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin, utcnow

if TYPE_CHECKING:
    from app.models.catalog import City, Product, ProductVariant, Vendor
    from app.models.user import User


class OrderStatus(enum.StrEnum):
    pending_payment = "pending_payment"
    paid = "paid"
    preparing = "preparing"
    dispatched = "dispatched"
    out_for_delivery = "out_for_delivery"
    delivered = "delivered"
    completed = "completed"
    cancelled = "cancelled"
    refunded = "refunded"
    on_hold = "on_hold"


class FulfillmentStatus(enum.StrEnum):
    pending = "pending"
    preparing = "preparing"
    ready = "ready"
    dispatched = "dispatched"
    out_for_delivery = "out_for_delivery"
    delivered = "delivered"
    failed = "failed"


class PaymentMethod(enum.StrEnum):
    cod = "cod"
    bank_transfer = "bank_transfer"
    stripe = "stripe"
    jazzcash = "jazzcash"
    easypaisa = "easypaisa"
    paypal = "paypal"


class PaymentStatus(enum.StrEnum):
    pending_cod = "pending_cod"
    pending_proof = "pending_proof"
    awaiting_verification = "awaiting_verification"
    paid = "paid"
    failed = "failed"
    refunded = "refunded"


# ── Cart ───────────────────────────────────────────────────────────────────────

class Cart(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "carts"

    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    session_token: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    currency: Mapped[str] = mapped_column(String(3), default="PKR", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    items: Mapped[list["CartItem"]] = relationship(
        back_populates="cart", cascade="all, delete-orphan"
    )
    user: Mapped["User | None"] = relationship()


class CartItem(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "cart_items"

    cart_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("carts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id", ondelete="RESTRICT"), nullable=False
    )
    variant_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("product_variants.id", ondelete="SET NULL"), nullable=True
    )
    qty: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    recipient_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    recipient_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    recipient_address_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("addresses.id", ondelete="SET NULL"), nullable=True
    )
    delivery_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    delivery_slot: Mapped[str | None] = mapped_column(String(50), nullable=True)
    customization: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    greeting_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    gift_image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    line_total_pkr: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    cart: Mapped["Cart"] = relationship(back_populates="items")
    product: Mapped["Product"] = relationship()
    variant: Mapped["ProductVariant | None"] = relationship()


# ── Order ──────────────────────────────────────────────────────────────────────

class Order(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "orders"

    public_token: Mapped[uuid.UUID] = mapped_column(default=uuid.uuid4, nullable=False, unique=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    fx_rate_to_pkr: Mapped[Decimal] = mapped_column(Numeric(18, 6), default=Decimal("1"), nullable=False)
    subtotal_pkr: Mapped[int] = mapped_column(BigInteger, nullable=False)
    discount_pkr: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    delivery_pkr: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    total_pkr: Mapped[int] = mapped_column(BigInteger, nullable=False)
    total_charged: Mapped[int] = mapped_column(BigInteger, nullable=False)
    status: Mapped[OrderStatus] = mapped_column(
        Enum(OrderStatus, name="order_status", create_type=False),
        default=OrderStatus.pending_payment,
        nullable=False,
    )
    coupon_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    placed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    user: Mapped["User | None"] = relationship()
    items: Mapped[list["OrderItem"]] = relationship(back_populates="order", cascade="all, delete-orphan")
    fulfillments: Mapped[list["Fulfillment"]] = relationship(back_populates="order", cascade="all, delete-orphan")
    payments: Mapped[list["Payment"]] = relationship(back_populates="order", cascade="all, delete-orphan")


class OrderItem(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "order_items"

    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    fulfillment_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("fulfillments.id", ondelete="SET NULL"), nullable=True, index=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id", ondelete="RESTRICT"), nullable=False
    )
    variant_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("product_variants.id", ondelete="SET NULL"), nullable=True
    )
    qty: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price_pkr: Mapped[int] = mapped_column(BigInteger, nullable=False)
    line_total_pkr: Mapped[int] = mapped_column(BigInteger, nullable=False)
    customization: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    greeting_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    gift_image_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    order: Mapped["Order"] = relationship(back_populates="items")
    product: Mapped["Product"] = relationship()
    variant: Mapped["ProductVariant | None"] = relationship()


class Fulfillment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "fulfillments"

    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    vendor_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("vendors.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    recipient_name: Mapped[str] = mapped_column(String(255), nullable=False)
    recipient_phone: Mapped[str] = mapped_column(String(30), nullable=False)
    address_line1: Mapped[str] = mapped_column(Text, nullable=False)
    address_line2: Mapped[str | None] = mapped_column(Text, nullable=True)
    city_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cities.id", ondelete="RESTRICT"), nullable=False
    )
    landmark: Mapped[str | None] = mapped_column(Text, nullable=True)
    delivery_date: Mapped[date] = mapped_column(Date, nullable=False)
    delivery_slot: Mapped[str | None] = mapped_column(String(50), nullable=True)
    status: Mapped[FulfillmentStatus] = mapped_column(
        Enum(FulfillmentStatus, name="fulfillment_status", create_type=False),
        default=FulfillmentStatus.pending,
        nullable=False,
    )
    courier_tracking: Mapped[str | None] = mapped_column(String(255), nullable=True)
    dispatched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    order: Mapped["Order"] = relationship(back_populates="fulfillments")
    vendor: Mapped["Vendor"] = relationship()
    city: Mapped["City"] = relationship()
    order_items: Mapped[list["OrderItem"]] = relationship(
        back_populates="fulfillment",
        foreign_keys="OrderItem.fulfillment_id",
    )


class Payment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "payments"

    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    method: Mapped[PaymentMethod] = mapped_column(
        Enum(PaymentMethod, name="payment_method", create_type=False), nullable=False
    )
    status: Mapped[PaymentStatus] = mapped_column(
        Enum(PaymentStatus, name="payment_status", create_type=False), nullable=False
    )
    amount_pkr: Mapped[int] = mapped_column(BigInteger, nullable=False)
    amount_charged: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    proof_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    provider_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)
    verified_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    raw_response: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)

    order: Mapped["Order"] = relationship(back_populates="payments")
