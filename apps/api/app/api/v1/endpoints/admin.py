"""Admin API: order management, payment verification, product CRUD, FX override, coupons, users."""

import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.deps import DB, require_roles
from app.models.catalog import FxRate, FxRateSource
from app.models.loyalty import Coupon, CouponType
from app.models.order import Order, OrderStatus, PaymentStatus
from app.models.user import User, UserRole
from app.repositories.catalog_repository import ProductRepository
from app.repositories.loyalty_repository import CouponRepository
from app.repositories.order_repository import OrderRepository
from app.repositories.user_repository import UserRepository

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
) -> list[dict]:
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
            "proof_url": o.payments[0].proof_url if o.payments else None,
        }
        for o in orders
    ]


@router.patch("/orders/{order_id}/status")
async def update_order_status(
    order_id: uuid.UUID,
    body: OrderStatusUpdate,
    admin: AdminUser,
    db: DB,
) -> dict:
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
) -> dict:
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


# ── Products ──────────────────────────────────────────────────────────────────

@router.patch("/products/{product_id}/active")
async def set_product_active(
    product_id: uuid.UUID,
    body: ProductActiveUpdate,
    _admin: AdminUser,
    db: DB,
) -> dict:
    repo = ProductRepository(db)
    product = await repo.get_by_id(product_id)
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    await repo.update(product, is_active=body.is_active)
    return {"id": str(product.id), "is_active": product.is_active}


# ── FX rates ──────────────────────────────────────────────────────────────────

@router.get("/fx-rates")
async def list_fx_rates(_admin: AdminUser, db: DB) -> list[dict]:
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
async def override_fx_rate(body: FxRateOverride, admin: AdminUser, db: DB) -> dict:
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
async def list_coupons(_admin: AdminUser, db: DB) -> list[dict]:
    repo = CouponRepository(db)
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
async def create_coupon(body: CouponCreate, _admin: AdminUser, db: DB) -> dict:
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
) -> dict:
    result = await db.execute(select(Coupon).where(Coupon.id == coupon_id))
    coupon = result.scalar_one_or_none()
    if not coupon:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Coupon not found")
    coupon.is_active = body.is_active
    await db.flush()
    return {"id": str(coupon.id), "is_active": coupon.is_active}


# ── Users ─────────────────────────────────────────────────────────────────────

@router.get("/users")
async def list_users(_admin: AdminUser, db: DB, limit: int = 50) -> list[dict]:
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
) -> dict:
    if admin.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can change roles")
    repo = UserRepository(db)
    user = await repo.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    await repo.update(user, role=role)
    return {"id": str(user.id), "role": user.role}
