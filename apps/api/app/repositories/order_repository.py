import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.sql import Select

from app.models.order import Fulfillment, FulfillmentStatus, Order, OrderItem, Payment


class OrderRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    def _with_relations(self) -> Select[tuple[Order]]:
        return select(Order).options(
            selectinload(Order.items).options(
                selectinload(OrderItem.product),
                selectinload(OrderItem.variant),
            ),
            selectinload(Order.fulfillments).options(
                selectinload(Fulfillment.vendor),
                selectinload(Fulfillment.city),
            ),
            selectinload(Order.payments),
        )

    async def get_by_public_token(self, token: uuid.UUID) -> Order | None:
        result = await self._db.execute(
            self._with_relations().where(Order.public_token == token)
        )
        return result.scalar_one_or_none()

    async def get_by_id(self, order_id: uuid.UUID) -> Order | None:
        result = await self._db.execute(
            self._with_relations().where(Order.id == order_id)
        )
        return result.scalar_one_or_none()

    async def list_for_user(self, user_id: uuid.UUID, limit: int = 20) -> list[Order]:
        result = await self._db.execute(
            self._with_relations()
            .where(Order.user_id == user_id)
            .order_by(Order.placed_at.desc())
            .limit(limit)
        )
        return list(result.scalars().unique().all())

    async def create(self, **kwargs: object) -> Order:
        order = Order(**kwargs)
        self._db.add(order)
        await self._db.flush()
        return order

    async def add_item(self, **kwargs: object) -> OrderItem:
        item = OrderItem(**kwargs)
        self._db.add(item)
        await self._db.flush()
        return item

    async def add_fulfillment(self, **kwargs: object) -> Fulfillment:
        f = Fulfillment(**kwargs)
        self._db.add(f)
        await self._db.flush()
        return f

    async def add_payment(self, **kwargs: object) -> Payment:
        p = Payment(**kwargs)
        self._db.add(p)
        await self._db.flush()
        return p

    async def reload(self, order: Order) -> Order:
        result = await self._db.execute(
            self._with_relations().where(Order.id == order.id)
        )
        return result.scalar_one()

    # ── Vendor fulfillment helpers ─────────────────────────────────────────────

    def _fulfillment_with_relations(self) -> Select[tuple[Fulfillment]]:
        return select(Fulfillment).options(
            selectinload(Fulfillment.vendor),
            selectinload(Fulfillment.city),
            selectinload(Fulfillment.order_items).options(
                selectinload(OrderItem.product),
                selectinload(OrderItem.variant),
            ),
            selectinload(Fulfillment.order).selectinload(Order.payments),
        )

    async def list_fulfillments_for_vendor(
        self,
        vendor_id: uuid.UUID,
        status: FulfillmentStatus | None = None,
        limit: int = 50,
    ) -> list[Fulfillment]:
        q = self._fulfillment_with_relations().where(Fulfillment.vendor_id == vendor_id)
        if status:
            q = q.where(Fulfillment.status == status)
        q = q.order_by(Fulfillment.delivery_date.asc()).limit(limit)
        result = await self._db.execute(q)
        return list(result.scalars().unique().all())

    async def get_fulfillment(
        self, fulfillment_id: uuid.UUID, vendor_id: uuid.UUID
    ) -> Fulfillment | None:
        result = await self._db.execute(
            self._fulfillment_with_relations()
            .where(Fulfillment.id == fulfillment_id, Fulfillment.vendor_id == vendor_id)
        )
        return result.scalar_one_or_none()

    async def update_fulfillment(self, fulfillment: Fulfillment, **kwargs: Any) -> Fulfillment:
        for key, value in kwargs.items():
            setattr(fulfillment, key, value)
        await self._db.flush()
        return fulfillment
