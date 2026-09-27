"""The recipient's thank-you back to the buyer (diaspora Release B).

The recipient opens /thanks/{thanks_token} from a QR on the card or a link in
their WhatsApp message, and sends text and/or one photo, voice note or video.
The token only unlocks this page: no prices, order details or tracking.
"""

import uuid
from datetime import UTC, datetime

import structlog
from fastapi import HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations import s3_client
from app.models.order import Fulfillment, OrderStatus
from app.repositories.order_repository import OrderRepository
from app.repositories.user_repository import UserRepository
from app.schemas.order import ThanksPage, ThanksRead
from app.services import proof_service
from app.workers.notification_tasks import enqueue_thanks_received

logger = structlog.get_logger()

MAX_THANKS_MESSAGE = 1000
_CLOSED = {OrderStatus.cancelled, OrderStatus.refunded}
_NOT_FOUND = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This link isn't valid")


async def _open_fulfillment(db: AsyncSession, token: uuid.UUID) -> Fulfillment:
    fulfillment = await OrderRepository(db).get_fulfillment_by_thanks_token(token)
    if not fulfillment or fulfillment.order.status in _CLOSED:
        raise _NOT_FOUND
    return fulfillment


async def get_page(db: AsyncSession, token: uuid.UUID) -> ThanksPage:
    f = await _open_fulfillment(db, token)
    return ThanksPage(
        recipient_name=f.recipient_name,
        gift_from=f.order.gift_from,
        items=[i.product.name for i in f.order_items],
        already_sent=f.thanks_at is not None,
    )


async def send_thanks(
    db: AsyncSession, token: uuid.UUID, message: str | None, file: UploadFile | None
) -> None:
    f = await _open_fulfillment(db, token)
    text = (message or "").strip()[:MAX_THANKS_MESSAGE] or None
    has_file = file is not None and bool(file.filename)
    if not text and not has_file:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Write a message or add a photo, voice note or video",
        )
    if has_file and file is not None:
        data = await file.read(s3_client.MAX_NOTE_BYTES + 1)
        content_type = (file.content_type or "").split(";")[0].strip()
        f.thanks_media_key = await s3_client.upload_thanks_media(str(f.order_id), str(f.id), data, content_type)
        f.thanks_media_type = content_type
    f.thanks_message = text
    first_reply = f.thanks_at is None
    f.thanks_at = datetime.now(UTC)
    await db.flush()
    if first_reply:
        await _notify_buyer(db, f)


async def _notify_buyer(db: AsyncSession, f: Fulfillment) -> None:
    """Tell the buyer (best-effort, in a SAVEPOINT, like the other notifications)."""
    order = f.order
    try:
        buyer = await UserRepository(db).get_by_id(order.user_id) if order.user_id else None
        async with db.begin_nested():
            await enqueue_thanks_received(
                db=db,
                order_id=order.id,
                public_token=order.public_token,
                recipient_name=f.recipient_name,
                buyer_email=buyer.email if buyer else order.contact_email,
                buyer_phone=buyer.phone if buyer else order.contact_phone,
            )
    except Exception:
        await logger.aexception("thanks_notification_enqueue_failed", order_id=str(order.id))


def thanks_read(f: Fulfillment) -> ThanksRead | None:
    if f.thanks_at is None:
        return None
    return ThanksRead(
        message=f.thanks_message,
        media_url=proof_service.signed_note_url(f.thanks_media_key),
        media_type=f.thanks_media_type,
        sent_at=f.thanks_at,
    )
