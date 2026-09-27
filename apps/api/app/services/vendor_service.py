"""Business logic for the Vendor Portal."""
import uuid
from datetime import UTC, datetime

import structlog
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.catalog import Product, Vendor
from app.models.order import (
    Fulfillment,
    FulfillmentStatus,
    Order,
    OrderStatus,
    PaymentMethod,
    PaymentStatus,
)
from app.models.user import User
from app.repositories.catalog_repository import ProductRepository, VendorRepository
from app.repositories.order_repository import OrderRepository
from app.repositories.user_repository import UserRepository
from app.schemas.catalog import VendorUpdate
from app.schemas.vendor import FulfillmentStatusUpdate, VendorFulfillmentRead
from app.workers.notification_tasks import enqueue_fulfillment_update

logger = structlog.get_logger()


def _NOT_FOUND(noun: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{noun} not found")
_FORBIDDEN = HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a vendor account")

# Fulfillment legs only move forward. Vendors may skip intermediate stages
# (e.g. pending → dispatched) but can never go back, and delivered/failed are final.
_FULFILLMENT_ORDER: dict[FulfillmentStatus, int] = {
    FulfillmentStatus.pending: 0,
    FulfillmentStatus.preparing: 1,
    FulfillmentStatus.ready: 2,
    FulfillmentStatus.dispatched: 3,
    FulfillmentStatus.out_for_delivery: 4,
    FulfillmentStatus.delivered: 5,
}
_FINAL_FULFILLMENT = {FulfillmentStatus.delivered, FulfillmentStatus.failed}
# Orders in these states are frozen for vendors; only staff can move them.
_FROZEN_ORDER = {OrderStatus.cancelled, OrderStatus.refunded, OrderStatus.on_hold}
# Order statuses the fulfillment aggregate must never overwrite.
_TERMINAL_ORDER = {OrderStatus.completed, OrderStatus.cancelled, OrderStatus.refunded, OrderStatus.on_hold}


def _conflict(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


def _is_allowed_transition(current: FulfillmentStatus, new: FulfillmentStatus) -> bool:
    """Same-status updates (e.g. adding a tracking number) are fine until the leg is final."""
    if current in _FINAL_FULFILLMENT:
        return False
    if current == new:
        return True
    if new == FulfillmentStatus.failed:
        return True
    return _FULFILLMENT_ORDER[new] > _FULFILLMENT_ORDER[current]


def _is_cleared_for_fulfillment(order: Order) -> bool:
    """COD orders are paid on delivery; every other method must be paid first."""
    if not order.payments:
        return False
    payment = order.payments[0]
    return payment.method == PaymentMethod.cod or payment.status == PaymentStatus.paid


async def _get_vendor_or_403(db: AsyncSession, user: User) -> Vendor:
    """Return the Vendor owned by this user, or raise 403."""
    vendor = await VendorRepository(db).get_by_owner(user.id)
    if not vendor:
        raise _FORBIDDEN
    return vendor


async def get_my_vendor(db: AsyncSession, user: User) -> Vendor:
    return await _get_vendor_or_403(db, user)


async def update_my_vendor(db: AsyncSession, user: User, data: VendorUpdate) -> Vendor:
    vendor = await _get_vendor_or_403(db, user)
    updates = data.model_dump(exclude_none=True)
    if not updates:
        return vendor
    return await VendorRepository(db).update(vendor, **updates)


async def list_my_fulfillments(
    db: AsyncSession,
    user: User,
    filter_status: FulfillmentStatus | None = None,
) -> list[VendorFulfillmentRead]:
    vendor = await _get_vendor_or_403(db, user)
    repo = OrderRepository(db)
    fulfillments = await repo.list_fulfillments_for_vendor(vendor.id, status=filter_status)
    return [_fulfillment_to_read(f) for f in fulfillments]


async def update_fulfillment(
    db: AsyncSession,
    user: User,
    fulfillment_id: uuid.UUID,
    data: FulfillmentStatusUpdate,
) -> VendorFulfillmentRead:
    vendor = await _get_vendor_or_403(db, user)
    repo = OrderRepository(db)

    fulfillment = await repo.get_fulfillment(fulfillment_id, vendor.id)
    if not fulfillment:
        raise _NOT_FOUND("Fulfillment")

    parent = fulfillment.order
    if parent.status in _FROZEN_ORDER:
        raise _conflict(f"Order is {parent.status.value}; fulfillment cannot be updated")
    if not _is_allowed_transition(fulfillment.status, data.status):
        raise _conflict(f"Cannot move fulfillment from {fulfillment.status.value} to {data.status.value}")
    if data.status not in (FulfillmentStatus.pending, FulfillmentStatus.failed) and not _is_cleared_for_fulfillment(parent):
        raise _conflict("Payment has not been verified for this order yet")

    kwargs: dict[str, object] = {"status": data.status}
    if data.courier_tracking is not None:
        kwargs["courier_tracking"] = data.courier_tracking
    if data.status == FulfillmentStatus.dispatched and not fulfillment.dispatched_at:
        kwargs["dispatched_at"] = datetime.now(UTC)
    if data.status == FulfillmentStatus.delivered and not fulfillment.delivered_at:
        kwargs["delivered_at"] = datetime.now(UTC)

    status_changed = data.status != fulfillment.status
    fulfillment = await repo.update_fulfillment(fulfillment, **kwargs)
    if status_changed:
        await _notify_buyer(db, parent, fulfillment)

    # Propagate to order status
    order = await repo.get_by_id(fulfillment.order_id)
    if order:
        await _sync_order_status(db, order)

    return _fulfillment_to_read(fulfillment)


async def list_my_products(
    db: AsyncSession,
    user: User,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Product], int]:
    vendor = await _get_vendor_or_403(db, user)
    return await ProductRepository(db).list(vendor_id=vendor.id, active_only=False, page=page, page_size=page_size)


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _notify_buyer(db: AsyncSession, order: Order, fulfillment: Fulfillment) -> None:
    """Queue a status update for the buyer (best-effort).

    Runs in a SAVEPOINT, like the checkout confirmation, so an outbox failure
    never blocks the vendor's status change.
    """
    try:
        buyer = await UserRepository(db).get_by_id(order.user_id) if order.user_id else None
        async with db.begin_nested():
            await enqueue_fulfillment_update(
                db=db,
                order_id=order.id,
                fulfillment_id=fulfillment.id,
                public_token=order.public_token,
                status=fulfillment.status.value,
                recipient_name=fulfillment.recipient_name,
                buyer_email=buyer.email if buyer else order.contact_email,
                buyer_phone=buyer.phone if buyer else order.contact_phone,
            )
    except Exception:
        await logger.aexception("fulfillment_notification_enqueue_failed", order_id=str(order.id))


def _fulfillment_to_read(f: Fulfillment) -> VendorFulfillmentRead:
    item_count = sum(i.qty for i in f.order_items)
    subtotal = sum(i.line_total_pkr for i in f.order_items)
    return VendorFulfillmentRead(
        id=f.id,
        order_id=f.order_id,
        public_token=f.order.public_token if f.order else uuid.uuid4(),
        order_status=f.order.status if f.order else OrderStatus.pending_payment,
        payment_method=f.order.payments[0].method if f.order and f.order.payments else None,
        status=f.status,
        delivery_date=f.delivery_date,
        delivery_slot=f.delivery_slot,
        recipient_name=f.recipient_name,
        recipient_phone=f.recipient_phone,
        address_line1=f.address_line1,
        address_line2=f.address_line2,
        city_name=f.city.name,
        landmark=f.landmark,
        courier_tracking=f.courier_tracking,
        dispatched_at=f.dispatched_at,
        delivered_at=f.delivered_at,
        item_count=item_count,
        subtotal_pkr=subtotal,
    )


async def _sync_order_status(
    db: AsyncSession, order: Order
) -> None:
    """Derive order status from the aggregate of its fulfillments."""
    fulfillments = order.fulfillments
    if not fulfillments:
        return

    statuses = {f.status for f in fulfillments}

    if all(s == FulfillmentStatus.delivered for s in statuses):
        new_order_status = OrderStatus.delivered
    elif FulfillmentStatus.dispatched in statuses or FulfillmentStatus.out_for_delivery in statuses:
        new_order_status = OrderStatus.dispatched
    elif FulfillmentStatus.preparing in statuses or FulfillmentStatus.ready in statuses:
        new_order_status = OrderStatus.preparing
    else:
        return

    if order.status in _TERMINAL_ORDER:
        return

    if order.status != new_order_status:
        order.status = new_order_status
        await db.flush()
