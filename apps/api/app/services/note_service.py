"""Voice/video notes on greeting cards (diaspora Release B).

The buyer attaches the note from the tracking page, authorised by the order's
public token (the same capability that opens tracking, ADR 0004). The printed
card carries a QR code to /note/{note_token}; that token is separate, so a
recipient who scans it can play the note but can't see the order.
"""

import uuid
from datetime import timedelta

import structlog
from fastapi import HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.integrations import s3_client
from app.models.base import utcnow
from app.models.order import CardNoteReport, FulfillmentStatus, Order, OrderItem
from app.models.user import User
from app.repositories.order_repository import OrderRepository
from app.schemas.order import (
    CardNoteRead,
    CardNoteReportCreate,
    NoteReportRead,
    ReportedNoteRead,
)
from app.services import audit_service, proof_service

# The card is printed while the gift is being prepared, so the note can change
# until the gift leaves the shop.
logger = structlog.get_logger()

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
    db: AsyncSession,
    public_token: uuid.UUID,
    item_id: uuid.UUID,
    file: UploadFile,
    *,
    accepted_terms: bool,
    client_ip: str,
) -> None:
    if not accepted_terms:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Please confirm your note follows our content rules",
        )
    order, item = await _editable_item(db, public_token, item_id)
    # Read one byte past the limit so an oversized upload is rejected without
    # buffering all of it.
    data = await file.read(s3_client.MAX_NOTE_BYTES + 1)
    content_type = (file.content_type or "").split(";")[0].strip()
    item.note_key = await s3_client.upload_card_note(str(order.id), str(item.id), data, content_type)
    item.note_content_type = content_type
    # Keep the token on replace: the QR on an already-printed card stays valid.
    item.note_token = item.note_token or uuid.uuid4()
    item.note_consent_at = utcnow()
    item.note_consent_ip = client_ip
    await db.flush()


async def remove_note(db: AsyncSession, public_token: uuid.UUID, item_id: uuid.UUID) -> None:
    _order, item = await _editable_item(db, public_token, item_id)
    item.note_key = None
    item.note_content_type = None
    item.note_token = None
    item.note_consent_at = None
    item.note_consent_ip = None
    await db.flush()


_NOTE_UNAVAILABLE = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This note isn't available")


def is_note_expired(item: OrderItem) -> bool:
    """Notes stop playing note_expiry_days after the gift is delivered."""
    delivered_at = item.fulfillment.delivered_at if item.fulfillment else None
    if delivered_at is None:
        return False
    return utcnow() > delivered_at + timedelta(days=get_settings().note_expiry_days)


async def _playable_item(db: AsyncSession, note_token: uuid.UUID) -> OrderItem:
    item = await OrderRepository(db).get_item_by_note_token(note_token)
    if (
        not item
        or not item.note_key
        or not item.note_content_type
        or item.note_disabled_at
        or is_note_expired(item)
    ):
        raise _NOTE_UNAVAILABLE
    return item


async def get_note(db: AsyncSession, note_token: uuid.UUID) -> CardNoteRead:
    item = await _playable_item(db, note_token)
    url = proof_service.signed_note_url(item.note_key) if item.note_key else None
    if not url or not item.note_content_type:
        raise _NOTE_UNAVAILABLE
    return CardNoteRead(
        media_url=url,
        content_type=item.note_content_type,
        greeting_message=item.greeting_message,
        product_name=item.product.name,
    )


async def report_note(
    db: AsyncSession, note_token: uuid.UUID, body: CardNoteReportCreate, reporter_ip: str
) -> None:
    """Record a report about a note. Repeat reports from the same IP are ignored."""
    item = await OrderRepository(db).get_item_by_note_token(note_token)
    if not item or not item.note_key or item.note_disabled_at:
        raise _NOTE_UNAVAILABLE
    repo = OrderRepository(db)
    if await repo.get_note_report(item.id, reporter_ip):
        return
    await repo.add_note_report(
        order_item_id=item.id,
        reason=body.reason,
        details=(body.details or "").strip() or None,
        reporter_ip=reporter_ip,
    )
    await logger.awarning("card_note_reported", order_id=str(item.order_id), item_id=str(item.id), reason=body.reason)


# ── Admin review (ADR 0010) ───────────────────────────────────────────────────


async def list_reported_notes(db: AsyncSession, status_filter: str = "open") -> list[ReportedNoteRead]:
    """Reported notes, the most recently reported first, with their reports.

    `status_filter="open"` is the review queue: notes with at least one open report.
    """
    reports = await OrderRepository(db).list_note_reports()
    by_item: dict[uuid.UUID, list[CardNoteReport]] = {}
    for r in reports:
        by_item.setdefault(r.order_item_id, []).append(r)

    out: list[ReportedNoteRead] = []
    for rows in by_item.values():
        item = rows[0].order_item
        if status_filter == "open" and not any(r.status == "open" for r in rows):
            continue
        out.append(
            ReportedNoteRead(
                item_id=item.id,
                order_id=item.order_id,
                public_token=item.order.public_token,
                product_name=item.product.name,
                greeting_message=item.greeting_message,
                content_type=item.note_content_type,
                media_url=proof_service.signed_note_url(item.note_key),
                consent_at=item.note_consent_at,
                consent_ip=item.note_consent_ip,
                disabled_at=item.note_disabled_at,
                last_reported_at=max(r.created_at for r in rows),
                reports=[
                    NoteReportRead(
                        id=r.id,
                        reason=r.reason,
                        details=r.details,
                        status=r.status,
                        created_at=r.created_at,
                    )
                    for r in sorted(rows, key=lambda r: r.created_at, reverse=True)
                ],
            )
        )
    return sorted(out, key=lambda n: n.last_reported_at, reverse=True)


async def resolve_reports(db: AsyncSession, admin: User, item_id: uuid.UUID, *, disable: bool) -> None:
    """Close the open reports on a note: take the note down (`disable`) or dismiss them."""
    repo = OrderRepository(db)
    item = await repo.get_item_with_note_reports(item_id)
    if not item:
        raise _NOT_FOUND
    now = utcnow()
    if disable and not item.note_disabled_at:
        item.note_disabled_at = now
        item.note_disabled_by = admin.id
    for r in await repo.list_note_reports(item_id=item_id):
        if r.status == "open":
            r.status = "note_disabled" if disable else "dismissed"
            r.resolved_by = admin.id
            r.resolved_at = now
    await db.flush()
    await audit_service.record(
        db, admin, "card_note.disabled" if disable else "card_note.dismissed", "order", item.order_id,
        after={"item_id": str(item_id)},
    )
    await logger.ainfo(
        "card_note_disabled" if disable else "card_note_reports_dismissed",
        item_id=str(item_id),
        admin_id=str(admin.id),
    )


async def restore_note(db: AsyncSession, admin: User, item_id: uuid.UUID) -> None:
    """Undo a take-down: the QR link plays the note again (until it expires)."""
    item = await OrderRepository(db).get_item_with_note_reports(item_id)
    if not item:
        raise _NOT_FOUND
    item.note_disabled_at = None
    item.note_disabled_by = None
    await db.flush()
    await audit_service.record(db, admin, "card_note.restored", "order", item.order_id, after={"item_id": str(item_id)})
    await logger.ainfo("card_note_restored", item_id=str(item_id), admin_id=str(admin.id))
