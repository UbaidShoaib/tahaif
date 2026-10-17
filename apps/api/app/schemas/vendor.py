import re
import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

from app.models.catalog import VendorApprovalStatus, VendorDocumentKind
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
    thanks_token: uuid.UUID | None = Field(
        default=None, description="Print a QR code to /thanks/{thanks_token} on the card"
    )
    surprise: bool = Field(
        default=False, description="Surprise gift: don't call the recipient ahead, and include no receipt or price"
    )


# ── Vendor applications ───────────────────────────────────────────────────────

_PK_IBAN = re.compile(r"PK\d{2}[A-Z]{4}\d{16}")

class VendorApplicationCreate(BaseModel):
    name: str = Field(min_length=2, max_length=255, examples=["Gulberg Florist"])
    city_id: uuid.UUID
    contact_phone: str = Field(
        min_length=7, max_length=30, pattern=r"^\+?[\d\s()-]+$", examples=["+92 300 1234567"]
    )
    description: str | None = Field(
        default=None, max_length=2000, examples=["Hand-tied bouquets, delivered same day in Lahore."]
    )
    bank_account_title: str = Field(min_length=2, max_length=255, examples=["Gulberg Florist"])
    bank_name: str = Field(min_length=2, max_length=100, examples=["Meezan Bank"])
    bank_iban: str = Field(
        description="Pakistani IBAN, 24 characters; spaces are ignored", examples=["PK36SCBL0000001123456702"]
    )

    @field_validator("bank_iban")
    @classmethod
    def _normalise_iban(cls, v: str) -> str:
        iban = re.sub(r"\s+", "", v).upper()
        if not _PK_IBAN.fullmatch(iban):
            raise ValueError("Enter a Pakistani IBAN: PK, 2 digits, 4-letter bank code, then 16 digits")
        return iban


class VendorDocumentRead(BaseModel):
    id: uuid.UUID
    kind: VendorDocumentKind = Field(examples=["cnic_front"])
    filename: str = Field(examples=["cnic-front.jpg"])
    content_type: str = Field(examples=["image/jpeg"])
    created_at: datetime
    url: str | None = Field(default=None, description="Short-lived link; staff only")


class VendorApplicationRead(BaseModel):
    """A shop application as its applicant sees it."""
    id: uuid.UUID
    name: str
    slug: str
    city_id: uuid.UUID
    city_name: str
    contact_phone: str | None
    description: str | None
    status: VendorApprovalStatus = Field(examples=["pending"])
    review_note: str | None = Field(default=None, description="Staff's reason when rejected")
    created_at: datetime
    reviewed_at: datetime | None
    bank_account_title: str | None = None
    bank_name: str | None = None
    bank_iban: str | None = None
    documents: list[VendorDocumentRead] = Field(default_factory=list)
    missing_documents: list[VendorDocumentKind] = Field(
        default_factory=list, description="Required documents not yet uploaded; staff cannot approve until empty"
    )


class AdminVendorApplicationRead(VendorApplicationRead):
    applicant_email: str
    applicant_name: str | None


class VendorApplicationReject(BaseModel):
    note: str | None = Field(default=None, max_length=1000, examples=["We are not onboarding bakeries yet."])


class AdminProductRead(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    vendor_name: str
    base_price_pkr: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    image_url: str | None = Field(default=None, description="Main photo, for the list thumbnail")
