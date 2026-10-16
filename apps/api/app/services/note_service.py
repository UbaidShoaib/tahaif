"""Voice/video notes on greeting cards (diaspora Release B).

The buyer attaches the note from the tracking page, authorised by the order's
public token (the same capability that opens tracking, ADR 0004). The printed
card carries a QR code to /note/{note_token}; that token is separate, so a
recipient who scans it can play the note but can't see the order.
"""

import uuid

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations import s3_client
from app.models.order import FulfillmentStatus, Order, OrderItem
from app.repositories.order_repository import OrderRepository
from app.schemas.order import CardNoteRead
from app.services import proof_service

# The card is printed while the gift is being prepared, so the note can change
# until the gift leaves the shop.
_EDITABLE = {FulfillmentStatus.pending, FulfillmentStatus.preparing, FulfillmentStatus.ready}

_NOT_FOUND = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")


def can_edit_note(order: Order, item: OrderItem) -> bool:
    leg = next((f for f in order.fulfillments if f.id == item.fulfillment_id), None)
    return leg is not None and leg.status in _EDITABLE


async def _editable_item(db: AsyncSession, public_token: uuid.UUID, item_id: uuid.UUID) -> tuple[Order, OrderItem]:
    order = await OrderRepository(db).get_by_public_token(public_token)
    item = next((i for i in order.items if i.id == item_id), None) if order else None
    if not order or not item:
        raise _NOT_FOUND
    if not can_edit_note(order, item):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The gift has already left the shop, so its card can't be changed",
        )
    return order, item


async def attach_note(
    db: AsyncSession, public_token: uuid.UUID, item_id: uuid.UUID, file: UploadFile
) -> None:
    order, item = await _editable_item(db, public_token, item_id)
    # Read one byte past the limit so an oversized upload is rejected without
    # buffering all of it.
    data = await file.read(s3_client.MAX_NOTE_BYTES + 1)
    content_type = (file.content_type or "").split(";")[0].strip()
    item.note_key = await s3_client.upload_card_note(str(order.id), str(item.id), data, content_type)
    item.note_content_type = content_type
    # Keep the token on replace: the QR on an already-printed card stays valid.
    item.note_token = item.note_token or uuid.uuid4()
    await db.flush()


async def remove_note(db: AsyncSession, public_token: uuid.UUID, item_id: uuid.UUID) -> None:
    _order, item = await _editable_item(db, public_token, item_id)
    item.note_key = None
    item.note_content_type = None
    item.note_token = None
    await db.flush()


async def get_note(db: AsyncSession, note_token: uuid.UUID) -> CardNoteRead:
    item = await OrderRepository(db).get_item_by_note_token(note_token)
    url = proof_service.signed_note_url(item.note_key) if item else None
    if not item or not url or not item.note_content_type:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This note isn't available")
    return CardNoteRead(
        media_url=url,
        content_type=item.note_content_type,
        greeting_message=item.greeting_message,
        product_name=item.product.name,
    )
