import asyncio
import contextlib
import secrets
import time
import uuid
from typing import Annotated, Any

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core import realtime
from app.core.db import get_session_factory
from app.core.deps import DB
from app.core.guest import Owner
from app.schemas.bucket import (
    BucketCreate,
    BucketOpRequest,
    BucketRead,
    BuilderRead,
    BuilderSummary,
)
from app.schemas.cart import CartRead
from app.services import bucket_service, builder_admin_service

router = APIRouter(tags=["buckets"])

# Build-your-own hampers and bouquets (ADR 0014). A bucket is reached by its id
# plus the share token `t` returned when it is created; anyone with both can edit.
# Live editing goes through the WebSocket at /buckets/{id}/ws; these endpoints
# cover loading, single edits and checkout.

SessionFactory = Annotated[async_sessionmaker[AsyncSession], Depends(get_session_factory)]
ShareToken = Annotated[str, Query(alias="t", min_length=16, max_length=64)]


@router.get("/builders", response_model=list[BuilderSummary])
async def list_builders(db: DB) -> list[BuilderSummary]:
    """Builders buyers can start: live, with at least one item to add."""
    return await builder_admin_service.list_public(db)


@router.get("/builders/{slug}", response_model=BuilderRead)
async def get_builder(slug: str, db: DB) -> BuilderRead:
    """A builder base and the components that can go in it."""
    return await bucket_service.get_builder(db, slug)


@router.post("/buckets", response_model=BucketRead, status_code=status.HTTP_201_CREATED)
async def create_bucket(body: BucketCreate, owner: Owner, db: DB) -> BucketRead:
    """Start an empty bucket. The response's `share_token` is the only copy of the edit link's secret."""
    return await bucket_service.create_bucket(db, owner, body.builder_slug)


@router.get("/buckets/{bucket_id}", response_model=BucketRead)
async def get_bucket(bucket_id: uuid.UUID, t: ShareToken, db: DB) -> BucketRead:
    return await bucket_service.get_bucket(db, bucket_id, t)


@router.post("/buckets/{bucket_id}/edits", response_model=BucketRead)
async def edit_bucket(bucket_id: uuid.UUID, body: BucketOpRequest, t: ShareToken, db: DB) -> BucketRead:
    """Apply one edit. 409 when it breaks a limit or targets a piece someone else removed."""
    return await bucket_service.apply_edit(db, bucket_id, t, body.edit)


@router.post("/buckets/{bucket_id}/cart", response_model=CartRead, status_code=status.HTTP_201_CREATED)
async def add_bucket_to_cart(bucket_id: uuid.UUID, t: ShareToken, owner: Owner, db: DB) -> CartRead:
    """Put the bucket in the caller's cart as one line priced base + components, and lock it."""
    return await bucket_service.add_to_cart(db, owner, bucket_id, t)


# ── Live editing ──────────────────────────────────────────────────────────────

_COLORS = ["#9f1f50", "#d4a017", "#2563eb", "#059669", "#7c3aed", "#ea580c", "#0891b2", "#db2777"]
_MAX_MESSAGES_PER_SECOND = 20


@router.websocket("/buckets/{bucket_id}/ws")
async def bucket_socket(
    websocket: WebSocket,
    bucket_id: uuid.UUID,
    sessions: SessionFactory,
    t: Annotated[str, Query(min_length=16, max_length=64)],
    name: Annotated[str, Query(max_length=40)] = "Guest",
) -> None:
    """Edit a bucket together.

    Server → client: `snapshot` (on connect), `bucket` (after anyone's edit, with
    `by` and `client_op_id`), `ack` / `reject` (to the sender only; a reject carries
    a fresh `bucket`), `presence` (who has it open), `cursor`.
    Client → server: `{"type": "edit", "client_op_id": "...", "edit": {...}}`,
    `{"type": "cursor", "x": 0.4, "y": 0.6}`, `{"type": "ping"}`.
    """
    key = str(bucket_id)
    async with sessions() as db:
        try:
            snapshot = await bucket_service.get_bucket(db, bucket_id, t)
        except HTTPException:
            await websocket.close(code=4404)
            return

    client_id = secrets.token_hex(4)
    color = _COLORS[int(client_id, 16) % len(_COLORS)]
    display_name = name.strip()[:40] or "Guest"
    if not await realtime.join(key, client_id, display_name, color):
        await websocket.close(code=4429, reason="Too many people are editing this bucket")
        return

    try:
        async with realtime.subscription(key) as messages:
            await websocket.accept()
            await websocket.send_json(
                {"type": "snapshot", "you": client_id, "bucket": snapshot.model_dump(mode="json")}
            )
            await realtime.publish(key, {"type": "presence", "editors": await realtime.editors(key)})

            async def forward() -> None:
                async for message in messages:
                    if message.get("type") == "cursor" and message.get("by") == client_id:
                        continue
                    await websocket.send_json(message)

            forwarder = asyncio.create_task(forward())
            try:
                await _receive(websocket, sessions, bucket_id, t, client_id, display_name, color)
            finally:
                # Wait for it to stop: unsubscribing while it is still reading
                # the same Redis connection can stall, and then leave() never runs.
                forwarder.cancel()
                with contextlib.suppress(asyncio.CancelledError, WebSocketDisconnect, RuntimeError):
                    await forwarder
    except WebSocketDisconnect:
        pass
    finally:
        # Covers a socket that closes before or during the snapshot, too, so
        # nobody is left listed as editing. Shielded: the task may be cancelled
        # (server shutdown) and the cleanup must still finish.
        await asyncio.shield(_leave(key, client_id))


async def _leave(key: str, client_id: str) -> None:
    await realtime.leave(key, client_id)
    await realtime.publish(key, {"type": "presence", "editors": await realtime.editors(key)})


async def _receive(
    websocket: WebSocket,
    sessions: async_sessionmaker[AsyncSession],
    bucket_id: uuid.UUID,
    token: str,
    client_id: str,
    display_name: str,
    color: str,
) -> None:
    key = str(bucket_id)
    window_start, count = time.monotonic(), 0
    while True:
        message = await websocket.receive_json()
        now = time.monotonic()
        if now - window_start >= 1:
            window_start, count = now, 0
        count += 1
        if count > _MAX_MESSAGES_PER_SECOND:
            continue
        kind = message.get("type") if isinstance(message, dict) else None
        await realtime.touch(key, client_id, display_name, color)

        if kind == "edit":
            await _handle_edit(websocket, sessions, bucket_id, token, client_id, message)
        elif kind == "cursor":
            try:
                x, y = float(message["x"]), float(message["y"])
            except (KeyError, TypeError, ValueError):
                continue
            await realtime.publish(key, {"type": "cursor", "by": client_id, "x": x, "y": y})
        elif kind == "ping":
            await websocket.send_json({"type": "pong"})


async def _handle_edit(
    websocket: WebSocket,
    sessions: async_sessionmaker[AsyncSession],
    bucket_id: uuid.UUID,
    token: str,
    client_id: str,
    message: dict[str, Any],
) -> None:
    op_id = str(message.get("client_op_id", ""))[:64]
    try:
        edit = BucketOpRequest.model_validate({"edit": message.get("edit")}).edit
    except ValidationError:
        await websocket.send_json({"type": "reject", "client_op_id": op_id, "detail": "Invalid edit"})
        return
    async with sessions() as db:
        try:
            bucket = await bucket_service.apply_edit(db, bucket_id, token, edit)
            await db.commit()
        except HTTPException as exc:
            await db.rollback()
            current = await bucket_service.get_bucket(db, bucket_id, token)
            await websocket.send_json({
                "type": "reject",
                "client_op_id": op_id,
                "detail": exc.detail,
                "bucket": current.model_dump(mode="json"),
            })
            return
    await websocket.send_json({"type": "ack", "client_op_id": op_id, "version": bucket.version})
    await realtime.publish(str(bucket_id), {
        "type": "bucket",
        "by": client_id,
        "client_op_id": op_id,
        "bucket": bucket.model_dump(mode="json"),
    })
