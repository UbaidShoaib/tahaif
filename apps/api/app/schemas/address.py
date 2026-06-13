import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class AddressCreate(BaseModel):
    recipient_name: str = Field(max_length=255)
    recipient_phone: str = Field(max_length=30)
    line1: str
    line2: str | None = None
    city_name: str = Field(max_length=100)
    landmark: str | None = None
    alt_phone: str | None = Field(default=None, max_length=30)
    is_default: bool = False


class AddressUpdate(BaseModel):
    recipient_name: str | None = Field(default=None, max_length=255)
    recipient_phone: str | None = Field(default=None, max_length=30)
    line1: str | None = None
    line2: str | None = None
    city_name: str | None = Field(default=None, max_length=100)
    landmark: str | None = None
    alt_phone: str | None = Field(default=None, max_length=30)
    is_default: bool | None = None


class AddressRead(BaseModel):
    id: uuid.UUID
    recipient_name: str
    recipient_phone: str
    line1: str
    line2: str | None
    city_name: str
    landmark: str | None
    alt_phone: str | None
    is_default: bool
    created_at: datetime

    model_config = {"from_attributes": True}
