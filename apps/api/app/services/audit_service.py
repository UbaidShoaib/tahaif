"""Back-office audit log: who changed what, when, from where.

Call `record` from the service that makes the change, before the request's
transaction commits, so an entry exists exactly when the change does. Store only
what changed: `snapshot` an object before and after, then pass both to `record`,
which drops the fields that stayed the same.

Actions are `<entity>.<verb>` (e.g. `order.status_changed`); the full list with
their labels is ACTION_LABELS below, which the admin Activity page uses.
"""

import uuid
from datetime import datetime
from typing import Any

from fastapi.encoders import jsonable_encoder
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.request_context import client_ip_var
from app.models.loyalty import AuditLog
from app.models.user import User
from app.repositories.audit_repository import AuditLogRepository
from app.schemas.audit import AuditEntryRead, AuditPage

ACTION_LABELS: dict[str, str] = {
    "order.created_by_staff": "Entered a DM/WhatsApp order",
    "order.status_changed": "Changed order status",
    "order.note_added": "Added a staff note",
    "payment.verified": "Approved a payment",
    "payment.rejected": "Rejected a payment",
    "product.created": "Added a product",
    "product.updated": "Edited a product",
    "product.published": "Published a product",
    "product.hidden": "Hid a product",
    "product.photo_added": "Added a product photo",
    "product.photo_removed": "Removed a product photo",
    "product.main_photo_changed": "Changed a product's main photo",
    "product.cities_changed": "Changed delivery cities",
    "fulfillment.updated": "Updated a delivery",
    "vendor.approved": "Approved a shop",
    "vendor.rejected": "Rejected a shop",
    "card_note.disabled": "Took down a card note",
    "card_note.dismissed": "Dismissed a card-note report",
    "card_note.restored": "Restored a card note",
    "coupon.created": "Created a coupon",
    "coupon.enabled": "Turned a coupon on",
    "coupon.disabled": "Turned a coupon off",
    "fx_rate.overridden": "Set an exchange rate by hand",
    "user.role_changed": "Changed a user's role",
}


def snapshot(obj: object, fields: list[str]) -> dict[str, Any]:
    """The named attributes of an ORM row, as JSON-safe values."""
    return {f: jsonable_encoder(getattr(obj, f)) for f in fields}


def _changed(before: dict[str, Any] | None, after: dict[str, Any] | None) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    if before is None or after is None:
        return before, after
    keys = [k for k in after if before.get(k) != after.get(k)]
    return {k: before.get(k) for k in keys}, {k: after[k] for k in keys}


async def record(
    db: AsyncSession,
    actor: User | None,
    action: str,
    entity: str,
    entity_id: uuid.UUID | str | None,
    *,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
    context: dict[str, Any] | None = None,
) -> None:
    """Add an entry in the caller's transaction. A no-op when before and after are
    given and nothing differs, so callers can record unconditionally. `context` is
    kept in `after` even though it didn't change (e.g. which recipient)."""
    before, after = _changed(jsonable_encoder(before), jsonable_encoder(after))
    if before == {} and after == {}:
        return
    if context:
        after = {**(after or {}), **jsonable_encoder(context)}
    await AuditLogRepository(db).add(
        actor_user_id=actor.id if actor else None,
        action=action,
        entity=entity,
        entity_id=str(entity_id) if entity_id is not None else None,
        before=before,
        after=after,
        ip_address=client_ip_var.get(),
    )


def _person(user: User | None) -> str | None:
    return (user.full_name or user.email) if user else None


def entry_read(e: AuditLog) -> AuditEntryRead:
    return AuditEntryRead(
        id=e.id,
        at=e.created_at,
        action=e.action,
        label=ACTION_LABELS.get(e.action, e.action),
        entity=e.entity,
        entity_id=e.entity_id,
        actor_user_id=e.actor_user_id,
        actor_name=_person(e.actor),
        before=e.before,
        after=e.after,
        ip_address=e.ip_address,
    )


async def search(
    db: AsyncSession,
    *,
    entity: str | None = None,
    entity_id: str | None = None,
    actor_user_id: uuid.UUID | None = None,
    action: str | None = None,
    since: datetime | None = None,
    offset: int = 0,
    limit: int = 50,
) -> AuditPage:
    rows, total = await AuditLogRepository(db).search(
        entity=entity, entity_id=entity_id, actor_user_id=actor_user_id,
        action_prefix=action, since=since, offset=offset, limit=limit,
    )
    return AuditPage(items=[entry_read(e) for e in rows], total=total, offset=offset, limit=limit)


async def for_entity(db: AsyncSession, entity: str, entity_id: uuid.UUID) -> list[AuditEntryRead]:
    """Every entry for one row, oldest first (for an order's timeline)."""
    rows, _ = await AuditLogRepository(db).search(entity=entity, entity_id=str(entity_id), limit=500)
    return [entry_read(e) for e in reversed(rows)]
