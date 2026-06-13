import uuid
from datetime import date

from pydantic import BaseModel, Field


class CartItemAdd(BaseModel):
    product_id: uuid.UUID
    variant_id: uuid.UUID | None = None
    qty: int = Field(default=1, ge=1, le=10)
    delivery_date: date | None = None
    greeting_message: str | None = Field(default=None, max_length=500)
    recipient_name: str | None = Field(default=None, max_length=255)
    recipient_phone: str | None = Field(default=None, max_length=30)


class CartItemUpdate(BaseModel):
    qty: int = Field(ge=0, le=10)
    delivery_date: date | None = None
    greeting_message: str | None = Field(default=None, max_length=500)
    recipient_name: str | None = Field(default=None, max_length=255)
    recipient_phone: str | None = Field(default=None, max_length=30)


class CartItemRead(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    product_name: str
    product_slug: str
    product_image: str | None
    variant_id: uuid.UUID | None
    variant_name: str | None
    qty: int
    unit_price_pkr: int
    line_total_pkr: int
    delivery_date: date | None
    greeting_message: str | None
    recipient_name: str | None
    recipient_phone: str | None


class CartRead(BaseModel):
    id: uuid.UUID | None
    item_count: int
    subtotal_pkr: int
    items: list[CartItemRead]
