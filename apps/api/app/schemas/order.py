import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models.order import FulfillmentStatus, OrderStatus, PaymentMethod


class CheckoutPlace(BaseModel):
    payment_method: PaymentMethod = PaymentMethod.cod
    delivery_city_id: uuid.UUID
    delivery_date: date
    recipient_name: str = Field(min_length=2, max_length=255)
    recipient_phone: str = Field(min_length=7, max_length=30)
    address_line1: str = Field(min_length=5, max_length=500)
    address_line2: str | None = None
    landmark: str | None = None
    notes: str | None = Field(default=None, max_length=500)


class QuoteLineItem(BaseModel):
    product_name: str
    variant_name: str | None
    qty: int
    unit_price_pkr: int
    line_total_pkr: int


class CheckoutQuote(BaseModel):
    items: list[QuoteLineItem]
    subtotal_pkr: int
    delivery_pkr: int
    total_pkr: int
    currency: str = "PKR"


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
    courier_tracking: str | None
    dispatched_at: datetime | None
    delivered_at: datetime | None


class OrderItemRead(BaseModel):
    id: uuid.UUID
    product_name: str
    variant_name: str | None
    qty: int
    unit_price_pkr: int
    line_total_pkr: int
    greeting_message: str | None


class OrderRead(BaseModel):
    id: uuid.UUID
    public_token: uuid.UUID
    status: OrderStatus
    currency: str
    subtotal_pkr: int
    delivery_pkr: int
    discount_pkr: int
    total_pkr: int
    placed_at: datetime
    items: list[OrderItemRead]
    fulfillments: list[FulfillmentRead]
    payment_method: PaymentMethod | None
