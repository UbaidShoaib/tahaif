"""Business logic for the Vendor Portal."""
import uuid
from datetime import UTC, datetime

import structlog
from fastapi import HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations import s3_client
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
from app.schemas.vendor import (
    FulfillmentStatusUpdate,
    VendorFulfillmentRead,
    VendorLineItem,
)
from app.services import audit_service, proof_service
from app.services.cart_service import bucket_contents
from app.workers.notification_tasks import (
    enqueue_fulfillment_update,
    enqueue_recipient_update,
)

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


async def get_my_fulfillment(db: AsyncSession, user: User, fulfillment_id: uuid.UUID) -> VendorFulfillmentRead:
    vendor = await _get_vendor_or_403(db, user)
    fulfillment = await OrderRepository(db).get_fulfillment(fulfillment_id, vendor.id)
    if not fulfillment:
        raise _NOT_FOUND("Fulfillment")
    return _fulfillment_to_read(fulfillment)


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
    extra: dict[str, object] = {}
    if data.courier_tracking is not None:
        extra["courier_tracking"] = data.courier_tracking
    fulfillment = await _move_fulfillment(db, user, repo, fulfillment, parent, data.status, extra)
    return _fulfillment_to_read(fulfillment)


# Delivery photos make sense once the gift has left the shop.
_PHOTO_ALLOWED_FROM = {
    FulfillmentStatus.dispatched,
    FulfillmentStatus.out_for_delivery,
    FulfillmentStatus.delivered,
}


async def confirm_delivery_with_photo(
    db: AsyncSession,
    user: User,
    fulfillment_id: uuid.UUID,
    file: UploadFile,
    received_by: str | None,
) -> VendorFulfillmentRead:
    """Attach a proof-of-delivery photo and mark the fulfillment delivered.

    One step for the rider: if the gift isn't marked delivered yet, this does
    it, so the buyer's "delivered" message already points to the photo. On an
    already-delivered fulfillment it adds or replaces the photo.
    """
    vendor = await _get_vendor_or_403(db, user)
    repo = OrderRepository(db)
    fulfillment = await repo.get_fulfillment(fulfillment_id, vendor.id)
    if not fulfillment:
        raise _NOT_FOUND("Fulfillment")
    parent = fulfillment.order
    if parent.status in _FROZEN_ORDER:
        raise _conflict(f"Order is {parent.status.value}; fulfillment cannot be updated")
    if fulfillment.status not in _PHOTO_ALLOWED_FROM:
        raise _conflict("A delivery photo can be added once the order has been dispatched")

    key = await s3_client.upload_delivery_photo(
        str(parent.id), str(fulfillment.id), await file.read(), file.content_type or ""
    )
    extra: dict[str, object] = {"delivery_photo_key": key}
    if received_by is not None:
        extra["received_by"] = received_by.strip() or None
    if fulfillment.status == FulfillmentStatus.delivered:
        # Delivered is final: just swap the photo, no status move or re-notification.
        fulfillment = await repo.update_fulfillment(fulfillment, **extra)
    else:
        fulfillment = await _move_fulfillment(db, user, repo, fulfillment, parent, FulfillmentStatus.delivered, extra)
    return _fulfillment_to_read(fulfillment)


async def _move_fulfillment(
    db: AsyncSession,
    actor: User,
    repo: OrderRepository,
    fulfillment: Fulfillment,
    parent: Order,
    new_status: FulfillmentStatus,
    extra: dict[str, object],
) -> Fulfillment:
    """Validate and apply a status move, stamp timestamps, notify the buyer on a
    real change and roll the status up to the order."""
    if not _is_allowed_transition(fulfillment.status, new_status):
        raise _conflict(f"Cannot move fulfillment from {fulfillment.status.value} to {new_status.value}")
    if new_status not in (FulfillmentStatus.pending, FulfillmentStatus.failed) and not _is_cleared_for_fulfillment(parent):
        raise _conflict("Payment has not been verified for this order yet")

    kwargs: dict[str, object] = {"status": new_status, **extra}
    if new_status == FulfillmentStatus.dispatched and not fulfillment.dispatched_at:
        kwargs["dispatched_at"] = datetime.now(UTC)
    if new_status == FulfillmentStatus.delivered and not fulfillment.delivered_at:
        kwargs["delivered_at"] = datetime.now(UTC)

    status_changed = new_status != fulfillment.status
    before = {"status": fulfillment.status, "courier_tracking": fulfillment.courier_tracking}
    fulfillment = await repo.update_fulfillment(fulfillment, **kwargs)
    # Logged against the order so it shows on the order's timeline.
    await audit_service.record(
        db, actor, "fulfillment.updated", "order", fulfillment.order_id,
        before=before,
        after={"status": fulfillment.status, "courier_tracking": fulfillment.courier_tracking},
        context={"recipient": fulfillment.recipient_name},
    )
    if status_changed:
        await _notify(db, parent, fulfillment)

    order = await repo.get_by_id(fulfillment.order_id)
    if order:
        await _sync_order_status(db, order)
    return fulfillment


async def list_my_products(
    db: AsyncSession,
    user: User,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Product], int]:
    vendor = await _get_vendor_or_403(db, user)
    return await ProductRepository(db).list(vendor_id=vendor.id, active_only=False, page=page, page_size=page_size)


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _notify(db: AsyncSession, order: Order, fulfillment: Fulfillment) -> None:
    """Queue status messages for the buyer and, where due, the recipient (best-effort).

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
                has_photo=fulfillment.delivery_photo_key is not None,
                buyer_email=buyer.email if buyer else order.contact_email,
                buyer_phone=buyer.phone if buyer else order.contact_phone,
            )
            await enqueue_recipient_update(
                db=db,
                order_id=order.id,
                fulfillment_id=fulfillment.id,
                status=fulfillment.status.value,
                surprise=order.surprise,
                recipient_name=fulfillment.recipient_name,
                recipient_phone=fulfillment.recipient_phone,
                gift_from=order.gift_from,
                has_note=any(i.note_key for i in fulfillment.order_items),
                thanks_token=fulfillment.thanks_token,
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
        delivery_photo_url=proof_service.signed_delivery_photo_url(f.delivery_photo_key),
        received_by=f.received_by,
        item_count=item_count,
        subtotal_pkr=subtotal,
        surprise=f.order.surprise if f.order else False,
        thanks_token=f.thanks_token,
        items=[
            VendorLineItem(
                product_name=i.product.name,
                variant_name=i.variant.name if i.variant else None,
                qty=i.qty,
                greeting_message=i.greeting_message,
                note_token=i.note_token if i.note_key else None,
                bucket_contents=bucket_contents(i.customization),
            )
            for i in f.order_items
        ],
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
