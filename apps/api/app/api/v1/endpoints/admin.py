"""Admin API: order management, payment verification, product CRUD, FX override, coupons, users."""

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Header, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.deps import DB, require_roles
from app.models.catalog import FxRate, FxRateSource, VendorApprovalStatus
from app.models.loyalty import Coupon, CouponType
from app.models.order import OrderSource, OrderStatus, PaymentStatus
from app.models.user import User, UserRole
from app.repositories.loyalty_repository import CouponRepository
from app.repositories.order_repository import OrderRepository
from app.repositories.user_repository import UserRepository
from app.schemas.catalog import ProductRead
from app.schemas.order import AdminOrderPage, ReportedNoteRead
from app.schemas.report import CampaignSalesReport
from app.schemas.social_order import (
    AssistedOrderCreate,
    AssistedOrderRead,
    MessageKind,
    WhatsAppMessageRead,
    WhatsAppQueueEntry,
)
from app.schemas.vendor import (
    AdminProductRead,
    AdminVendorApplicationRead,
    VendorApplicationReject,
)
from app.services import (
    admin_order_service,
    catalog_service,
    note_service,
    report_service,
    social_order_service,
    vendor_application_service,
)

AdminUser = Annotated[User, require_roles(UserRole.admin, UserRole.staff)]

router = APIRouter(prefix="/admin", tags=["admin"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class OrderStatusUpdate(BaseModel):
    status: OrderStatus


class PaymentVerify(BaseModel):
    verified: bool


class ProductActiveUpdate(BaseModel):
    is_active: bool


class FxRateOverride(BaseModel):
    quote_currency: str = Field(min_length=3, max_length=3)
    rate: Decimal = Field(gt=0)


class CouponCreate(BaseModel):
    code: str = Field(min_length=2, max_length=50)
    coupon_type: CouponType
    value: Decimal = Field(gt=0)
    min_order_pkr: int | None = None
    usage_limit: int | None = None
    ends_at: datetime | None = None


# ── Orders ────────────────────────────────────────────────────────────────────

@router.get("/orders", response_model=AdminOrderPage)
async def list_orders(
    _admin: AdminUser,
    db: DB,
    status: OrderStatus | None = None,
    q: str | None = Query(  # noqa: B008
        default=None,
        max_length=100,
        description="Order code (as on the receipt, e.g. 3F9A2C1B), any buyer or recipient phone "
        "in any format, buyer name or email, or recipient name",
        examples=["0300 1234567"],
    ),
    placed_from: date | None = Query(default=None, description="First day, Pakistan time"),  # noqa: B008
    placed_to: date | None = Query(default=None, description="Last day (inclusive), Pakistan time"),  # noqa: B008
    offset: int = Query(default=0, ge=0),  # noqa: B008
    limit: int = Query(default=50, ge=1, le=100),  # noqa: B008
) -> AdminOrderPage:
    return await admin_order_service.list_orders(
        db, status=status, q=q, placed_from=placed_from, placed_to=placed_to, offset=offset, limit=limit
    )


@router.patch("/orders/{order_id}/status")
async def update_order_status(
    order_id: uuid.UUID,
    body: OrderStatusUpdate,
    _admin: AdminUser,
    db: DB,
) -> dict[str, Any]:
    repo = OrderRepository(db)
    order = await repo.get_by_id(order_id)
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    order.status = body.status
    await db.flush()
    return {"id": str(order.id), "status": order.status}


@router.post("/orders/{order_id}/verify-payment")
async def verify_payment(
    order_id: uuid.UUID,
    body: PaymentVerify,
    admin: AdminUser,
    db: DB,
) -> dict[str, Any]:
    repo = OrderRepository(db)
    order = await repo.get_by_id(order_id)
    if not order or not order.payments:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    payment = order.payments[0]
    now = datetime.now(UTC)

    if body.verified:
        payment.status = PaymentStatus.paid
        payment.verified_by = admin.id
        payment.verified_at = now
        order.status = OrderStatus.paid
    else:
        payment.status = PaymentStatus.failed

    await db.flush()
    return {"payment_status": payment.status, "order_status": order.status}


# ── Orders from Instagram / WhatsApp chats (ADR 0009) ─────────────────────────


@router.post("/orders/assisted", response_model=AssistedOrderRead, status_code=status.HTTP_201_CREATED)
async def create_assisted_order(
    body: AssistedOrderCreate,
    admin: AdminUser,
    db: DB,
    idempotency_key: Annotated[str | None, Header(alias="idempotency-key")] = None,
) -> AssistedOrderRead:
    """Place an order for a customer who ordered in an Instagram DM or WhatsApp chat.

    Goes through normal checkout: same prices, city availability, cutoffs and
    coupons. Email is optional. 409 when this buyer already has a live order
    to the same recipient that day (resend with `allow_duplicate: true`).
    COD is refused for surprise gifts. The response includes the WhatsApp
    messages to send, starting with the order summary and its confirm link.
    """
    return await social_order_service.create_assisted_order(db, admin, body, idempotency_key)


@router.get("/orders/{order_id}/whatsapp", response_model=list[WhatsAppMessageRead])
async def order_whatsapp_messages(order_id: uuid.UUID, _admin: AdminUser, db: DB) -> list[WhatsAppMessageRead]:
    """Every WhatsApp message for this order as a wa.me link, with which are due and which were sent."""
    return await social_order_service.order_messages(db, order_id)


@router.post("/orders/{order_id}/whatsapp/{kind}/sent", response_model=WhatsAppMessageRead)
async def mark_whatsapp_sent(
    order_id: uuid.UUID, kind: MessageKind, admin: AdminUser, db: DB
) -> WhatsAppMessageRead:
    """Record that this message was sent by hand, so it leaves the queue. Repeats are harmless."""
    return await social_order_service.mark_sent(db, admin, order_id, kind)


@router.get("/whatsapp/queue", response_model=list[WhatsAppQueueEntry])
async def whatsapp_queue(
    _admin: AdminUser, db: DB, source: OrderSource | None = None
) -> list[WhatsAppQueueEntry]:
    """Messages to send: every WhatsApp message due on open orders from the last 30 days, oldest first."""
    return await social_order_service.queue(db, source)


@router.get("/reports/campaigns", response_model=CampaignSalesReport)
async def campaign_sales_report(
    _admin: AdminUser, db: DB, days: Annotated[int, Query(ge=1, le=365)] = 30
) -> CampaignSalesReport:
    """Sales by channel and reel/campaign over the last `days` days. "Paid" means the
    order moved past payment; revenue counts only those. Cancelled/refunded excluded."""
    return await report_service.campaign_sales(db, days)


# ── Card note reports (ADR 0010) ──────────────────────────────────────────────

@router.get("/note-reports", response_model=list[ReportedNoteRead])
async def list_note_reports(
    _admin: AdminUser,
    db: DB,
    status: Annotated[str, Query(pattern="^(open|all)$")] = "open",
) -> list[ReportedNoteRead]:
    """Reported voice/video notes, most recently reported first. `status=open` (default)
    is the review queue; `all` includes notes already handled."""
    return await note_service.list_reported_notes(db, status)


@router.post("/note-reports/{item_id}/disable", status_code=status.HTTP_204_NO_CONTENT)
async def disable_reported_note(item_id: uuid.UUID, admin: AdminUser, db: DB) -> None:
    """Take the note down: the card's QR link stops playing it. The recording is kept
    as evidence. Closes the open reports as `note_disabled`."""
    await note_service.resolve_reports(db, admin, item_id, disable=True)


@router.post("/note-reports/{item_id}/dismiss", status_code=status.HTTP_204_NO_CONTENT)
async def dismiss_note_reports(item_id: uuid.UUID, admin: AdminUser, db: DB) -> None:
    """Nothing wrong with the note: close its open reports as `dismissed`."""
    await note_service.resolve_reports(db, admin, item_id, disable=False)


@router.post("/note-reports/{item_id}/restore", status_code=status.HTTP_204_NO_CONTENT)
async def restore_reported_note(item_id: uuid.UUID, admin: AdminUser, db: DB) -> None:
    """Undo a take-down: the QR link plays the note again."""
    await note_service.restore_note(db, admin, item_id)


# ── Vendor applications ───────────────────────────────────────────────────────

@router.get("/vendor-applications", response_model=list[AdminVendorApplicationRead])
async def list_vendor_applications(
    _admin: AdminUser,
    db: DB,
    status: VendorApprovalStatus | None = None,
) -> list[AdminVendorApplicationRead]:
    """Shop applications, newest first. Filter with `status=pending` for the review queue."""
    return await vendor_application_service.list_applications(db, status)


@router.post("/vendor-applications/{vendor_id}/approve", response_model=AdminVendorApplicationRead)
async def approve_vendor_application(
    vendor_id: uuid.UUID, admin: AdminUser, db: DB
) -> AdminVendorApplicationRead:
    """Open the shop and give its owner the vendor role."""
    return await vendor_application_service.approve(db, admin, vendor_id)


@router.post("/vendor-applications/{vendor_id}/reject", response_model=AdminVendorApplicationRead)
async def reject_vendor_application(
    vendor_id: uuid.UUID, body: VendorApplicationReject, admin: AdminUser, db: DB
) -> AdminVendorApplicationRead:
    """Turn the application down; the note is shown to the applicant, who may apply again."""
    return await vendor_application_service.reject(db, admin, vendor_id, body.note)


# ── Products ──────────────────────────────────────────────────────────────────

@router.get("/products", response_model=list[AdminProductRead])
async def list_products(
    _admin: AdminUser,
    db: DB,
    is_active: bool | None = None,
    q: str | None = Query(default=None, max_length=100, examples=["roses"]),  # noqa: B008
    vendor_id: uuid.UUID | None = None,
) -> list[AdminProductRead]:
    """Every product, hidden ones included. `is_active=false` lists what is waiting to be published;
    `q` matches the name or URL name."""
    products = await catalog_service.list_admin_products(db, is_active, q=q, vendor_id=vendor_id)
    return [
        AdminProductRead(
            id=p.id, name=p.name, slug=p.slug, vendor_name=p.vendor.name,
            base_price_pkr=p.base_price_pkr, is_active=p.is_active,
            created_at=p.created_at, updated_at=p.updated_at,
            image_url=next((i.url for i in p.images if i.is_primary), p.images[0].url if p.images else None),
        )
        for p in products
    ]


@router.get("/products/{product_id}", response_model=ProductRead)
async def get_product(product_id: uuid.UUID, _admin: AdminUser, db: DB) -> ProductRead:
    """One product for the editor, hidden or live."""
    return ProductRead.model_validate(await catalog_service.get_admin_product(db, product_id))


@router.patch("/products/{product_id}/active")
async def set_product_active(
    product_id: uuid.UUID,
    body: ProductActiveUpdate,
    _admin: AdminUser,
    db: DB,
) -> dict[str, Any]:
    product = await catalog_service.set_product_active(db, product_id, body.is_active)
    return {"id": str(product.id), "is_active": product.is_active}


# ── FX rates ──────────────────────────────────────────────────────────────────

@router.get("/fx-rates")
async def list_fx_rates(_admin: AdminUser, db: DB) -> list[dict[str, Any]]:
    result = await db.execute(select(FxRate).order_by(FxRate.quote_currency))
    return [
        {
            "id": str(r.id),
            "quote_currency": r.quote_currency,
            "rate": str(r.rate),
            "source": r.source,
            "fetched_at": r.fetched_at.isoformat(),
        }
        for r in result.scalars().all()
    ]


@router.post("/fx-rates/override")
async def override_fx_rate(body: FxRateOverride, admin: AdminUser, db: DB) -> dict[str, Any]:
    existing = (await db.execute(
        select(FxRate).where(
            FxRate.base_currency == "PKR",
            FxRate.quote_currency == body.quote_currency.upper(),
            FxRate.source == FxRateSource.manual,
        )
    )).scalar_one_or_none()

    now = datetime.now(UTC)
    if existing:
        existing.rate = body.rate
        existing.fetched_at = now
        existing.set_by = admin.id
    else:
        db.add(FxRate(
            base_currency="PKR",
            quote_currency=body.quote_currency.upper(),
            rate=body.rate,
            source=FxRateSource.manual,
            set_by=admin.id,
            fetched_at=now,
        ))
    await db.flush()
    return {"quote_currency": body.quote_currency.upper(), "rate": str(body.rate), "source": "manual"}


# ── Coupons ───────────────────────────────────────────────────────────────────

@router.get("/coupons")
async def list_coupons(_admin: AdminUser, db: DB) -> list[dict[str, Any]]:
    result = await db.execute(select(Coupon).order_by(Coupon.created_at.desc()).limit(100))
    return [
        {
            "id": str(c.id),
            "code": c.code,
            "coupon_type": c.coupon_type,
            "value": str(c.value),
            "used_count": c.used_count,
            "usage_limit": c.usage_limit,
            "is_active": c.is_active,
            "ends_at": c.ends_at.isoformat() if c.ends_at else None,
        }
        for c in result.scalars().all()
    ]


@router.post("/coupons", status_code=status.HTTP_201_CREATED)
async def create_coupon(body: CouponCreate, _admin: AdminUser, db: DB) -> dict[str, Any]:
    repo = CouponRepository(db)
    coupon = await repo.create(
        code=body.code.upper(),
        coupon_type=body.coupon_type,
        value=body.value,
        min_order_pkr=body.min_order_pkr,
        usage_limit=body.usage_limit,
        ends_at=body.ends_at,
    )
    return {"id": str(coupon.id), "code": coupon.code}


@router.patch("/coupons/{coupon_id}/active")
async def set_coupon_active(
    coupon_id: uuid.UUID,
    body: ProductActiveUpdate,
    _admin: AdminUser,
    db: DB,
) -> dict[str, Any]:
    result = await db.execute(select(Coupon).where(Coupon.id == coupon_id))
    coupon = result.scalar_one_or_none()
    if not coupon:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Coupon not found")
    coupon.is_active = body.is_active
    await db.flush()
    return {"id": str(coupon.id), "is_active": coupon.is_active}


# ── Users ─────────────────────────────────────────────────────────────────────

@router.get("/users")
async def list_users(_admin: AdminUser, db: DB, limit: int = 50) -> list[dict[str, Any]]:
    result = await db.execute(
        select(User).where(User.is_active.is_(True)).order_by(User.created_at.desc()).limit(limit)
    )
    return [
        {
            "id": str(u.id),
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role,
            "is_verified": u.is_verified,
            "created_at": u.created_at.isoformat(),
        }
        for u in result.scalars().all()
    ]


@router.patch("/users/{user_id}/role")
async def update_user_role(
    user_id: uuid.UUID,
    role: UserRole,
    admin: AdminUser,
    db: DB,
) -> dict[str, Any]:
    if admin.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can change roles")
    repo = UserRepository(db)
    user = await repo.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    await repo.update(user, role=role)
    return {"id": str(user.id), "role": user.role}
