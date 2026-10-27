"""Webhook for the WhatsApp ordering bot (ADR 0013).

Register ``{API}/api/v1/whatsapp/webhook`` in the Meta app (WhatsApp →
Configuration) with ``WHATSAPP_VERIFY_TOKEN``, and subscribe to ``messages``.
"""

import csv
import io
import json
from typing import Annotated, Any

import structlog
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Header,
    HTTPException,
    Query,
    Request,
    status,
)
from fastapi.responses import PlainTextResponse, Response

from app.core.config import get_settings
from app.core.deps import DB
from app.integrations import whatsapp_cloud
from app.integrations.whatsapp_cloud import Reply
from app.services import whatsapp_bot_service

logger = structlog.get_logger()

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])

_OFF = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


async def _send_all(outgoing: list[tuple[str, list[Reply]]]) -> None:
    for to, replies in outgoing:
        try:
            await whatsapp_cloud.send(to, replies)
        except Exception:
            await logger.aexception("whatsapp_reply_failed", to=to)


@router.get("/catalog.csv", include_in_schema=False)
async def catalog_feed(db: DB) -> Response:
    """Product feed for our WhatsApp catalog. In Commerce Manager: Catalog → Data
    sources → Data feed → scheduled, with this URL, refreshed hourly."""
    if not get_settings().whatsapp_bot_enabled:
        raise _OFF
    out = io.StringIO()
    writer = csv.DictWriter(out, fieldnames=whatsapp_bot_service.FEED_COLUMNS)
    writer.writeheader()
    writer.writerows(await whatsapp_bot_service.catalog_feed(db))
    return Response(out.getvalue(), media_type="text/csv; charset=utf-8")


@router.get("/webhook", response_class=PlainTextResponse, include_in_schema=False)
async def verify_webhook(
    mode: Annotated[str | None, Query(alias="hub.mode")] = None,
    token: Annotated[str | None, Query(alias="hub.verify_token")] = None,
    challenge: Annotated[str | None, Query(alias="hub.challenge")] = None,
) -> str:
    """Meta calls this once when the webhook URL is registered."""
    settings = get_settings()
    if not settings.whatsapp_bot_enabled:
        raise _OFF
    if mode != "subscribe" or not settings.whatsapp_verify_token or token != settings.whatsapp_verify_token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Verification failed")
    return challenge or ""


@router.post("/webhook", include_in_schema=False)
async def receive_webhook(
    request: Request,
    db: DB,
    background: BackgroundTasks,
    signature: Annotated[str | None, Header(alias="x-hub-signature-256")] = None,
) -> dict[str, str]:
    """Customer messages from Meta. Replies are sent after the transaction commits."""
    if not get_settings().whatsapp_bot_enabled:
        raise _OFF
    body = await request.body()
    if not whatsapp_cloud.signature_ok(body, signature):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bad signature")
    try:
        payload: dict[str, Any] = json.loads(body)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not JSON") from exc

    outgoing: list[tuple[str, list[Reply]]] = []
    for message in whatsapp_bot_service.parse_webhook(payload):
        try:
            # One message's failure mustn't lose the others in the same delivery.
            async with db.begin_nested():
                replies = await whatsapp_bot_service.handle(db, message)
        except Exception:
            await logger.aexception("whatsapp_message_failed", message_id=message.message_id)
            replies = [Reply("Sorry, something went wrong on our side. Please try again, or type *help* to talk to our team.")]
        if replies:
            outgoing.append((message.phone, replies))
    if outgoing:
        background.add_task(_send_all, outgoing)
    # Always 200 for a signed call, or Meta keeps retrying it.
    return {"status": "ok"}
