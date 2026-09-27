import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

from app.models.user import UserRole


class UserRead(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str | None
    role: UserRole
    locale: str
    currency_pref: str
    avatar_url: str | None
    is_verified: bool
    country: str | None = None
    occasion_reminders: bool = True
    created_at: datetime

    model_config = {"from_attributes": True}


# Must match fx_service.SUPPORTED_CURRENCIES (asserted in tests).
CurrencyCode = Literal["PKR", "USD", "GBP", "EUR", "CAD", "AUD", "AED", "SAR"]


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=255)
    locale: str | None = None
    currency_pref: CurrencyCode | None = None
    avatar_url: str | None = None
    country: str | None = Field(
        default=None, pattern=r"^[A-Z]{2}$", description="Where you live (ISO country code)", examples=["GB"]
    )
    occasion_reminders: bool | None = Field(default=None, description="Birthday, anniversary, Eid and Mother's Day reminders")
