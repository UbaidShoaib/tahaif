import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field, model_validator


class MonthDay(BaseModel):
    """A yearly date without a year (birthdays, anniversaries). 29 Feb is allowed."""

    month: int = Field(ge=1, le=12, examples=[3])
    day: int = Field(ge=1, le=31, examples=[12])

    @model_validator(mode="after")
    def _real_date(self) -> "MonthDay":
        try:
            date(2000, self.month, self.day)  # a leap year, so 29 Feb is valid
        except ValueError as exc:
            raise ValueError("Not a real date") from exc
        return self


_RELATIONSHIP = Field(
    default=None, max_length=40, description="Who they are to you", examples=["Ammi"]
)


class AddressCreate(BaseModel):
    recipient_name: str = Field(max_length=255)
    recipient_phone: str = Field(max_length=30)
    line1: str
    line2: str | None = None
    city_name: str = Field(max_length=100)
    landmark: str | None = None
    alt_phone: str | None = Field(default=None, max_length=30)
    is_default: bool = False
    relationship: str | None = _RELATIONSHIP
    birthday: MonthDay | None = None
    anniversary: MonthDay | None = None


class AddressUpdate(BaseModel):
    recipient_name: str | None = Field(default=None, max_length=255)
    recipient_phone: str | None = Field(default=None, max_length=30)
    line1: str | None = None
    line2: str | None = None
    city_name: str | None = Field(default=None, max_length=100)
    landmark: str | None = None
    alt_phone: str | None = Field(default=None, max_length=30)
    is_default: bool | None = None
    relationship: str | None = _RELATIONSHIP
    birthday: MonthDay | None = None
    anniversary: MonthDay | None = None


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
    relationship: str | None = None
    birthday: MonthDay | None = None
    anniversary: MonthDay | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


def address_columns(data: dict[str, object]) -> dict[str, object]:
    """Map the API's nested fields (relationship, birthday, anniversary) to the
    table's flat columns. Keys absent from `data` are left untouched; an explicit
    null clears the value."""
    out = {k: v for k, v in data.items() if k not in ("relationship", "birthday", "anniversary")}
    if "relationship" in data:
        rel = data["relationship"]
        out["relationship_label"] = rel.strip() or None if isinstance(rel, str) else None
    for name in ("birthday", "anniversary"):
        if name in data:
            md = data[name]
            month = md.get("month") if isinstance(md, dict) else None
            day = md.get("day") if isinstance(md, dict) else None
            out[f"{name}_month"], out[f"{name}_day"] = month, day
    return out


def address_read(a: object) -> AddressRead:
    """AddressRead from the ORM row, rebuilding the nested occasion fields."""
    def md(prefix: str) -> MonthDay | None:
        month, day = getattr(a, f"{prefix}_month"), getattr(a, f"{prefix}_day")
        return MonthDay(month=month, day=day) if month and day else None

    return AddressRead(
        id=a.id,  # type: ignore[attr-defined]
        recipient_name=a.recipient_name,  # type: ignore[attr-defined]
        recipient_phone=a.recipient_phone,  # type: ignore[attr-defined]
        line1=a.line1,  # type: ignore[attr-defined]
        line2=a.line2,  # type: ignore[attr-defined]
        city_name=a.city_name,  # type: ignore[attr-defined]
        landmark=a.landmark,  # type: ignore[attr-defined]
        alt_phone=a.alt_phone,  # type: ignore[attr-defined]
        is_default=a.is_default,  # type: ignore[attr-defined]
        relationship=a.relationship_label,  # type: ignore[attr-defined]
        birthday=md("birthday"),
        anniversary=md("anniversary"),
        created_at=a.created_at,  # type: ignore[attr-defined]
    )
