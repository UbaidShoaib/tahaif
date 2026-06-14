import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import (
    Order,
    OrderStatus,
    PaymentMethod,
    PaymentStatus,
)
from app.models.user import User
from app.repositories.cart_repository import CartRepository
from app.repositories.catalog_repository import CityRepository, ProductRepository
from app.repositories.loyalty_repository import CouponRepository, LoyaltyRepository
from app.repositories.order_repository import OrderRepository
from app.schemas.cart import CartRead
from app.schemas.order import (
    CheckoutPlace,
    CheckoutQuote,
    FulfillmentRead,
    OrderItemRead,
    OrderRead,
    QuoteLineItem,
)
from app.services import delivery_service, fx_service, loyalty_service
from app.services.cart_service import _cart_to_read, _unit_price

_EMPTY_CART = HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cart is empty")
_CITY_NOT_FOUND = HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Delivery city not found")


async def quote(
    db: AsyncSession,
    user_id: uuid.UUID,
    city_id: uuid.UUID,
) -> CheckoutQuote:
    cart_read = await _cart_to_read_with_db(db, user_id)
    if not cart_read.items:
        raise _EMPTY_CART

    city_repo = CityRepository(db)
    city = await city_repo.get_by_id(city_id)
    if not city:
        raise _CITY_NOT_FOUND

    prod_repo = ProductRepository(db)
    line_items: list[QuoteLineItem] = []
    delivery_pkr = 0

    for cart_item in cart_read.items:
        product = await prod_repo.get_by_id(cart_item.product_id)
        if not product:
            continue
        pc = next((p for p in product.product_cities if p.city_id == city_id), None)
        delivery_fee = pc.delivery_fee_pkr if pc else 0
        delivery_pkr += delivery_fee

        line_items.append(QuoteLineItem(
            product_name=cart_item.product_name,
            variant_name=cart_item.variant_name,
            qty=cart_item.qty,
            unit_price_pkr=cart_item.unit_price_pkr,
            line_total_pkr=cart_item.line_total_pkr,
        ))

    subtotal = sum(li.line_total_pkr for li in line_items)
    return CheckoutQuote(
        items=line_items,
        subtotal_pkr=subtotal,
        delivery_pkr=delivery_pkr,
        total_pkr=subtotal + delivery_pkr,
    )


async def place_order(
    db: AsyncSession,
    user: User,
    body: CheckoutPlace,
    idempotency_key: str | None = None,
) -> OrderRead:
    cart_repo = CartRepository(db)
    order_repo = OrderRepository(db)
    city_repo = CityRepository(db)
    prod_repo = ProductRepository(db)

    # ── Idempotency check ──────────────────────────────────────────────────────
    if idempotency_key:
        existing = await order_repo.get_by_idempotency_key(idempotency_key)
        if existing:
            return _order_to_read(existing)

    cart = await cart_repo.get_by_user(user.id)
    if not cart or not cart.items:
        raise _EMPTY_CART

    city = await city_repo.get_by_id(body.delivery_city_id)
    if not city:
        raise _CITY_NOT_FOUND

    # ── Stock validation (must happen before any writes) ──────────────────────
    now = datetime.now(UTC)
    item_details: list[tuple] = []  # (cart_item, product, variant, unit, pc)

    for cart_item in cart.items:
        product = await prod_repo.get_by_id(cart_item.product_id)
        if not product:
            continue
        variant = (
            next((v for v in product.variants if v.id == cart_item.variant_id), None)
            if cart_item.variant_id
            else None
        )
        if variant and variant.stock_qty < cart_item.qty:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"'{product.name}' ({variant.name}) is out of stock "
                       f"(available: {variant.stock_qty}, requested: {cart_item.qty})",
            )

        pc = next((p for p in product.product_cities if p.city_id == body.delivery_city_id), None)

        # Delivery date validation
        if pc:
            delivery_service.validate_delivery_date(pc, body.delivery_date, product.name, now)

        unit = _unit_price(product, variant)
        item_details.append((cart_item, product, variant, unit, pc))

    # ── Calculate totals ───────────────────────────────────────────────────────
    subtotal_pkr = sum(unit * ci.qty for ci, _, _, unit, _ in item_details)
    delivery_pkr = sum(pc.delivery_fee_pkr for _, _, _, _, pc in item_details if pc)
    vendor_ids: set[uuid.UUID] = {p.vendor_id for _, p, _, _, _ in item_details}

    discount_pkr = 0

    # ── Coupon application ─────────────────────────────────────────────────────
    applied_coupon = None
    if body.coupon_code:
        coupon_repo = CouponRepository(db)
        coupon = await coupon_repo.get_by_code(body.coupon_code.upper())

        if not coupon or not coupon.is_active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid coupon code")
        if coupon.starts_at and coupon.starts_at > now:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Coupon not yet active")
        if coupon.ends_at and coupon.ends_at < now:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Coupon has expired")
        if coupon.usage_limit is not None and coupon.used_count >= coupon.usage_limit:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Coupon usage limit reached")
        if coupon.min_order_pkr and subtotal_pkr < coupon.min_order_pkr:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Minimum order of PKR {coupon.min_order_pkr / 100:,.0f} required for this coupon",
            )

        from decimal import Decimal
        from app.models.loyalty import CouponType
        if coupon.coupon_type == CouponType.percent:
            discount_pkr = int(subtotal_pkr * coupon.value / Decimal("100"))
        elif coupon.coupon_type == CouponType.fixed:
            discount_pkr = min(int(coupon.value * 100), subtotal_pkr)
        elif coupon.coupon_type == CouponType.free_shipping:
            discount_pkr = delivery_pkr

        applied_coupon = coupon

    # ── Loyalty burn ───────────────────────────────────────────────────────────
    loyalty_discount_pkr = 0
    if body.use_loyalty_points:
        loyalty_repo = LoyaltyRepository(db)
        wallet = await loyalty_repo.get_wallet(user.id)
        if wallet and wallet.balance_points > 0:
            # Each point is worth 100 PKR (paisa); cap at order total
            max_points_value = wallet.balance_points * 10_000  # paisa per point
            remaining_total = subtotal_pkr + delivery_pkr - discount_pkr
            loyalty_discount_pkr = min(max_points_value, remaining_total)
            points_to_burn = loyalty_discount_pkr // 10_000
            if points_to_burn > 0:
                loyalty_discount_pkr = points_to_burn * 10_000
                discount_pkr += loyalty_discount_pkr

    total_pkr = max(0, subtotal_pkr + delivery_pkr - discount_pkr)

    # ── FX conversion ──────────────────────────────────────────────────────────
    currency = user.currency_pref or "PKR"
    fx_rate = await fx_service.get_rate(db, currency)
    total_charged = fx_service.convert_from_pkr(total_pkr, fx_rate)

    # ── Create order ───────────────────────────────────────────────────────────
    order = await order_repo.create(
        user_id=user.id,
        idempotency_key=idempotency_key,
        currency=currency,
        fx_rate_to_pkr=fx_rate,
        subtotal_pkr=subtotal_pkr,
        delivery_pkr=delivery_pkr,
        discount_pkr=discount_pkr,
        total_pkr=total_pkr,
        total_charged=total_charged,
        status=OrderStatus.pending_payment,
        coupon_code=body.coupon_code,
        notes=body.notes,
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
    for cart_item, product, variant, unit, _ in item_details:
        fulfillment_id = fulfillment_map.get(product.vendor_id)
        await order_repo.add_item(
            order_id=order.id,
            fulfillment_id=fulfillment_id,
            product_id=cart_item.product_id,
            variant_id=cart_item.variant_id,
            qty=cart_item.qty,
            unit_price_pkr=unit,
            line_total_pkr=unit * cart_item.qty,
            greeting_message=cart_item.greeting_message,
        )
        if variant:
            variant.stock_qty -= cart_item.qty
            if variant.stock_qty <= 0:
                variant.stock_qty = 0
                variant.is_active = False
            await db.flush()

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

    if body.use_loyalty_points and loyalty_discount_pkr > 0:
        loyalty_repo = LoyaltyRepository(db)
        points_burned = loyalty_discount_pkr // 10_000
        await loyalty_repo.burn_points(
            user_id=user.id,
            points=points_burned,
            reason="Redeemed at checkout",
            order_id=order.id,
        )

    await loyalty_service.award_for_order(db, user.id, order.id, total_pkr)

    # Enqueue order confirmation notifications (best-effort)
    try:
        from app.workers.notification_tasks import enqueue_order_confirmation
        order_reloaded_for_notif = await order_repo.reload(order)
        await enqueue_order_confirmation(
            db=db,
            order_id=order.id,
            user_email=user.email,
            user_phone=user.phone,
            order_total_pkr=total_pkr,
            public_token=order_reloaded_for_notif.public_token,
        )
    except Exception:
        pass

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


def _order_to_read(order: Order) -> OrderRead:
    items = [
        OrderItemRead(
            id=i.id,
            product_name=i.product.name,
            variant_name=i.variant.name if i.variant else None,
            qty=i.qty,
            unit_price_pkr=i.unit_price_pkr,
            line_total_pkr=i.line_total_pkr,
            greeting_message=i.greeting_message,
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
            courier_tracking=f.courier_tracking,
            dispatched_at=f.dispatched_at,
            delivered_at=f.delivered_at,
        )
        for f in order.fulfillments
    ]
    payment_method = order.payments[0].method if order.payments else None
    return OrderRead(
        id=order.id,
        public_token=order.public_token,
        status=order.status,
        currency=order.currency,
        subtotal_pkr=order.subtotal_pkr,
        delivery_pkr=order.delivery_pkr,
        discount_pkr=order.discount_pkr,
        total_pkr=order.total_pkr,
        placed_at=order.placed_at,
        items=items,
        fulfillments=fulfillments,
        payment_method=payment_method,
    )


async def _cart_to_read_with_db(db: AsyncSession, user_id: uuid.UUID) -> CartRead:
    repo = CartRepository(db)
    cart = await repo.get_or_create_for_user(user_id)
    return _cart_to_read(cart)
