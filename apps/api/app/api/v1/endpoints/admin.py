"""Admin API: order management, payment verification, product CRUD, FX override, coupons, users."""

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.deps import DB, require_roles
from app.models.catalog import FxRate, FxRateSource, VendorApprovalStatus
from app.models.loyalty import Coupon, CouponType
from app.models.order import OrderSource, OrderStatus
from app.models.user import User, UserRole
from app.repositories.loyalty_repository import CouponRepository
from app.repositories.user_repository import UserRepository
from app.schemas.audit import AuditPage
from app.schemas.bucket import (
    AdminBuilderConfig,
    AdminBuilderSummary,
    BuilderComponentCreate,
    BuilderComponentUpdate,
    BuilderSettingsUpdate,
)
from app.schemas.catalog import AdminProductDetail
from app.schemas.order import (
    AdminOrderDetail,
    AdminOrderPage,
    ReportedNoteRead,
    StaffNoteCreate,
    StaffNoteRead,
)
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
    audit_service,
    builder_admin_service,
    catalog_service,
    note_service,
    report_service,
    social_order_service,
    vendor_application_service,
    whatsapp_bot_service,
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


@router.get("/orders/{order_id}", response_model=AdminOrderDetail)
async def get_order(order_id: uuid.UUID, _admin: AdminUser, db: DB) -> AdminOrderDetail:
    """One order with everything staff need: buyer contact, each recipient's full address and shop,
    payment and receipt, internal notes and a timeline."""
    return await admin_order_service.get_order_detail(db, order_id)


@router.post(
    "/orders/{order_id}/notes", response_model=StaffNoteRead, status_code=status.HTTP_201_CREATED
)
async def add_order_note(
    order_id: uuid.UUID, body: StaffNoteCreate, admin: AdminUser, db: DB
) -> StaffNoteRead:
    """Add an internal note. Never shown to the buyer or recipient; notes can't be edited or deleted."""
    return await admin_order_service.add_staff_note(db, order_id, admin, body.body)


@router.patch("/orders/{order_id}/status", responses={409: {"description": "That status change isn't allowed from the current status"}})
async def update_order_status(
    order_id: uuid.UUID,
    body: OrderStatusUpdate,
    admin: AdminUser,
    db: DB,
) -> dict[str, Any]:
    order = await admin_order_service.set_status(db, admin, order_id, body.status)
    return {"id": str(order.id), "status": order.status}


@router.post("/orders/{order_id}/verify-payment")
async def verify_payment(
    order_id: uuid.UUID,
    body: PaymentVerify,
    admin: AdminUser,
    db: DB,
    background: BackgroundTasks,
) -> dict[str, Any]:
    order = await admin_order_service.verify_payment(db, admin, order_id, body.verified)
    # Orders placed in the WhatsApp bot hear back in the chat (ADR 0013), once committed.
    if notice := whatsapp_bot_service.payment_notice(order, body.verified):
        to, replies = notice
        background.add_task(whatsapp_bot_service.send_payment_notice, order.id, to, replies, body.verified)
    return {"payment_status": order.payments[0].status, "order_status": order.status}


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


@router.get("/products/{product_id}", response_model=AdminProductDetail)
async def get_product(product_id: uuid.UUID, _admin: AdminUser, db: DB) -> AdminProductDetail:
    """One product for the editor, hidden or live, with its occasions."""
    return AdminProductDetail.model_validate(await catalog_service.get_admin_product(db, product_id))


@router.patch("/products/{product_id}/active")
async def set_product_active(
    product_id: uuid.UUID,
    body: ProductActiveUpdate,
    admin: AdminUser,
    db: DB,
) -> dict[str, Any]:
    product = await catalog_service.set_product_active(db, product_id, body.is_active, admin)
    return {"id": str(product.id), "is_active": product.is_active}


# ── Build-your-own builders (ADR 0014) ──────────────────────────────────────

@router.get("/builders", response_model=list[AdminBuilderSummary])
async def list_builders(_admin: AdminUser, db: DB) -> list[AdminBuilderSummary]:
    """Every product set up as a builder, hidden ones included, with how many items buyers can add."""
    return await builder_admin_service.list_for_admin(db)


@router.get("/products/{product_id}/builder", response_model=AdminBuilderConfig)
async def get_builder_config(product_id: uuid.UUID, _admin: AdminUser, db: DB) -> AdminBuilderConfig:
    """The product's builder settings and items (an ordinary product has `builder_kind` null)."""
    return await builder_admin_service.get_config(db, product_id)


@router.put("/products/{product_id}/builder", response_model=AdminBuilderConfig)
async def update_builder_settings(
    product_id: uuid.UUID, body: BuilderSettingsUpdate, admin: AdminUser, db: DB
) -> AdminBuilderConfig:
    """Turn a product into a hamper or bouquet builder (or back), and set how many items it holds."""
    return await builder_admin_service.update_settings(db, admin, product_id, body)


@router.post(
    "/products/{product_id}/builder/components",
    response_model=AdminBuilderConfig,
    status_code=status.HTTP_201_CREATED,
    responses={409: {"description": "Not a builder yet, another shop's product, or already added"}},
)
async def add_builder_component(
    product_id: uuid.UUID, body: BuilderComponentCreate, admin: AdminUser, db: DB
) -> AdminBuilderConfig:
    """Let buyers put this product in the builder. It must be from the builder's own shop."""
    return await builder_admin_service.add_component(db, admin, product_id, body)


@router.patch("/products/{product_id}/builder/components/{component_id}", response_model=AdminBuilderConfig)
async def update_builder_component(
    product_id: uuid.UUID, component_id: uuid.UUID, body: BuilderComponentUpdate, admin: AdminUser, db: DB
) -> AdminBuilderConfig:
    """Change an item's role, most allowed, position in the list, or switch it off."""
    return await builder_admin_service.update_component(db, admin, product_id, component_id, body)


@router.delete("/products/{product_id}/builder/components/{component_id}", response_model=AdminBuilderConfig)
async def remove_builder_component(
    product_id: uuid.UUID, component_id: uuid.UUID, admin: AdminUser, db: DB
) -> AdminBuilderConfig:
    """Take the item out. Buckets already in carts keep their copy of it."""
    return await builder_admin_service.remove_component(db, admin, product_id, component_id)


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
    await audit_service.record(
        db, admin, "fx_rate.overridden", "fx_rate", body.quote_currency.upper(),
        before={"rate": existing.rate} if existing else None, after={"rate": body.rate},
    )
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
async def create_coupon(body: CouponCreate, admin: AdminUser, db: DB) -> dict[str, Any]:
    repo = CouponRepository(db)
    coupon = await repo.create(
        code=body.code.upper(),
        coupon_type=body.coupon_type,
        value=body.value,
        min_order_pkr=body.min_order_pkr,
        usage_limit=body.usage_limit,
        ends_at=body.ends_at,
    )
    await audit_service.record(
        db, admin, "coupon.created", "coupon", coupon.id,
        after={"code": coupon.code, **body.model_dump(exclude={"code"})},
    )
    return {"id": str(coupon.id), "code": coupon.code}


@router.patch("/coupons/{coupon_id}/active")
async def set_coupon_active(
    coupon_id: uuid.UUID,
    body: ProductActiveUpdate,
    admin: AdminUser,
    db: DB,
) -> dict[str, Any]:
    result = await db.execute(select(Coupon).where(Coupon.id == coupon_id))
    coupon = result.scalar_one_or_none()
    if not coupon:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Coupon not found")
    await audit_service.record(
        db, admin, "coupon.enabled" if body.is_active else "coupon.disabled", "coupon", coupon.id,
        before={"is_active": coupon.is_active}, after={"is_active": body.is_active}, context={"code": coupon.code},
    )
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
    await audit_service.record(
        db, admin, "user.role_changed", "user", user.id,
        before={"role": user.role}, after={"role": role}, context={"email": user.email},
    )
    await repo.update(user, role=role)
    return {"id": str(user.id), "role": user.role}


# ── Audit log ─────────────────────────────────────────────────────────────────

@router.get("/audit-log", response_model=AuditPage)
async def list_audit_log(
    admin: AdminUser,
    db: DB,
    entity: str | None = Query(default=None, examples=["order"]),  # noqa: B008
    entity_id: str | None = Query(default=None, max_length=255),  # noqa: B008
    actor_user_id: uuid.UUID | None = None,
    action: str | None = Query(  # noqa: B008
        default=None, max_length=100, description="Action or prefix, e.g. `payment.` or `product.updated`"
    ),
    offset: int = Query(default=0, ge=0),  # noqa: B008
    limit: int = Query(default=50, ge=1, le=100),  # noqa: B008
) -> AuditPage:
    """Who changed what in the back office, newest first. Admins only: it shows every staff
    member's actions and IP addresses."""
    if admin.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can see the activity log")
    return await audit_service.search(
        db, entity=entity, entity_id=entity_id, actor_user_id=actor_user_id, action=action, offset=offset, limit=limit
    )
