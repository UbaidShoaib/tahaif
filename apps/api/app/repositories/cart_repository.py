import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.sql import Select

from app.models.catalog import Product
from app.models.order import Cart, CartItem


class CartRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    def _with_items(self) -> Select[tuple[Cart]]:
        return select(Cart).options(
            selectinload(Cart.items).options(
                selectinload(CartItem.product).options(
                    selectinload(Product.images),
                    selectinload(Product.product_cities),
                    selectinload(Product.variants),
                    selectinload(Product.vendor),
                ),
                selectinload(CartItem.variant),
            )
        )

    async def get_by_user(self, user_id: uuid.UUID) -> Cart | None:
        result = await self._db.execute(self._with_items().where(Cart.user_id == user_id))
        return result.scalar_one_or_none()

    async def get_or_create_for_user(self, user_id: uuid.UUID) -> Cart:
        cart = await self.get_by_user(user_id)
        if not cart:
            cart = Cart(user_id=user_id, created_at=datetime.now(UTC))
            self._db.add(cart)
            await self._db.flush()
            result = await self._db.execute(
                self._with_items().where(Cart.id == cart.id)
            )
            cart = result.scalar_one()
        return cart

    async def get_by_session(self, token_hash: str) -> Cart | None:
        """A guest cart by the hash of its token (ADR 0004)."""
        result = await self._db.execute(
            self._with_items().where(Cart.session_token == token_hash, Cart.user_id.is_(None))
        )
        return result.scalar_one_or_none()

    async def create_for_session(self, token_hash: str, expires_at: datetime) -> Cart:
        cart = Cart(session_token=token_hash, created_at=datetime.now(UTC), expires_at=expires_at)
        self._db.add(cart)
        await self._db.flush()
        result = await self._db.execute(self._with_items().where(Cart.id == cart.id))
        return result.scalar_one()

    async def reload(self, cart: Cart) -> Cart:
        """Fresh copy of a cart with its items, after items were changed."""
        self._db.expire(cart, ["items"])
        result = await self._db.execute(self._with_items().where(Cart.id == cart.id))
        return result.scalar_one()

    async def lock(self, cart: Cart) -> Cart:
        """Lock the cart row, then reload its items as committed by whoever held the lock.

        Two checkouts of one cart (a double tap) run one after the other; the second
        finds the cart already emptied by the first.
        """
        await self._db.execute(select(Cart.id).where(Cart.id == cart.id).with_for_update())
        self._db.expire(cart, ["items"])
        result = await self._db.execute(
            self._with_items().where(Cart.id == cart.id).execution_options(populate_existing=True)
        )
        return result.scalar_one()

    async def move_item(self, item: CartItem, to_cart: Cart) -> None:
        item.cart_id = to_cart.id
        await self._db.flush()

    async def add_item(self, cart: Cart, **kwargs: object) -> CartItem:
        item = CartItem(cart_id=cart.id, **kwargs)
        self._db.add(item)
        await self._db.flush()
        await self._db.refresh(item, ["product", "variant"])
        return item

    async def get_item(self, item_id: uuid.UUID, cart_id: uuid.UUID) -> CartItem | None:
        result = await self._db.execute(
            select(CartItem)
            .where(CartItem.id == item_id, CartItem.cart_id == cart_id)
            .options(selectinload(CartItem.product), selectinload(CartItem.variant))
        )
        return result.scalar_one_or_none()

    async def delete_item(self, item: CartItem) -> None:
        await self._db.delete(item)
        await self._db.flush()

    async def clear(self, cart: Cart) -> None:
        for item in list(cart.items):
            await self._db.delete(item)
        await self._db.flush()
        await self._db.refresh(cart, ["items"])

    async def delete_cart(self, cart: Cart) -> None:
        await self._db.delete(cart)
        await self._db.flush()
