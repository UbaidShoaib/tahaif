import enum
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    false,
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


class OrderSource(enum.StrEnum):
    web = "web"
    instagram = "instagram"
    whatsapp = "whatsapp"
    phone = "phone"
    walk_in = "walk_in"


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
    # Buyer contact for guest orders (no user); null for signed-in orders. ADR 0004.
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    # Recipient messaging: whose gift it is ("A gift from Ali"), and whether to
    # keep it a surprise (no message before delivery, rider doesn't call ahead).
    surprise: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false(), nullable=False)
    gift_from: Mapped[str | None] = mapped_column(String(80), nullable=True)
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
    idempotency_key: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    coupon_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    placed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    # Where the order came from (ADR 0009). Staff-entered orders also record who
    # took them, the chat/handle they came from and the reel/campaign.
    source: Mapped[str] = mapped_column(
        String(20), default=OrderSource.web, server_default=OrderSource.web.value, nullable=False, index=True
    )
    source_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)
    campaign: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_by_staff_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # The buyer checked the details and accepted the terms on the order link
    # page; this is the record of what was agreed, not the chat history.
    customer_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    marketing_opt_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User | None"] = relationship(foreign_keys=[user_id])
    items: Mapped[list["OrderItem"]] = relationship(back_populates="order", cascade="all, delete-orphan")
    fulfillments: Mapped[list["Fulfillment"]] = relationship(back_populates="order", cascade="all, delete-orphan")
    payments: Mapped[list["Payment"]] = relationship(back_populates="order", cascade="all, delete-orphan")
    manual_messages: Mapped[list["OrderMessage"]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )


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
    # Optional voice/video note for the card: private object key, its MIME type,
    # and the token in the card's QR link (/note/{note_token}).
    note_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    note_content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    note_token: Mapped[uuid.UUID | None] = mapped_column(nullable=True, unique=True, index=True)
    # When and from where the buyer agreed to the content rules for this note
    # (our record if a note is ever reported).
    note_consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    note_consent_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    # Staff took the note down after a report. The file and key are kept as
    # evidence; the QR link just stops playing it.
    note_disabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    note_disabled_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    order: Mapped["Order"] = relationship(back_populates="items")
    fulfillment: Mapped["Fulfillment | None"] = relationship(
        back_populates="order_items",
        foreign_keys=[fulfillment_id],
    )
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
    # Proof of delivery: object key in the private bucket (never a public URL).
    delivery_photo_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    received_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Recipient's thank-you (/thanks/{thanks_token}): text and/or one photo,
    # voice note or video in the private bucket. One reply; resending replaces it.
    thanks_token: Mapped[uuid.UUID] = mapped_column(default=uuid.uuid4, nullable=False, unique=True, index=True)
    thanks_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    thanks_media_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    thanks_media_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    thanks_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

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


class OrderMessage(UUIDPrimaryKeyMixin, Base):
    """A WhatsApp message a staff member sent by hand via a wa.me link (ADR 0009).

    One row per (order, kind) so the "messages to send" queue knows what's done.
    """

    __tablename__ = "order_messages"
    __table_args__ = (UniqueConstraint("order_id", "kind", name="uq_order_messages_order_kind"),)

    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    sent_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    order: Mapped["Order"] = relationship(back_populates="manual_messages")


class CardNoteReport(UUIDPrimaryKeyMixin, Base):
    """Someone who opened a card note reported it (abusive, unwanted, ...).

    Kept even if the note is later removed: it's the record we act on and may
    have to hand to the PTA/FIA. One report per (item, IP).
    """

    __tablename__ = "card_note_reports"
    __table_args__ = (UniqueConstraint("order_item_id", "reporter_ip", name="uq_card_note_reports_item_ip"),)

    order_item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("order_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    reason: Mapped[str] = mapped_column(String(40), nullable=False)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    reporter_ip: Mapped[str] = mapped_column(String(45), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    # open → note_disabled (staff took it down) or dismissed (nothing wrong).
    status: Mapped[str] = mapped_column(String(20), default="open", server_default="open", nullable=False, index=True)
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    order_item: Mapped["OrderItem"] = relationship()
