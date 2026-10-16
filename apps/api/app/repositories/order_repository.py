import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import Date, case, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.sql import Select

from app.models.catalog import City
from app.models.order import (
    CardNoteReport,
    Fulfillment,
    FulfillmentStatus,
    Order,
    OrderItem,
    OrderMessage,
    OrderStatus,
    Payment,
)


class OrderRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def on_time_counts(self, since: datetime, vendor_id: uuid.UUID | None = None) -> tuple[int, int]:
        """(delivered, on_time) for fulfillments delivered since `since`.

        On time = delivered on or before the chosen delivery date, judged by
        the calendar day in the delivery city's own time zone.
        """
        local_day = cast(func.timezone(City.timezone, Fulfillment.delivered_at), Date)
        stmt = (
            select(
                func.count(),
                func.coalesce(func.sum(case((local_day <= Fulfillment.delivery_date, 1), else_=0)), 0),
            )
            .join(City, City.id == Fulfillment.city_id)
            .where(
                Fulfillment.status == FulfillmentStatus.delivered,
                Fulfillment.delivered_at.is_not(None),
                Fulfillment.delivered_at >= since,
            )
        )
        if vendor_id is not None:
            stmt = stmt.where(Fulfillment.vendor_id == vendor_id)
        delivered, on_time = (await self._db.execute(stmt)).one()
        return int(delivered), int(on_time)

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
            selectinload(Order.manual_messages),
            selectinload(Order.user),
        )

    async def get_by_idempotency_key(self, key: str) -> Order | None:
        result = await self._db.execute(
            self._with_relations().where(Order.idempotency_key == key)
        )
        return result.scalar_one_or_none()

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

    async def find_duplicate(
        self, contact_phone: str, recipient_phone: str, delivery_date: date
    ) -> Order | None:
        """A live order from the same buyer phone to the same recipient on the same day."""
        result = await self._db.execute(
            select(Order)
            .join(Fulfillment, Fulfillment.order_id == Order.id)
            .where(
                Order.contact_phone == contact_phone,
                Fulfillment.recipient_phone == recipient_phone,
                Fulfillment.delivery_date == delivery_date,
                Order.status.not_in([OrderStatus.cancelled, OrderStatus.refunded]),
            )
            .limit(1)
        )
        return result.scalars().first()

    async def list_open_since(self, since: datetime, limit: int = 200) -> list[Order]:
        """Orders placed since ``since`` that aren't finished, newest first."""
        result = await self._db.execute(
            self._with_relations()
            .where(
                Order.placed_at >= since,
                Order.status.not_in([OrderStatus.cancelled, OrderStatus.refunded, OrderStatus.completed]),
            )
            .order_by(Order.placed_at.desc())
            .limit(limit)
        )
        return list(result.scalars().unique().all())

    async def campaign_sales(self, since: datetime) -> list[tuple[str, str | None, int, int, int]]:
        """Per (source, campaign) since ``since``, cancelled/refunded excluded:
        orders, orders past payment, and their total in paisa."""
        progressed = Order.status != OrderStatus.pending_payment
        result = await self._db.execute(
            select(
                Order.source,
                Order.campaign,
                func.count(),
                func.count().filter(progressed),
                func.coalesce(func.sum(Order.total_pkr).filter(progressed), 0),
            )
            .where(
                Order.placed_at >= since,
                Order.status.not_in([OrderStatus.cancelled, OrderStatus.refunded]),
            )
            .group_by(Order.source, Order.campaign)
        )
        return [(src, camp, int(n), int(paid), int(rev)) for src, camp, n, paid, rev in result.all()]

    async def get_message(self, order_id: uuid.UUID, kind: str) -> OrderMessage | None:
        result = await self._db.execute(
            select(OrderMessage).where(OrderMessage.order_id == order_id, OrderMessage.kind == kind)
        )
        return result.scalar_one_or_none()

    async def add_message(self, **kwargs: object) -> OrderMessage:
        message = OrderMessage(**kwargs)
        self._db.add(message)
        await self._db.flush()
        return message

    async def get_item_by_note_token(self, token: uuid.UUID) -> OrderItem | None:
        result = await self._db.execute(
            select(OrderItem)
            .options(
                selectinload(OrderItem.product),
                selectinload(OrderItem.order),
                selectinload(OrderItem.fulfillment),
            )
            .where(OrderItem.note_token == token)
        )
        return result.scalar_one_or_none()

    async def get_note_report(self, item_id: uuid.UUID, reporter_ip: str) -> CardNoteReport | None:
        result = await self._db.execute(
            select(CardNoteReport).where(
                CardNoteReport.order_item_id == item_id, CardNoteReport.reporter_ip == reporter_ip
            )
        )
        return result.scalar_one_or_none()

    async def list_note_reports(self, item_id: uuid.UUID | None = None) -> list[CardNoteReport]:
        query = select(CardNoteReport).options(
            selectinload(CardNoteReport.order_item).selectinload(OrderItem.product),
            selectinload(CardNoteReport.order_item).selectinload(OrderItem.order),
        )
        if item_id is not None:
            query = query.where(CardNoteReport.order_item_id == item_id)
        result = await self._db.execute(query.order_by(CardNoteReport.created_at.desc()).limit(1000))
        return list(result.scalars().all())

    async def get_item_with_note_reports(self, item_id: uuid.UUID) -> OrderItem | None:
        """An order item that has at least one note report (what the admin may act on)."""
        result = await self._db.execute(
            select(OrderItem).where(
                OrderItem.id == item_id,
                select(CardNoteReport.id).where(CardNoteReport.order_item_id == item_id).exists(),
            )
        )
        return result.scalar_one_or_none()

    async def add_note_report(self, **kwargs: object) -> CardNoteReport:
        report = CardNoteReport(**kwargs)
        self._db.add(report)
        await self._db.flush()
        return report

    async def get_fulfillment_by_thanks_token(self, token: uuid.UUID) -> Fulfillment | None:
        result = await self._db.execute(
            self._fulfillment_with_relations().where(Fulfillment.thanks_token == token)
        )
        return result.scalar_one_or_none()

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
