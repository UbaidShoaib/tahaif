import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

import structlog
from fastapi import HTTPException, UploadFile, status
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.integrations.s3_client import upload_proof
from app.models.bucket import BucketStatus, CustomBucket
from app.models.catalog import City
from app.models.loyalty import Coupon, CouponType
from app.models.order import (
    CartItem,
    Order,
    OrderSource,
    OrderStatus,
    PaymentMethod,
    PaymentStatus,
)
from app.models.user import User
from app.repositories.cart_repository import CartRepository
from app.repositories.catalog_repository import CityRepository, ProductRepository
from app.repositories.loyalty_repository import CouponRepository, LoyaltyRepository
from app.repositories.order_repository import OrderRepository
from app.schemas.order import (
    CheckoutPlace,
    CheckoutQuote,
    FulfillmentRead,
    OrderItemRead,
    OrderRead,
    QuoteLineItem,
)
from app.services import (
    cart_service,
    delivery_service,
    fx_service,
    loyalty_service,
    note_service,
    proof_service,
    thanks_service,
)
from app.services.cart_service import (
    CartOwner,
    _unit_price,
    bucket_contents,
    bucket_id_of,
)

logger = structlog.get_logger()
settings = get_settings()

if TYPE_CHECKING:
    from app.models.catalog import Product, ProductCity, ProductVariant

_EMPTY_CART = HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cart is empty")
_CITY_NOT_FOUND = HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Delivery city not found")


@dataclass
class _Pricing:
    coupon: Coupon | None
    coupon_discount_pkr: int
    loyalty_points_used: int
    loyalty_discount_pkr: int
    total_pkr: int
    currency: str
    fx_rate: Decimal
    total_charged: int

    @property
    def discount_pkr(self) -> int:
        return self.coupon_discount_pkr + self.loyalty_discount_pkr


def normalize_campaign(raw: str | None) -> str | None:
    """One spelling per campaign ("Eid Reel " → "eid-reel") so the report groups them."""
    if not raw:
        return None
    return "-".join(raw.strip().lower().split())[:100] or None


def _bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


@dataclass
class _Line:
    """A cart line checked against the delivery city, priced for it."""

    cart_item: CartItem
    product: "Product"
    variant: "ProductVariant | None"
    pc: "ProductCity"
    unit_pkr: int

    @property
    def total_pkr(self) -> int:
        return self.unit_pkr * self.cart_item.qty


def _sellable_line(cart_item: CartItem, city: City) -> _Line:
    """The line priced for ``city``, or 409 when it can't be sold there now: the product
    or size was switched off after it went in the cart, or the shop doesn't deliver
    this product to that city."""
    product = cart_item.product
    variant = (
        next((v for v in product.variants if v.id == cart_item.variant_id), None) if cart_item.variant_id else None
    )
    if not product.is_active or (cart_item.variant_id and (variant is None or not variant.is_active)):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"'{product.name}' is no longer available. Remove it from your cart to continue.",
        )
    pc = next((p for p in product.product_cities if p.city_id == city.id), None)
    if pc is None or not pc.is_available:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"'{product.name}' isn't delivered to {city.name}. "
            "Choose another city or remove it from your cart.",
        )
    return _Line(cart_item, product, variant, pc, _unit_price(product, variant, cart_item.customization, pc))


def _delivery_pkr(lines: list[_Line]) -> int:
    """One delivery per shop (one fulfillment each): the highest fee among its lines."""
    fees: dict[uuid.UUID, int] = {}
    for line in lines:
        vendor_id = line.product.vendor_id
        fees[vendor_id] = max(fees.get(vendor_id, 0), line.pc.delivery_fee_pkr)
    return sum(fees.values())


async def _active_city(db: AsyncSession, city_id: uuid.UUID) -> City:
    city = await CityRepository(db).get_by_id(city_id)
    if not city or not city.is_active:
        raise _CITY_NOT_FOUND
    return city


# Paid in rupees in Pakistan: cash at the door, or a transfer to a PKR account.
_LOCAL_METHODS = frozenset({PaymentMethod.cod, PaymentMethod.bank_transfer})


async def _price(
    db: AsyncSession,
    user: User | None,
    subtotal_pkr: int,
    delivery_pkr: int,
    coupon_code: str | None,
    use_loyalty_points: bool,
    now: datetime,
    payment_method: PaymentMethod,
    *,
    lock: bool = False,
    contact_email: str | None = None,
    contact_phone: str | None = None,
) -> _Pricing:
    """Apply coupon, loyalty burn and currency. Shared by quote and place_order
    so the buyer previews exactly what they will be charged.

    Local methods always charge PKR; only card-style methods charge in the
    buyer's preferred currency (when a rate is known).

    ``lock`` (placing an order) locks the coupon and the wallet rows until the order
    commits, so concurrent checkouts can't overrun a usage limit or spend the same
    points twice."""
    coupon: Coupon | None = None
    coupon_discount = 0
    if coupon_code:
        coupon = await CouponRepository(db).get_by_code(coupon_code.strip().upper(), for_update=lock)
        if not coupon or not coupon.is_active:
            raise _bad_request("Invalid coupon code")
        if coupon.starts_at and coupon.starts_at > now:
            raise _bad_request("Coupon not yet active")
        if coupon.ends_at and coupon.ends_at < now:
            raise _bad_request("Coupon has expired")
        if coupon.usage_limit is not None and coupon.used_count >= coupon.usage_limit:
            raise _bad_request("Coupon usage limit reached")
        if coupon.per_customer_limit is not None:
            used = await OrderRepository(db).count_coupon_uses(
                coupon.code, user_id=user.id if user else None, email=contact_email, phone=contact_phone
            )
            if used >= coupon.per_customer_limit:
                raise _bad_request(
                    "You've already used this coupon"
                    if coupon.per_customer_limit == 1
                    else f"This coupon can be used on {coupon.per_customer_limit} orders per customer"
                )
        if coupon.min_order_pkr and subtotal_pkr < coupon.min_order_pkr:
            raise _bad_request(
                f"Minimum order of PKR {coupon.min_order_pkr / 100:,.0f} required for this coupon"
            )
        if coupon.coupon_type == CouponType.percent:
            coupon_discount = int(subtotal_pkr * coupon.value / Decimal("100"))
        elif coupon.coupon_type == CouponType.fixed:
            coupon_discount = min(int(coupon.value * 100), subtotal_pkr)
        elif coupon.coupon_type == CouponType.free_shipping:
            coupon_discount = delivery_pkr

    points_used = 0
    loyalty_discount = 0
    if use_loyalty_points:
        if user is None:
            raise _bad_request("Sign in to use your loyalty points")
        wallet = await LoyaltyRepository(db).get_wallet(user.id, for_update=lock)
        remaining = subtotal_pkr + delivery_pkr - coupon_discount
        if wallet and wallet.balance_points > 0 and remaining > 0:
            points_used = min(wallet.balance_points, remaining // loyalty_service.POINT_VALUE_PAISA)
            loyalty_discount = points_used * loyalty_service.POINT_VALUE_PAISA

    total_pkr = max(0, subtotal_pkr + delivery_pkr - coupon_discount - loyalty_discount)
    if payment_method in _LOCAL_METHODS:
        currency, fx_rate = "PKR", Decimal("1")
    else:
        currency, fx_rate = await fx_service.resolve_charge_currency(db, user.currency_pref if user else None)
    return _Pricing(
        coupon=coupon,
        coupon_discount_pkr=coupon_discount,
        loyalty_points_used=points_used,
        loyalty_discount_pkr=loyalty_discount,
        total_pkr=total_pkr,
        currency=currency,
        fx_rate=fx_rate,
        total_charged=fx_service.convert_from_pkr(total_pkr, fx_rate),
    )


async def quote(
    db: AsyncSession,
    user: User | None,
    city_id: uuid.UUID,
    coupon_code: str | None = None,
    use_loyalty_points: bool = False,
    payment_method: PaymentMethod = PaymentMethod.cod,
    guest_token: str | None = None,
) -> CheckoutQuote:
    """Totals preview for a signed-in buyer or a guest (ADR 0004)."""
    cart, _ = await cart_service.resolve_cart(
        db, CartOwner(user_id=user.id if user else None, guest_token=guest_token), create=False
    )
    if not cart or not cart.items:
        raise _EMPTY_CART

    city = await _active_city(db, city_id)
    lines = [_sellable_line(ci, city) for ci in cart.items]
    delivery_pkr = _delivery_pkr(lines)
    line_items = [
        QuoteLineItem(
            cart_item_id=line.cart_item.id,
            product_name=line.product.name,
            variant_name=line.variant.name if line.variant else None,
            qty=line.cart_item.qty,
            unit_price_pkr=line.unit_pkr,
            line_total_pkr=line.total_pkr,
        )
        for line in lines
    ]

    subtotal = sum(li.line_total_pkr for li in line_items)
    pricing = await _price(
        db, user, subtotal, delivery_pkr, coupon_code, use_loyalty_points, datetime.now(UTC), payment_method
    )
    return CheckoutQuote(
        items=line_items,
        subtotal_pkr=subtotal,
        delivery_pkr=delivery_pkr,
        coupon_code=pricing.coupon.code if pricing.coupon else None,
        coupon_discount_pkr=pricing.coupon_discount_pkr,
        loyalty_points_used=pricing.loyalty_points_used,
        loyalty_discount_pkr=pricing.loyalty_discount_pkr,
        discount_pkr=pricing.discount_pkr,
        total_pkr=pricing.total_pkr,
        currency=pricing.currency,
        fx_rate=pricing.fx_rate,
        total_charged=pricing.total_charged,
    )


async def place_order(
    db: AsyncSession,
    user: User | None,
    body: CheckoutPlace,
    idempotency_key: str | None = None,
    guest_token: str | None = None,
    require_contact_email: bool = True,
) -> OrderRead:
    """Place an order for a signed-in buyer or a guest (ADR 0004).

    Guests must give an email and phone for the confirmation; they can use
    coupons but not loyalty points, and earn no points. Orders staff take from
    a chat (ADR 0009) pass ``require_contact_email=False``: many of those buyers
    only gave a WhatsApp number.
    """
    cart_repo = CartRepository(db)
    order_repo = OrderRepository(db)
    prod_repo = ProductRepository(db)

    # ── Idempotency check ──────────────────────────────────────────────────────
    if idempotency_key:
        await order_repo.lock_idempotency_key(idempotency_key)
        existing = await order_repo.get_by_idempotency_key(idempotency_key)
        if existing:
            return _order_to_read(existing)

    if user is not None and not user.is_verified and settings.require_verified_email_for_checkout:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Please verify your email before placing an order",
        )

    if user is None and (not body.contact_phone or (require_contact_email and not body.contact_email)):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Enter your email and phone so we can confirm your order",
        )

    cart, _ = await cart_service.resolve_cart(
        db, CartOwner(user_id=user.id if user else None, guest_token=guest_token), create=False
    )
    if not cart:
        raise _EMPTY_CART
    cart = await cart_repo.lock(cart)
    if not cart.items:
        raise _EMPTY_CART

    city = await _active_city(db, body.delivery_city_id)

    # ── Availability, stock and dates (must happen before any writes) ─────────
    await prod_repo.lock_variants([ci.variant_id for ci in cart.items if ci.variant_id])
    now = datetime.now(UTC)
    lines = [_sellable_line(ci, city) for ci in cart.items]
    for line in lines:
        if line.variant and not line.variant.has_stock(line.cart_item.qty):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"'{line.product.name}' ({line.variant.name}) is out of stock "
                       f"(available: {line.variant.stock_qty}, requested: {line.cart_item.qty})",
            )
        delivery_service.validate_delivery_date(line.pc, body.delivery_date, line.product.name, now)

    # ── Calculate totals ───────────────────────────────────────────────────────
    subtotal_pkr = sum(line.total_pkr for line in lines)
    delivery_pkr = _delivery_pkr(lines)
    vendor_ids: set[uuid.UUID] = {line.product.vendor_id for line in lines}

    pricing = await _price(
        db, user, subtotal_pkr, delivery_pkr, body.coupon_code, body.use_loyalty_points, now,
        body.payment_method, lock=True,
        contact_email=None if user or not body.contact_email else str(body.contact_email),
        contact_phone=None if user else body.contact_phone,
    )
    applied_coupon = pricing.coupon
    discount_pkr = pricing.discount_pkr
    total_pkr = pricing.total_pkr
    currency = pricing.currency
    fx_rate = pricing.fx_rate
    total_charged = pricing.total_charged

    # ── Create order ───────────────────────────────────────────────────────────
    order = await order_repo.create(
        user_id=user.id if user else None,
        contact_email=None if user or not body.contact_email else str(body.contact_email),
        contact_phone=None if user else body.contact_phone,
        surprise=body.surprise,
        gift_from=(body.gift_from or "").strip() or (user.full_name if user else None),
        idempotency_key=idempotency_key,
        currency=currency,
        fx_rate_to_pkr=fx_rate,
        subtotal_pkr=subtotal_pkr,
        delivery_pkr=delivery_pkr,
        discount_pkr=discount_pkr,
        total_pkr=total_pkr,
        total_charged=total_charged,
        status=OrderStatus.pending_payment,
        coupon_code=applied_coupon.code if applied_coupon else None,
        notes=body.notes,
        campaign=normalize_campaign(body.campaign),
    )

    # ── Fulfillments ───────────────────────────────────────────────────────────
    fulfillment_map: dict[uuid.UUID, uuid.UUID] = {}
    for vendor_id in vendor_ids:
        fulfillment = await order_repo.add_fulfillment(
            order_id=order.id,
            vendor_id=vendor_id,
            recipient_name=body.recipient_name,
            recipient_phone=body.recipient_phone,
            address_line1=body.address_line1,
            address_line2=body.address_line2,
            city_id=body.delivery_city_id,
            landmark=body.landmark,
            delivery_date=body.delivery_date,
        )
        fulfillment_map[vendor_id] = fulfillment.id

    # ── Order items + stock decrement ──────────────────────────────────────────
    for line in lines:
        cart_item, variant = line.cart_item, line.variant
        await order_repo.add_item(
            order_id=order.id,
            fulfillment_id=fulfillment_map.get(line.product.vendor_id),
            product_id=cart_item.product_id,
            variant_id=cart_item.variant_id,
            qty=cart_item.qty,
            unit_price_pkr=line.unit_pkr,
            line_total_pkr=line.total_pkr,
            greeting_message=cart_item.greeting_message,
            customization=cart_item.customization,
        )
        if variant and variant.stock_qty is not None:
            # Sold out stays switched on: restocking brings it straight back.
            variant.stock_qty = max(0, variant.stock_qty - cart_item.qty)
            await db.flush()

    bucket_ids = [bucket_id for ci in cart.items if (bucket_id := bucket_id_of(ci))]
    if bucket_ids:
        await db.execute(
            update(CustomBucket).where(CustomBucket.id.in_(bucket_ids)).values(status=BucketStatus.ORDERED)
        )

    # ── Payment record ─────────────────────────────────────────────────────────
    pay_status = (
        PaymentStatus.pending_cod
        if body.payment_method == PaymentMethod.cod
        else PaymentStatus.pending_proof
    )
    await order_repo.add_payment(
        order_id=order.id,
        method=body.payment_method,
        status=pay_status,
        amount_pkr=total_pkr,
        amount_charged=total_charged,
        currency=currency,
    )

    # ── Post-creation side effects ──────────────────────────────────────────────
    await cart_repo.clear(cart)

    if applied_coupon:
        applied_coupon.used_count += 1
        await db.flush()

    if user and pricing.loyalty_points_used > 0:
        await LoyaltyRepository(db).burn_points(
            user_id=user.id,
            points=pricing.loyalty_points_used,
            reason="Redeemed at checkout",
            order_id=order.id,
        )

    if user:
        await loyalty_service.award_for_order(db, user.id, order.id, total_pkr)

    # Enqueue order confirmation notifications (best-effort). Runs inside a
    # SAVEPOINT so a failure here (e.g. outbox insert error) rolls back only
    # the notification write instead of poisoning the whole checkout
    # transaction — a bare try/except is not enough, since a failed statement
    # leaves the outer transaction aborted for every query after it.
    try:
        from app.workers.notification_tasks import enqueue_order_confirmation
        async with db.begin_nested():
            order_reloaded_for_notif = await order_repo.reload(order)
            await enqueue_order_confirmation(
                db=db,
                order_id=order.id,
                user_email=user.email if user else (str(body.contact_email) if body.contact_email else None),
                user_phone=user.phone if user else body.contact_phone,
                order_total_pkr=total_pkr,
                public_token=order_reloaded_for_notif.public_token,
            )
    except Exception:
        # Best-effort: the order stands, but a missed confirmation must be visible.
        await logger.aexception("order_notification_enqueue_failed", order_id=str(order.id))

    order = await order_repo.reload(order)
    return _order_to_read(order)


async def get_order_by_token(db: AsyncSession, public_token: uuid.UUID) -> OrderRead:
    repo = OrderRepository(db)
    order = await repo.get_by_public_token(public_token)
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    return _order_to_read(order)


async def get_my_orders(db: AsyncSession, user_id: uuid.UUID) -> list[OrderRead]:
    repo = OrderRepository(db)
    orders = await repo.list_for_user(user_id)
    return [_order_to_read(o) for o in orders]


def _primary_image_url(product: "Product") -> str | None:
    """The product's primary photo, else its first; None when it has none."""
    primary = next((img for img in product.images if img.is_primary), None)
    chosen = primary or (product.images[0] if product.images else None)
    return chosen.url if chosen else None


def _order_to_read(order: Order) -> OrderRead:
    items = [
        OrderItemRead(
            id=i.id,
            product_name=i.product.name,
            product_image_url=_primary_image_url(i.product),
            variant_name=i.variant.name if i.variant else None,
            qty=i.qty,
            unit_price_pkr=i.unit_price_pkr,
            line_total_pkr=i.line_total_pkr,
            greeting_message=i.greeting_message,
            has_note=i.note_key is not None,
            note_content_type=i.note_content_type,
            can_edit_note=note_service.can_edit_note(order, i),
            bucket_contents=bucket_contents(i.customization),
        )
        for i in order.items
    ]
    fulfillments = [
        FulfillmentRead(
            id=f.id,
            vendor_name=f.vendor.name,
            status=f.status,
            delivery_date=f.delivery_date,
            delivery_slot=f.delivery_slot,
            recipient_name=f.recipient_name,
            recipient_phone=f.recipient_phone,
            address_line1=f.address_line1,
            city_name=f.city.name,
            city_timezone=f.city.timezone,
            courier_tracking=f.courier_tracking,
            dispatched_at=f.dispatched_at,
            delivered_at=f.delivered_at,
            delivery_photo_url=proof_service.signed_delivery_photo_url(f.delivery_photo_key),
            received_by=f.received_by,
            thanks=thanks_service.thanks_read(f),
        )
        for f in order.fulfillments
    ]
    payment_method = order.payments[0].method if order.payments else None
    return OrderRead(
        id=order.id,
        public_token=order.public_token,
        status=order.status,
        currency=order.currency,
        total_charged=order.total_charged,
        subtotal_pkr=order.subtotal_pkr,
        delivery_pkr=order.delivery_pkr,
        discount_pkr=order.discount_pkr,
        total_pkr=order.total_pkr,
        placed_at=order.placed_at,
        items=items,
        fulfillments=fulfillments,
        payment_method=payment_method,
        surprise=order.surprise,
        gift_from=order.gift_from,
        source=OrderSource(order.source),
        customer_confirmed_at=order.customer_confirmed_at,
        needs_confirmation=(
            order.source != OrderSource.web
            and order.customer_confirmed_at is None
            and order.status == OrderStatus.pending_payment
        ),
    )


# ── Bank-transfer receipts ─────────────────────────────────────────────────────

MAX_PROOF_BYTES = 10 * 1024 * 1024
_SETTLED_PAYMENTS = frozenset({PaymentStatus.paid, PaymentStatus.refunded})


async def upload_transfer_proof(
    db: AsyncSession,
    *,
    file: UploadFile,
    user: User | None = None,
    order_id: uuid.UUID | None = None,
    public_token: uuid.UUID | None = None,
) -> str:
    """Attach a bank-transfer receipt to an order and mark it for verification.

    Signed-in buyers address the order by id (it must be theirs); guests by its
    public token, the same capability that opens the tracking page (ADR 0004).
    At most 10 MB is read, so an oversized upload can't exhaust memory.
    """
    repo = OrderRepository(db)
    if public_token is not None:
        order = await repo.get_by_public_token(public_token)
    elif order_id is not None and user is not None:
        order = await repo.get_by_id(order_id)
        if order and order.user_id != user.id:
            order = None
    else:
        order = None
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    data = await file.read(MAX_PROOF_BYTES + 1)
    return await attach_transfer_proof(
        db, order, data, file.filename or "receipt.jpg", file.content_type or "image/jpeg"
    )


async def attach_transfer_proof(
    db: AsyncSession, order: Order, data: bytes, filename: str, content_type: str
) -> str:
    """Store a receipt (uploaded on the order page, or sent in WhatsApp) and queue it for staff to verify."""
    if not order.payments:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No payment record found")
    payment = order.payments[0]
    if payment.method != PaymentMethod.bank_transfer:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Proof upload is only for bank transfer orders",
        )
    if payment.status in _SETTLED_PAYMENTS or order.status in (OrderStatus.cancelled, OrderStatus.refunded):
        # A new receipt would send a settled order back to "awaiting verification".
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This order's payment is already settled, so no receipt is needed",
        )

    url = await upload_proof(order_id=str(order.id), filename=filename, data=data, content_type=content_type)
    payment.proof_url = url
    payment.status = PaymentStatus.awaiting_verification
    await db.flush()
    return url
