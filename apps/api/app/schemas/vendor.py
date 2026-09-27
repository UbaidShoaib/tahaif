import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models.order import FulfillmentStatus, OrderStatus, PaymentMethod


class FulfillmentStatusUpdate(BaseModel):
    status: FulfillmentStatus
    courier_tracking: str | None = Field(default=None, max_length=255)


class VendorLineItem(BaseModel):
    """One product in a fulfillment, with the card to print for it."""
    product_name: str
    variant_name: str | None
    qty: int
    greeting_message: str | None = Field(
        default=None, description="Buyer's card message, printed and sent with this item"
    )
    note_token: uuid.UUID | None = Field(
        default=None, description="Print a QR code to /note/{note_token} on the card when set"
    )


class VendorFulfillmentRead(BaseModel):
    """Fulfillment enriched with order context — used in the vendor portal."""
    id: uuid.UUID
    order_id: uuid.UUID
    public_token: uuid.UUID
    order_status: OrderStatus
    payment_method: PaymentMethod | None
    status: FulfillmentStatus
    delivery_date: date
    delivery_slot: str | None
    recipient_name: str
    recipient_phone: str
    address_line1: str
    address_line2: str | None
    city_name: str
    landmark: str | None
    courier_tracking: str | None
    dispatched_at: datetime | None
    delivered_at: datetime | None
    delivery_photo_url: str | None = None
    received_by: str | None = None
    item_count: int
    subtotal_pkr: int
    items: list[VendorLineItem] = Field(default_factory=list)
    surprise: bool = Field(
        default=False, description="Surprise gift: don't call the recipient ahead, and include no receipt or price"
    )
