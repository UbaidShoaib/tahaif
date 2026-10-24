import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

from app.core.phone import OptionalTypedPhone, TypedPhone
from app.models.order import FulfillmentStatus, OrderSource, OrderStatus, PaymentMethod


class CheckoutPlace(BaseModel):
    payment_method: PaymentMethod = PaymentMethod.cod
    delivery_city_id: uuid.UUID
    delivery_date: date
    recipient_name: str = Field(min_length=2, max_length=255)
    recipient_phone: TypedPhone = Field(min_length=7, max_length=30)
    address_line1: str = Field(min_length=5, max_length=500)
    address_line2: str | None = Field(default=None, max_length=255)
    landmark: str | None = Field(default=None, max_length=255)
    notes: str | None = Field(default=None, max_length=500)
    coupon_code: str | None = Field(default=None, max_length=50)
    use_loyalty_points: bool = False
    # Required for guest checkout (no signed-in user); ignored for signed-in buyers. ADR 0004.
    contact_email: EmailStr | None = None
    contact_phone: OptionalTypedPhone = Field(default=None, min_length=7, max_length=30)
    surprise: bool = Field(
        default=False,
        description="Keep it a surprise: no message to the recipient before delivery; the rider doesn't call ahead",
    )
    gift_from: str | None = Field(
        default=None,
        max_length=80,
        description="Sender name used in messages to the recipient; defaults to the account's name",
        examples=["Ali (London)"],
    )
    campaign: str | None = Field(
        default=None,
        max_length=100,
        description="utm_campaign the buyer arrived with (Instagram bio/story link), for sales-by-campaign",
        examples=["eid-reel"],
    )


class QuoteLineItem(BaseModel):
    cart_item_id: uuid.UUID | None = Field(default=None, description="The cart line this prices")
    product_name: str
    variant_name: str | None
    qty: int
    unit_price_pkr: int
    line_total_pkr: int


class CheckoutQuote(BaseModel):
    items: list[QuoteLineItem]
    subtotal_pkr: int
    delivery_pkr: int
    coupon_code: str | None = None
    coupon_discount_pkr: int = 0
    loyalty_points_used: int = 0
    loyalty_discount_pkr: int = 0
    discount_pkr: int = 0
    total_pkr: int
    currency: str = Field(default="PKR", description="Currency the order will be charged in")
    fx_rate: Decimal = Field(default=Decimal("1"), description="PKR→currency rate used for the charge")
    total_charged: int = Field(default=0, description="Total in the charge currency's minor unit")


class ThanksRead(BaseModel):
    """The recipient's thank-you, as the buyer sees it."""

    message: str | None
    media_url: str | None = Field(default=None, description="Short-lived signed link to the photo/voice/video")
    media_type: str | None = Field(default=None, examples=["image/jpeg"])
    sent_at: datetime


class ThanksPage(BaseModel):
    """What the recipient sees on /thanks/{token}: enough to know who to thank, nothing more."""

    recipient_name: str
    gift_from: str | None
    items: list[str] = Field(description="Product names in this delivery")
    already_sent: bool


class FulfillmentRead(BaseModel):
    id: uuid.UUID
    vendor_name: str
    status: FulfillmentStatus
    delivery_date: date
    delivery_slot: str | None
    recipient_name: str
    recipient_phone: str
    address_line1: str
    city_name: str
    city_timezone: str = Field(
        default="Asia/Karachi", description="IANA zone of the delivery city; times are shown in it first"
    )
    courier_tracking: str | None
    dispatched_at: datetime | None
    delivered_at: datetime | None
    delivery_photo_url: str | None = Field(
        default=None, description="Short-lived signed link to the proof-of-delivery photo"
    )
    received_by: str | None = Field(default=None, description="Who accepted the gift at the door")
    thanks: ThanksRead | None = Field(default=None, description="The recipient's thank-you, once they send one")


class OrderItemRead(BaseModel):
    id: uuid.UUID
    product_name: str
    product_image_url: str | None = Field(
        default=None, description="The product's primary photo", examples=["https://cdn.example.com/cake.jpg"]
    )
    variant_name: str | None
    qty: int
    unit_price_pkr: int
    line_total_pkr: int
    greeting_message: str | None
    has_note: bool = Field(default=False, description="A voice/video note is attached to this item's card")
    note_content_type: str | None = Field(default=None, examples=["audio/mp4"])
    can_edit_note: bool = Field(
        default=False, description="The note can still be added or replaced (the card isn't printed yet)"
    )
    bucket_contents: list[str] = Field(
        default_factory=list,
        description="For a build-your-own hamper or bouquet: what goes in it",
        examples=[["6 × Red Rose (stem)", "1 × Kraft Paper Wrap"]],
    )


class CardNoteRead(BaseModel):
    """What the recipient sees after scanning the card's QR code."""

    media_url: str = Field(description="Short-lived signed link to the recording")
    content_type: str = Field(examples=["video/mp4"])
    greeting_message: str | None
    product_name: str


NoteReportReason = Literal["abusive", "threatening", "sexual", "hateful", "unwanted", "other"]


class NoteReportRead(BaseModel):
    id: uuid.UUID
    reason: str = Field(examples=["abusive"])
    details: str | None
    status: str = Field(examples=["open"], description="open | note_disabled | dismissed")
    created_at: datetime


class ReportedNoteRead(BaseModel):
    """Admin: a reported card note with everything needed to decide on it."""

    item_id: uuid.UUID
    order_id: uuid.UUID
    public_token: uuid.UUID = Field(description="Opens the order's tracking page")
    product_name: str
    greeting_message: str | None
    content_type: str | None
    media_url: str | None = Field(description="Short-lived signed link so staff can listen")
    consent_at: datetime | None
    consent_ip: str | None
    disabled_at: datetime | None
    last_reported_at: datetime
    reports: list[NoteReportRead]


class CardNoteReportCreate(BaseModel):
    """A report from someone who opened a card note."""

    reason: NoteReportReason = Field(examples=["abusive"])
    details: str | None = Field(default=None, max_length=1000, examples=["I don't know the sender"])


class OrderRead(BaseModel):
    id: uuid.UUID
    public_token: uuid.UUID
    status: OrderStatus
    currency: str
    total_charged: int = Field(description="Total in the charge currency's minor unit")
    subtotal_pkr: int
    delivery_pkr: int
    discount_pkr: int
    total_pkr: int
    placed_at: datetime
    items: list[OrderItemRead]
    fulfillments: list[FulfillmentRead]
    payment_method: PaymentMethod | None
    surprise: bool = False
    gift_from: str | None = None
    source: OrderSource = Field(default=OrderSource.web, description="Where the order came from (ADR 0009)")
    customer_confirmed_at: datetime | None = None
    needs_confirmation: bool = Field(
        default=False,
        description="Taken by staff from a chat; the buyer must check and confirm it on the order link page",
    )


class AdminOrderSummary(BaseModel):
    id: uuid.UUID
    public_token: uuid.UUID
    status: OrderStatus
    next_statuses: list[OrderStatus] = Field(description="Statuses staff may move this order to", examples=[["preparing", "cancelled", "refunded", "on_hold"]])
    user_id: uuid.UUID | None
    total_pkr: int
    currency: str
    placed_at: datetime
    payment_method: str | None
    payment_status: str | None
    proof_url: str | None = Field(description="Short-lived signed link; the receipt bucket is private")
    source: str
    buyer_name: str | None
    buyer_phone: str | None
    recipients: list[str] = Field(examples=[["Ammi (Lahore)"]])
    delivery_date: date | None = Field(description="Earliest delivery date across the order's recipients")
    customer_confirmed_at: datetime | None


class AdminOrderPage(BaseModel):
    items: list[AdminOrderSummary]
    total: int = Field(examples=[134])
    offset: int
    limit: int


class StaffNoteCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000, examples=["Buyer called: deliver after 5pm, gate code 4412."])


class StaffNoteRead(BaseModel):
    id: uuid.UUID
    body: str
    author_name: str | None = Field(description="Staff name, else email; null if the account was deleted")
    created_at: datetime


class AdminFulfillmentRead(FulfillmentRead):
    address_line2: str | None
    landmark: str | None
    vendor_phone: str | None = Field(description="Shop contact number, to chase a delivery")


class AdminOrderItemRead(OrderItemRead):
    customization: dict[str, object] | None


class AdminPaymentRead(BaseModel):
    method: PaymentMethod
    status: str = Field(examples=["awaiting_verification"])
    amount_pkr: int
    amount_charged: int
    currency: str
    proof_url: str | None = Field(description="Short-lived signed link; the receipt bucket is private")
    provider_ref: str | None
    verified_at: datetime | None


class OrderEvent(BaseModel):
    at: datetime
    label: str = Field(examples=["Status: paid → preparing"])
    by: str | None = Field(default=None, description="Who did it, when it was a person")


class AdminOrderDetail(OrderRead):
    """Everything staff need on one order. Extends the buyer-facing order with contact
    details, payment, internal notes and a timeline."""

    items: list[AdminOrderItemRead]  # type: ignore[assignment]
    fulfillments: list[AdminFulfillmentRead]  # type: ignore[assignment]
    user_id: uuid.UUID | None
    next_statuses: list[OrderStatus] = Field(description="Statuses staff may move this order to")
    buyer_name: str | None
    buyer_email: str | None
    buyer_phone: str | None
    buyer_note: str | None = Field(description="What the buyer wrote at checkout")
    coupon_code: str | None
    source_ref: str | None = Field(examples=["@sara.uk"])
    campaign: str | None
    taken_by: str | None = Field(description="Staff who entered a DM/WhatsApp order")
    payment: AdminPaymentRead | None
    staff_notes: list[StaffNoteRead]
    timeline: list[OrderEvent] = Field(description="Oldest first")
