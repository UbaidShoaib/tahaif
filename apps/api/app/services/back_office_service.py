"""Back-office management of coupons, users, exchange rates, occasions and shops.

Every change is recorded in the audit log, in the caller's transaction.
"""

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.catalog import (
    City,
    FxRate,
    FxRateSource,
    Occasion,
    Product,
    Vendor,
    VendorApprovalStatus,
    product_occasions_table,
)
from app.models.loyalty import Coupon
from app.models.user import ADMIN_ROLES, User, UserRole
from app.repositories.catalog_repository import OccasionRepository
from app.repositories.loyalty_repository import CouponRepository
from app.repositories.user_repository import UserRepository
from app.schemas.admin import (
    AdminOccasionRead,
    AdminShopRead,
    AdminShopUpdate,
    AdminUserRead,
    CouponCreate,
    CouponRead,
    CouponUpdate,
    FxCurrencyRead,
    FxRateRead,
)
from app.schemas.catalog import OccasionCreate, OccasionUpdate
from app.services import audit_service, catalog_service, team_service
from app.services.fx_service import SUPPORTED_CURRENCIES


def _not_found(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


def _unprocessable(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail)


# ── Coupons ───────────────────────────────────────────────────────────────────

_COUPON_FIELDS = ["value", "min_order_pkr", "usage_limit", "per_customer_limit", "starts_at", "ends_at", "is_active"]


async def list_coupons(db: AsyncSession, q: str | None = None) -> list[CouponRead]:
    query = select(Coupon).order_by(Coupon.created_at.desc()).limit(200)
    if q:
        query = query.where(Coupon.code.ilike(f"%{q.strip()}%"))
    return [CouponRead.model_validate(c) for c in (await db.scalars(query)).all()]


async def create_coupon(db: AsyncSession, actor: User, body: CouponCreate) -> CouponRead:
    repo = CouponRepository(db)
    code = body.code.upper()
    if await repo.get_by_code(code):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"There is already a coupon {code}")
    coupon = await repo.create(code=code, **body.model_dump(exclude={"code"}))
    await audit_service.record(
        db, actor, "coupon.created", "coupon", coupon.id, after={"code": code, **body.model_dump(exclude={"code"})}
    )
    return CouponRead.model_validate(coupon)


async def _coupon(db: AsyncSession, coupon_id: uuid.UUID) -> Coupon:
    coupon = await db.get(Coupon, coupon_id)
    if not coupon:
        raise _not_found("Coupon")
    return coupon


async def update_coupon(db: AsyncSession, actor: User, coupon_id: uuid.UUID, body: CouponUpdate) -> CouponRead:
    coupon = await _coupon(db, coupon_id)
    # Only what was sent; null clears a limit or date (value can't be cleared).
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if not (k == "value" and v is None)}
    starts_at = updates.get("starts_at", coupon.starts_at)
    ends_at = updates.get("ends_at", coupon.ends_at)
    if starts_at and ends_at and ends_at <= starts_at:
        raise _unprocessable("The end must be after the start")
    if coupon.coupon_type == "percent" and updates.get("value") is not None and updates["value"] > 100:
        raise _unprocessable("A percent coupon can take at most 100% off")
    if updates.get("usage_limit") is not None and updates["usage_limit"] < coupon.used_count:
        raise _unprocessable(f"It has already been used {coupon.used_count} times; set the limit to at least that")
    before = audit_service.snapshot(coupon, _COUPON_FIELDS)
    for key, value in updates.items():
        setattr(coupon, key, value)
    await db.flush()
    await audit_service.record(
        db, actor, "coupon.updated", "coupon", coupon.id,
        before=before, after=audit_service.snapshot(coupon, _COUPON_FIELDS), context={"code": coupon.code},
    )
    return CouponRead.model_validate(coupon)


async def set_coupon_active(db: AsyncSession, actor: User, coupon_id: uuid.UUID, is_active: bool) -> CouponRead:
    coupon = await _coupon(db, coupon_id)
    await audit_service.record(
        db, actor, "coupon.enabled" if is_active else "coupon.disabled", "coupon", coupon.id,
        before={"is_active": coupon.is_active}, after={"is_active": is_active}, context={"code": coupon.code},
    )
    coupon.is_active = is_active
    await db.flush()
    return CouponRead.model_validate(coupon)


# ── Users ─────────────────────────────────────────────────────────────────────

async def list_users(
    db: AsyncSession, q: str | None = None, role: UserRole | None = None, limit: int = 50
) -> list[AdminUserRead]:
    query = select(User).where(User.is_active.is_(True)).order_by(User.created_at.desc()).limit(limit)
    if q:
        like = f"%{q.strip()}%"
        query = query.where(or_(User.email.ilike(like), User.full_name.ilike(like), User.phone.ilike(like)))
    if role:
        query = query.where(User.role == role)
    return [AdminUserRead.model_validate(u) for u in (await db.scalars(query)).all()]


async def change_role(db: AsyncSession, actor: User, user_id: uuid.UUID, role: UserRole) -> AdminUserRead:
    """Same rules as the Team page: admins manage staff, only a super admin touches admins."""
    if actor.role not in ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can change roles")
    if user_id == actor.id:
        # Otherwise the last admin can lock everyone out of the role screen.
        raise _unprocessable("You can't change your own role; ask another admin")
    repo = UserRepository(db)
    user = await repo.get_by_id(user_id)
    if not user:
        raise _not_found("User")
    team_service.ensure_can_manage(actor, user, role)
    await team_service.ensure_a_super_admin_remains(db, user, role=role, is_active=user.is_active)
    await audit_service.record(
        db, actor, "user.role_changed", "user", user.id,
        before={"role": user.role}, after={"role": role}, context={"email": user.email},
    )
    user = await repo.update(user, role=role)
    return AdminUserRead.model_validate(user)


# ── Exchange rates ────────────────────────────────────────────────────────────

def _chargeable(code: str) -> str:
    code = code.upper()
    if code == "PKR" or code not in SUPPORTED_CURRENCIES:
        others = ", ".join(c for c in SUPPORTED_CURRENCIES if c != "PKR")
        raise _unprocessable(f"Buyers can pay in {others}; {code} isn't one of them")
    return code


async def list_fx(db: AsyncSession) -> list[FxCurrencyRead]:
    rows = (await db.scalars(select(FxRate).where(FxRate.base_currency == "PKR"))).all()
    out = []
    for code in SUPPORTED_CURRENCIES:
        if code == "PKR":
            continue
        # Several automatic rows may exist; the newest is the one in use.
        auto = max(
            (r for r in rows if r.quote_currency == code and r.source == FxRateSource.auto),
            key=lambda r: r.fetched_at, default=None,
        )
        manual = next((r for r in rows if r.quote_currency == code and r.source == FxRateSource.manual), None)
        effective = manual or auto
        out.append(FxCurrencyRead(
            quote_currency=code,
            auto=FxRateRead.model_validate(auto) if auto else None,
            manual=FxRateRead.model_validate(manual) if manual else None,
            effective_rate=effective.rate if effective else None,
        ))
    return out


async def _manual(db: AsyncSession, code: str) -> FxRate | None:
    result = await db.execute(select(FxRate).where(
        FxRate.base_currency == "PKR", FxRate.quote_currency == code, FxRate.source == FxRateSource.manual,
    ))
    return result.scalar_one_or_none()


async def override_fx(db: AsyncSession, actor: User, quote_currency: str, rate: Decimal) -> FxRate:
    code = _chargeable(quote_currency)
    existing = await _manual(db, code)
    await audit_service.record(
        db, actor, "fx_rate.overridden", "fx_rate", code,
        before={"rate": existing.rate} if existing else None, after={"rate": rate},
    )
    now = datetime.now(UTC)
    if existing:
        existing.rate = rate
        existing.fetched_at = now
        existing.set_by = actor.id
        await db.flush()
        return existing
    row = FxRate(base_currency="PKR", quote_currency=code, rate=rate, source=FxRateSource.manual,
                 set_by=actor.id, fetched_at=now)
    db.add(row)
    await db.flush()
    return row


async def clear_fx_override(db: AsyncSession, actor: User, quote_currency: str) -> None:
    """Go back to the automatic daily rate."""
    code = _chargeable(quote_currency)
    existing = await _manual(db, code)
    if not existing:
        raise _not_found(f"Manual {code} rate")
    await audit_service.record(db, actor, "fx_rate.override_cleared", "fx_rate", code, before={"rate": existing.rate})
    await db.delete(existing)
    await db.flush()


# ── Occasions ─────────────────────────────────────────────────────────────────

_OCCASION_FIELDS = ["name", "name_ur", "banner_url", "starts_at", "ends_at", "sort_order", "is_active"]
# Null here means "remove it"; for the rest, null means "leave as is".
_CLEARABLE_OCCASION_FIELDS = {"name_ur", "banner_url", "starts_at", "ends_at"}


async def list_occasions(db: AsyncSession) -> list[AdminOccasionRead]:
    count = (
        select(func.count()).select_from(product_occasions_table)
        .where(product_occasions_table.c.occasion_id == Occasion.id).scalar_subquery()
    )
    rows = (await db.execute(select(Occasion, count).order_by(Occasion.sort_order, Occasion.name))).all()
    return [
        AdminOccasionRead(
            id=o.id, slug=o.slug, name=o.name, name_ur=o.name_ur, banner_url=o.banner_url, starts_at=o.starts_at,
            ends_at=o.ends_at, sort_order=o.sort_order, is_active=o.is_active, product_count=n,
        )
        for o, n in rows
    ]


async def create_occasion(db: AsyncSession, actor: User, body: OccasionCreate) -> Occasion:
    if body.starts_at and body.ends_at and body.ends_at <= body.starts_at:
        raise _unprocessable("The end must be after the start")
    occasion = await catalog_service.create_occasion(db, body, actor)
    await audit_service.record(db, actor, "occasion.created", "occasion", occasion.id, after=body.model_dump())
    return occasion


async def update_occasion(db: AsyncSession, actor: User, occasion_id: uuid.UUID, body: OccasionUpdate) -> Occasion:
    repo = OccasionRepository(db)
    occasion = await db.get(Occasion, occasion_id)
    if not occasion:
        raise _not_found("Occasion")
    updates = {
        k: v for k, v in body.model_dump(exclude_unset=True).items()
        if v is not None or k in _CLEARABLE_OCCASION_FIELDS
    }
    starts_at = updates.get("starts_at", occasion.starts_at)
    ends_at = updates.get("ends_at", occasion.ends_at)
    if starts_at and ends_at and ends_at <= starts_at:
        raise _unprocessable("The end must be after the start")
    if not updates:
        return occasion
    before = audit_service.snapshot(occasion, _OCCASION_FIELDS)
    occasion = await repo.update(occasion, **updates)
    await audit_service.record(
        db, actor, "occasion.updated", "occasion", occasion.id,
        before=before, after=audit_service.snapshot(occasion, _OCCASION_FIELDS),
    )
    return occasion


# ── Shops ─────────────────────────────────────────────────────────────────────

_SHOP_FIELDS = ["name", "description", "logo_url", "contact_phone", "city_id", "is_active"]


async def list_shops(
    db: AsyncSession, q: str | None = None, vendor_id: uuid.UUID | None = None
) -> list[AdminShopRead]:
    products = select(func.count()).where(Product.vendor_id == Vendor.id).scalar_subquery()
    live = (
        select(func.count()).where(Product.vendor_id == Vendor.id, Product.is_active.is_(True)).scalar_subquery()
    )
    query = (
        select(Vendor, products, live)
        .where(Vendor.approval_status == VendorApprovalStatus.approved.value)
        .options(selectinload(Vendor.city), selectinload(Vendor.owner))
        .execution_options(populate_existing=True)
        .order_by(Vendor.name)
    )
    if vendor_id:
        query = query.where(Vendor.id == vendor_id)
    if q:
        like = f"%{q.strip()}%"
        query = query.where(or_(Vendor.name.ilike(like), Vendor.slug.ilike(like)))
    return [_shop_read(v, n, n_live) for v, n, n_live in (await db.execute(query)).all()]


def _shop_read(v: Vendor, product_count: int, live_count: int) -> AdminShopRead:
    return AdminShopRead(
        id=v.id, name=v.name, slug=v.slug, description=v.description, logo_url=v.logo_url,
        contact_phone=v.contact_phone, city_id=v.city_id, city_name=v.city.name, is_active=v.is_active,
        is_house=v.owner_user_id is None, owner_email=v.owner.email if v.owner else None,
        product_count=product_count, live_product_count=live_count,
        bank_account_title=v.bank_account_title, bank_name=v.bank_name, bank_iban=v.bank_iban,
    )


async def update_shop(db: AsyncSession, actor: User, vendor_id: uuid.UUID, body: AdminShopUpdate) -> AdminShopRead:
    vendor = await db.get(Vendor, vendor_id)
    if not vendor or vendor.approval_status != VendorApprovalStatus.approved.value:
        # Pending and turned-down shops are handled in Shop applications.
        raise _not_found("Shop")
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items()
               if v is not None or k in {"description", "logo_url", "contact_phone"}}
    if "city_id" in updates:
        city = await db.get(City, updates["city_id"])
        if not city:
            raise _not_found("City")
    before = audit_service.snapshot(vendor, _SHOP_FIELDS)
    for key, value in updates.items():
        setattr(vendor, key, value)
    await db.flush()
    opened = updates.get("is_active")
    action = "shop.updated" if opened is None else "shop.opened" if opened else "shop.closed"
    await audit_service.record(
        db, actor, action, "vendor", vendor.id, before=before, after=audit_service.snapshot(vendor, _SHOP_FIELDS)
    )
    [shop] = await list_shops(db, vendor_id=vendor.id)
    return shop
