import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.catalog import Product, ProductVariant
from app.models.order import Cart, CartItem
from app.repositories.cart_repository import CartRepository
from app.repositories.catalog_repository import ProductRepository
from app.schemas.cart import CartItemAdd, CartItemRead, CartItemUpdate, CartRead

_NOT_FOUND = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not in cart")
_OUT_OF_STOCK = HTTPException(
    status_code=status.HTTP_409_CONFLICT, detail="Selected variant is out of stock"
)


def _unit_price(product: Product, variant: ProductVariant | None) -> int:
    base = product.base_price_pkr
    delta = variant.price_delta_pkr if variant else 0
    return base + delta


def _item_to_read(item: CartItem) -> CartItemRead:
    product = item.product
    variant = item.variant
    unit = _unit_price(product, variant)
    image = next(
        (img.url for img in product.images if img.is_primary),
        product.images[0].url if product.images else None,
    )
    return CartItemRead(
        id=item.id,
        product_id=item.product_id,
        product_name=product.name,
        product_slug=product.slug,
        product_image=image,
        variant_id=item.variant_id,
        variant_name=variant.name if variant else None,
        qty=item.qty,
        unit_price_pkr=unit,
        line_total_pkr=unit * item.qty,
        delivery_date=item.delivery_date,
        greeting_message=item.greeting_message,
        recipient_name=item.recipient_name,
        recipient_phone=item.recipient_phone,
    )


def _cart_to_read(cart: Cart) -> CartRead:
    item_reads = [_item_to_read(i) for i in cart.items]
    subtotal = sum(r.line_total_pkr for r in item_reads)
    return CartRead(
        id=cart.id,
        item_count=sum(r.qty for r in item_reads),
        subtotal_pkr=subtotal,
        items=item_reads,
    )


async def get_cart(db: AsyncSession, user_id: uuid.UUID) -> CartRead:
    repo = CartRepository(db)
    cart = await repo.get_or_create_for_user(user_id)
    return _cart_to_read(cart)


async def add_item(db: AsyncSession, user_id: uuid.UUID, body: CartItemAdd) -> CartRead:
    repo = CartRepository(db)
    prod_repo = ProductRepository(db)

    product = await prod_repo.get_by_id(body.product_id)
    if not product or not product.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    variant: ProductVariant | None = None
    if body.variant_id:
        variant = next((v for v in product.variants if v.id == body.variant_id), None)
        if not variant or not variant.is_active:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Variant not found")
        if variant.stock_qty < body.qty:
            raise _OUT_OF_STOCK

    cart = await repo.get_or_create_for_user(user_id)

    # If same product+variant already in cart, increase qty
    existing = next(
        (i for i in cart.items if i.product_id == body.product_id and i.variant_id == body.variant_id),
        None,
    )
    if existing:
        new_qty = existing.qty + body.qty
        if variant and variant.stock_qty < new_qty:
            raise _OUT_OF_STOCK
        existing.qty = new_qty
        existing.line_total_pkr = _unit_price(product, variant) * new_qty
        if body.delivery_date:
            existing.delivery_date = body.delivery_date
        if body.greeting_message:
            existing.greeting_message = body.greeting_message
        await db.flush()
    else:
        unit = _unit_price(product, variant)
        await repo.add_item(
            cart,
            product_id=body.product_id,
            variant_id=body.variant_id,
            qty=body.qty,
            line_total_pkr=unit * body.qty,
            delivery_date=body.delivery_date,
            greeting_message=body.greeting_message,
            recipient_name=body.recipient_name,
            recipient_phone=body.recipient_phone,
        )

    # Expire cached items collection so selectinload re-fetches fresh data
    db.expire(cart, ["items"])
    # Reload cart with fresh relations
    cart = await repo.get_or_create_for_user(user_id)
    return _cart_to_read(cart)


async def update_item(
    db: AsyncSession, user_id: uuid.UUID, item_id: uuid.UUID, body: CartItemUpdate
) -> CartRead:
    repo = CartRepository(db)
    prod_repo = ProductRepository(db)

    cart = await repo.get_or_create_for_user(user_id)
    item = await repo.get_item(item_id, cart.id)
    if not item:
        raise _NOT_FOUND

    if body.qty == 0:
        await repo.delete_item(item)
    else:
        product = await prod_repo.get_by_id(item.product_id)
        if product:
            variant = next((v for v in product.variants if v.id == item.variant_id), None) if item.variant_id else None
            unit = _unit_price(product, variant)
            item.qty = body.qty
            item.line_total_pkr = unit * body.qty
            if body.delivery_date is not None:
                item.delivery_date = body.delivery_date
            if body.greeting_message is not None:
                item.greeting_message = body.greeting_message
            if body.recipient_name is not None:
                item.recipient_name = body.recipient_name
            if body.recipient_phone is not None:
                item.recipient_phone = body.recipient_phone
            await db.flush()

    db.expire(cart, ["items"])
    cart = await repo.get_or_create_for_user(user_id)
    return _cart_to_read(cart)


async def remove_item(db: AsyncSession, user_id: uuid.UUID, item_id: uuid.UUID) -> CartRead:
    repo = CartRepository(db)
    cart = await repo.get_or_create_for_user(user_id)
    item = await repo.get_item(item_id, cart.id)
    if not item:
        raise _NOT_FOUND
    await repo.delete_item(item)
    db.expire(cart, ["items"])
    cart = await repo.get_or_create_for_user(user_id)
    return _cart_to_read(cart)


async def clear_cart(db: AsyncSession, user_id: uuid.UUID) -> CartRead:
    repo = CartRepository(db)
    cart = await repo.get_or_create_for_user(user_id)
    await repo.clear(cart)
    return _cart_to_read(cart)
