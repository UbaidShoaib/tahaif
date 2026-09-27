import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, EmailStr, Field

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
    coupon_code: str | None = Field(default=None, max_length=50)
    use_loyalty_points: bool = False
    # Required for guest checkout (no signed-in user); ignored for signed-in buyers. ADR 0004.
    contact_email: EmailStr | None = None
    contact_phone: str | None = Field(default=None, min_length=7, max_length=30)


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
    coupon_code: str | None = None
    coupon_discount_pkr: int = 0
    loyalty_points_used: int = 0
    loyalty_discount_pkr: int = 0
    discount_pkr: int = 0
    total_pkr: int
    currency: str = Field(default="PKR", description="Currency the order will be charged in")
    fx_rate: Decimal = Field(default=Decimal("1"), description="PKR→currency rate used for the charge")
    total_charged: int = Field(default=0, description="Total in the charge currency's minor unit")


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
    total_charged: int = Field(description="Total in the charge currency's minor unit")
    subtotal_pkr: int
    delivery_pkr: int
    discount_pkr: int
    total_pkr: int
    placed_at: datetime
    items: list[OrderItemRead]
    fulfillments: list[FulfillmentRead]
    payment_method: PaymentMethod | None
