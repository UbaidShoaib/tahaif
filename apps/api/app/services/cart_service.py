import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bucket import BucketStatus, CustomBucket
from app.models.catalog import Product, ProductCity, ProductVariant
from app.models.order import Cart, CartItem
from app.repositories.cart_repository import CartRepository
from app.repositories.catalog_repository import ProductRepository
from app.schemas.cart import CartItemAdd, CartItemRead, CartItemUpdate, CartRead

_NOT_FOUND = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not in cart")
_OUT_OF_STOCK = HTTPException(
    status_code=status.HTTP_409_CONFLICT, detail="Selected variant is out of stock"
)
GUEST_CART_TTL = timedelta(days=30)


@dataclass(frozen=True)
class CartOwner:
    """Whose cart this is: a signed-in user, a guest (by the X-Cart-Token they hold), or both.

    With both, the guest cart is merged into the user's cart (ADR 0004).
    """

    user_id: uuid.UUID | None = None
    guest_token: str | None = None


def hash_token(token: str) -> str:
    """Only this hash is stored, so a database leak doesn't expose usable cart tokens."""
    return hashlib.sha256(token.encode()).hexdigest()


def new_guest_token() -> str:
    return secrets.token_urlsafe(32)



def _clean_greeting(message: str | None) -> str | None:
    """Trim a greeting-card message; blank means no card."""
    if message is None:
        return None
    return message.strip() or None

def _unit_price(
    product: Product,
    variant: ProductVariant | None,
    customization: dict[str, object] | None = None,
    pc: ProductCity | None = None,
) -> int:
    """Price of one unit; with the delivery city's row, that city's price override applies."""
    base = pc.price_override_pkr if pc is not None and pc.price_override_pkr is not None else product.base_price_pkr
    delta = variant.price_delta_pkr if variant else 0
    return base + delta + bucket_extra_pkr(customization)


def bucket_extra_pkr(customization: dict[str, object] | None) -> int:
    """What a custom bucket's components add to its base price (ADR 0014).

    The bucket service writes this total when the bucket goes into the cart, from
    prices it read on the server; the client never supplies it.
    """
    if not customization:
        return 0
    extra = customization.get("components_total_pkr")
    return extra if isinstance(extra, int) else 0


def _item_to_read(item: CartItem) -> CartItemRead:
    product = item.product
    variant = item.variant
    unit = _unit_price(product, variant, item.customization)
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


def cart_to_read(cart: Cart | None, guest_token: str | None = None) -> CartRead:
    if cart is None:
        return CartRead(id=None, item_count=0, subtotal_pkr=0, items=[], guest_token=None)
    item_reads = [_item_to_read(i) for i in cart.items]
    subtotal = sum(r.line_total_pkr for r in item_reads)
    return CartRead(
        id=cart.id,
        item_count=sum(r.qty for r in item_reads),
        subtotal_pkr=subtotal,
        items=item_reads,
        guest_token=guest_token if cart.user_id is None else None,
    )


def bucket_contents(customization: dict[str, object] | None) -> list[str]:
    """A custom bucket's components as lines to read or pack, e.g. "2 × Red Rose"."""
    components = (customization or {}).get("components")
    if not isinstance(components, list):
        return []
    return [f"{c['qty']} × {c['name']}" for c in components if isinstance(c, dict)]


def _is_bucket(item: CartItem) -> bool:
    return bool(item.customization and "bucket_id" in item.customization)


def bucket_id_of(item: CartItem) -> uuid.UUID | None:
    """The custom bucket a cart line holds, if it is one (ADR 0014)."""
    bucket_id = (item.customization or {}).get("bucket_id")
    return uuid.UUID(str(bucket_id)) if bucket_id else None


async def release_buckets(db: AsyncSession, items: list[CartItem]) -> None:
    """Buckets taken out of the cart can be edited and added again (ADR 0014)."""
    ids = [bucket_id for i in items if (bucket_id := bucket_id_of(i))]
    if ids:
        await db.execute(
            update(CustomBucket)
            .where(CustomBucket.id.in_(ids), CustomBucket.status == BucketStatus.IN_CART)
            .values(status=BucketStatus.DRAFT)
        )


def _as_owner(owner: CartOwner | uuid.UUID) -> CartOwner:
    return owner if isinstance(owner, CartOwner) else CartOwner(user_id=owner)


async def _merge_guest_cart(repo: CartRepository, guest: Cart, user_cart: Cart) -> Cart:
    """Move a guest cart's lines into the user's cart, then delete the guest cart."""
    for item in list(guest.items):
        same = None if _is_bucket(item) else next(
            (
                i for i in user_cart.items
                if i.product_id == item.product_id and i.variant_id == item.variant_id and not _is_bucket(i)
            ),
            None,
        )
        if same:
            same.qty += item.qty
            same.line_total_pkr = _unit_price(same.product, same.variant, same.customization) * same.qty
            if not same.greeting_message and item.greeting_message:
                same.greeting_message = item.greeting_message
            await repo.delete_item(item)
        else:
            await repo.move_item(item, user_cart)
    await repo.delete_cart(await repo.reload(guest))
    return await repo.reload(user_cart)


async def resolve_cart(
    db: AsyncSession, owner: CartOwner | uuid.UUID, *, create: bool
) -> tuple[Cart | None, str | None]:
    """The owner's cart and the guest token to hand back (None for signed-in carts).

    A guest without a cart gets a new token and cart only when ``create`` is set
    (i.e. when adding an item), so browsing never creates empty carts.
    """
    owner = _as_owner(owner)
    repo = CartRepository(db)

    if owner.user_id:
        cart = await repo.get_or_create_for_user(owner.user_id)
        if owner.guest_token:
            guest = await repo.get_by_session(hash_token(owner.guest_token))
            if guest:
                cart = await _merge_guest_cart(repo, guest, cart)
        return cart, None

    if owner.guest_token:
        guest = await repo.get_by_session(hash_token(owner.guest_token))
        if guest and (guest.expires_at is None or guest.expires_at > datetime.now(UTC)):
            guest.expires_at = datetime.now(UTC) + GUEST_CART_TTL  # sliding expiry
            return guest, owner.guest_token

    if not create:
        return None, None
    token = new_guest_token()
    return await repo.create_for_session(hash_token(token), datetime.now(UTC) + GUEST_CART_TTL), token


async def get_cart(db: AsyncSession, owner: CartOwner | uuid.UUID) -> CartRead:
    cart, token = await resolve_cart(db, owner, create=False)
    return cart_to_read(cart, token)


async def add_item(db: AsyncSession, owner: CartOwner | uuid.UUID, body: CartItemAdd) -> CartRead:
    repo = CartRepository(db)
    prod_repo = ProductRepository(db)

    product = await prod_repo.get_by_id(body.product_id)
    if not product or not product.is_active or not product.vendor.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    if product.builder_kind:
        # On its own it's an empty basket; it reaches the cart through a bucket (ADR 0014).
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Build your {product.builder_kind} first at /build/{product.slug}",
        )

    variant: ProductVariant | None = None
    if body.variant_id:
        variant = next((v for v in product.variants if v.id == body.variant_id), None)
        if not variant or not variant.is_active:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Variant not found")
        if not variant.has_stock(body.qty):
            raise _OUT_OF_STOCK

    cart, token = await resolve_cart(db, owner, create=True)
    assert cart is not None

    # If same product+variant already in cart, increase qty
    existing = next(
        (
            i for i in cart.items
            if i.product_id == body.product_id and i.variant_id == body.variant_id and not _is_bucket(i)
        ),
        None,
    )
    if existing:
        new_qty = existing.qty + body.qty
        if variant and not variant.has_stock(new_qty):
            raise _OUT_OF_STOCK
        existing.qty = new_qty
        existing.line_total_pkr = _unit_price(product, variant) * new_qty
        if body.delivery_date:
            existing.delivery_date = body.delivery_date
        if _clean_greeting(body.greeting_message):
            existing.greeting_message = _clean_greeting(body.greeting_message)
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
            greeting_message=_clean_greeting(body.greeting_message),
            recipient_name=body.recipient_name,
            recipient_phone=body.recipient_phone,
        )

    return cart_to_read(await repo.reload(cart), token)


async def add_bucket_line(
    db: AsyncSession, owner: CartOwner | uuid.UUID, product: Product, customization: dict[str, object]
) -> CartRead:
    """Add a finished custom bucket as its own cart line (never merged with another)."""
    repo = CartRepository(db)
    cart, token = await resolve_cart(db, owner, create=True)
    assert cart is not None
    await repo.add_item(
        cart,
        product_id=product.id,
        qty=1,
        customization=customization,
        line_total_pkr=_unit_price(product, None, customization),
    )
    return cart_to_read(await repo.reload(cart), token)


async def update_item(
    db: AsyncSession, owner: CartOwner | uuid.UUID, item_id: uuid.UUID, body: CartItemUpdate
) -> CartRead:
    repo = CartRepository(db)
    prod_repo = ProductRepository(db)

    cart, token = await resolve_cart(db, owner, create=False)
    item = await repo.get_item(item_id, cart.id) if cart else None
    if not cart or not item:
        raise _NOT_FOUND

    if body.qty == 0:
        await release_buckets(db, [item])
        await repo.delete_item(item)
    else:
        product = await prod_repo.get_by_id(item.product_id)
        if product:
            variant = next((v for v in product.variants if v.id == item.variant_id), None) if item.variant_id else None
            unit = _unit_price(product, variant, item.customization)
            item.qty = body.qty
            item.line_total_pkr = unit * body.qty
            if body.delivery_date is not None:
                item.delivery_date = body.delivery_date
            if body.greeting_message is not None:
                # A blank message clears the card rather than storing "".
                item.greeting_message = _clean_greeting(body.greeting_message)
            if body.recipient_name is not None:
                item.recipient_name = body.recipient_name
            if body.recipient_phone is not None:
                item.recipient_phone = body.recipient_phone
            await db.flush()

    return cart_to_read(await repo.reload(cart), token)


async def remove_item(db: AsyncSession, owner: CartOwner | uuid.UUID, item_id: uuid.UUID) -> CartRead:
    repo = CartRepository(db)
    cart, token = await resolve_cart(db, owner, create=False)
    item = await repo.get_item(item_id, cart.id) if cart else None
    if not cart or not item:
        raise _NOT_FOUND
    await release_buckets(db, [item])
    await repo.delete_item(item)
    return cart_to_read(await repo.reload(cart), token)


async def clear_cart(db: AsyncSession, owner: CartOwner | uuid.UUID) -> CartRead:
    repo = CartRepository(db)
    cart, token = await resolve_cart(db, owner, create=False)
    if cart:
        await release_buckets(db, list(cart.items))
        await repo.clear(cart)
    return cart_to_read(cart, token)
