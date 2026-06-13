import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import (
    Order,
    OrderStatus,
    PaymentMethod,
    PaymentStatus,
)
from app.repositories.cart_repository import CartRepository
from app.repositories.catalog_repository import CityRepository, ProductRepository
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
    user_id: uuid.UUID,
    body: CheckoutPlace,
) -> OrderRead:
    cart_repo = CartRepository(db)
    order_repo = OrderRepository(db)
    city_repo = CityRepository(db)
    prod_repo = ProductRepository(db)

    cart = await cart_repo.get_by_user(user_id)
    if not cart or not cart.items:
        raise _EMPTY_CART

    city = await city_repo.get_by_id(body.delivery_city_id)
    if not city:
        raise _CITY_NOT_FOUND

    # Calculate totals
    subtotal_pkr = 0
    delivery_pkr = 0
    vendor_ids: set[uuid.UUID] = set()

    for item in cart.items:
        product = await prod_repo.get_by_id(item.product_id)
        if not product:
            continue
        variant = next((v for v in product.variants if v.id == item.variant_id), None) if item.variant_id else None
        unit = _unit_price(product, variant)
        subtotal_pkr += unit * item.qty
        pc = next((p for p in product.product_cities if p.city_id == body.delivery_city_id), None)
        if pc:
            delivery_pkr += pc.delivery_fee_pkr
        vendor_ids.add(product.vendor_id)

    total_pkr = subtotal_pkr + delivery_pkr

    # Create order
    order = await order_repo.create(
        user_id=user_id,
        currency="PKR",
        subtotal_pkr=subtotal_pkr,
        delivery_pkr=delivery_pkr,
        total_pkr=total_pkr,
        total_charged=total_pkr,
        status=OrderStatus.pending_payment,
        notes=body.notes,
    )

    # Create one fulfillment per vendor
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

    # Create order items
    for item in cart.items:
        product = await prod_repo.get_by_id(item.product_id)
        if not product:
            continue
        variant = next((v for v in product.variants if v.id == item.variant_id), None) if item.variant_id else None
        unit = _unit_price(product, variant)
        fulfillment_id = fulfillment_map.get(product.vendor_id)
        await order_repo.add_item(
            order_id=order.id,
            fulfillment_id=fulfillment_id,
            product_id=item.product_id,
            variant_id=item.variant_id,
            qty=item.qty,
            unit_price_pkr=unit,
            line_total_pkr=unit * item.qty,
            greeting_message=item.greeting_message,
        )

    # Create payment record
    if body.payment_method == PaymentMethod.cod:
        pay_status = PaymentStatus.pending_cod
    else:
        pay_status = PaymentStatus.pending_proof

    await order_repo.add_payment(
        order_id=order.id,
        method=body.payment_method,
        status=pay_status,
        amount_pkr=total_pkr,
        amount_charged=total_pkr,
        currency="PKR",
    )

    # Clear the cart
    await cart_repo.clear(cart)

    # Reload and return
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
