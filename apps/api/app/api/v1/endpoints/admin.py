"""Admin API: order management, payment verification, product CRUD, FX override, coupons, users."""

import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Header, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.deps import DB, require_roles
from app.models.catalog import FxRate, FxRateSource, VendorApprovalStatus
from app.models.loyalty import Coupon, CouponType
from app.models.order import Order, OrderSource, OrderStatus, PaymentStatus
from app.models.user import User, UserRole
from app.repositories.loyalty_repository import CouponRepository
from app.repositories.order_repository import OrderRepository
from app.repositories.user_repository import UserRepository
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
    catalog_service,
    proof_service,
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

@router.get("/orders")
async def list_orders(
    _admin: AdminUser,
    db: DB,
    status: OrderStatus | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    repo = OrderRepository(db)
    q = repo._with_relations()
    if status:
        q = q.where(Order.status == status)
    q = q.order_by(Order.placed_at.desc()).limit(limit)
    result = await db.execute(q)
    orders = list(result.scalars().unique().all())
    return [
        {
            "id": str(o.id),
            "public_token": str(o.public_token),
            "status": o.status,
            "user_id": str(o.user_id) if o.user_id else None,
            "total_pkr": o.total_pkr,
            "currency": o.currency,
            "placed_at": o.placed_at.isoformat(),
            "payment_method": o.payments[0].method if o.payments else None,
            "payment_status": o.payments[0].status if o.payments else None,
            # Short-lived signed link; the receipt bucket is private.
            "proof_url": proof_service.signed_proof_url(o.payments[0].proof_url) if o.payments else None,
            "source": o.source,
            "buyer_phone": social_order_service.buyer_phone(o),
            "customer_confirmed_at": o.customer_confirmed_at.isoformat() if o.customer_confirmed_at else None,
        }
        for o in orders
    ]


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
    _admin: AdminUser, db: DB, is_active: bool | None = None
) -> list[AdminProductRead]:
    """Every product, hidden ones included. `is_active=false` lists what is waiting to be published."""
    products = await catalog_service.list_admin_products(db, is_active)
    return [
        AdminProductRead(
            id=p.id, name=p.name, slug=p.slug, vendor_name=p.vendor.name,
            base_price_pkr=p.base_price_pkr, is_active=p.is_active, created_at=p.created_at,
        )
        for p in products
    ]


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
