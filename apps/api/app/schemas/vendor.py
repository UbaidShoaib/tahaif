import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models.order import FulfillmentStatus, OrderStatus, PaymentMethod


class FulfillmentStatusUpdate(BaseModel):
    status: FulfillmentStatus
    courier_tracking: str | None = Field(default=None, max_length=255)


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
    item_count: int
    subtotal_pkr: int
