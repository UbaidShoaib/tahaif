"""Orders staff take from Instagram DMs and WhatsApp chats, and the hand-sent
WhatsApp messages that go with them (ADR 0009)."""

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

from app.models.order import OrderSource, PaymentMethod
from app.schemas.order import OrderRead

MessageKind = Literal[
    "order_summary",
    "payment_reminder",
    "payment_received",
    "dispatched",
    "out_for_delivery",
    "delivered",
    "recipient_on_the_way",
    "recipient_delivered",
]


class AssistedOrderItem(BaseModel):
    product_id: uuid.UUID
    variant_id: uuid.UUID | None = None
    qty: int = Field(default=1, ge=1, le=20)
    greeting_message: str | None = Field(default=None, max_length=500)


class AssistedOrderCreate(BaseModel):
    source: Literal[OrderSource.instagram, OrderSource.whatsapp, OrderSource.phone, OrderSource.walk_in]
    source_ref: str | None = Field(
        default=None, max_length=255, description="IG handle or chat reference", examples=["@sara.uk"]
    )
    campaign: str | None = Field(
        default=None, max_length=100, description="Reel/post that sold it", examples=["reel_eid_cakes"]
    )
    buyer_phone: str = Field(min_length=7, max_length=30, examples=["+447700900123"])
    buyer_email: EmailStr | None = None
    items: list[AssistedOrderItem] = Field(min_length=1, max_length=20)
    payment_method: Literal[PaymentMethod.cod, PaymentMethod.bank_transfer] = PaymentMethod.bank_transfer
    delivery_city_id: uuid.UUID
    delivery_date: date
    recipient_name: str = Field(min_length=2, max_length=255)
    recipient_phone: str = Field(min_length=7, max_length=30)
    address_line1: str = Field(min_length=5, max_length=500)
    address_line2: str | None = None
    landmark: str | None = None
    notes: str | None = Field(default=None, max_length=500)
    coupon_code: str | None = Field(default=None, max_length=50)
    surprise: bool = False
    gift_from: str | None = Field(default=None, max_length=80, examples=["Sara (London)"])
    allow_duplicate: bool = Field(
        default=False,
        description="Place it even though this buyer already has a live order to the same recipient that day",
    )


class WhatsAppMessageRead(BaseModel):
    kind: MessageKind
    label: str
    to: Literal["buyer", "recipient"] = Field(description="Who the message goes to")
    phone: str = Field(description="Their number, E.164", examples=["+923001234567"])
    text: str
    url: str = Field(description="wa.me link that opens the buyer's chat with the text filled in")
    due: bool = Field(description="Should be sent now")
    sent_at: datetime | None


class AssistedOrderRead(BaseModel):
    order: OrderRead
    messages: list[WhatsAppMessageRead]


class WhatsAppQueueEntry(BaseModel):
    order_id: uuid.UUID
    order_ref: str = Field(examples=["1A2B3C4D"])
    source: OrderSource
    buyer_phone: str = Field(description="Number this message goes to (the recipient's, for recipient messages)")
    placed_at: datetime
    message: WhatsAppMessageRead


class OrderConfirm(BaseModel):
    """The buyer checks the order on its link page and confirms it."""

    accept_terms: Literal[True] = Field(description="Accepted the terms and refund policy")
    marketing_opt_in: bool = Field(default=False, description="Separate, unticked by default: offers on WhatsApp/email")
    recipient_name: str | None = Field(default=None, min_length=2, max_length=255)
    recipient_phone: str | None = Field(default=None, min_length=7, max_length=30)
    address_line1: str | None = Field(default=None, min_length=5, max_length=500)
    address_line2: str | None = Field(default=None, max_length=500)
    landmark: str | None = Field(default=None, max_length=255)
