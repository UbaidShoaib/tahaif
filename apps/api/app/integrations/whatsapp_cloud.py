"""Meta WhatsApp Cloud API: send the bot's replies and check webhook signatures (ADR 0013).

Talks to graph.facebook.com directly, without Twilio's markup. Replies to a
customer who wrote within the last 24 hours need no approved template.
"""

import hashlib
import hmac
from dataclasses import dataclass, field
from typing import Any

import structlog
from httpx import AsyncClient

from app.core.config import get_settings

logger = structlog.get_logger()

# WhatsApp's limits for interactive messages; longer text is rejected, not cut.
BODY_MAX = 1024
TEXT_MAX = 4096
BUTTON_TITLE_MAX = 20
ROW_TITLE_MAX = 24
ROW_DESCRIPTION_MAX = 72
MAX_BUTTONS = 3
MAX_ROWS = 10
MAX_PRODUCTS = 30  # items in one product list message
HEADER_MAX = 60
MAX_MEDIA_BYTES = 10 * 1024 * 1024


class WhatsAppNotConfiguredError(RuntimeError):
    """The bot tried to reply but no phone number id / access token is set."""


class MediaDownloadError(RuntimeError):
    """A photo or file the customer sent couldn't be fetched from Meta."""


@dataclass(frozen=True)
class Row:
    id: str
    title: str
    description: str | None = None


@dataclass(frozen=True)
class Reply:
    """One message from the bot: plain text, text with up to 3 buttons, a list
    of up to 10 choices, a photo with a caption, or up to 30 catalog products
    (by catalog item id) the customer can add to their WhatsApp cart."""

    text: str
    buttons: list[tuple[str, str]] = field(default_factory=list)  # (id, title)
    rows: list[Row] = field(default_factory=list)
    list_button: str = "Choose"
    image_url: str | None = None
    products: list[str] = field(default_factory=list)
    header: str = ""


def _cut(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def to_payload(to: str, reply: Reply) -> dict[str, Any]:
    """The Graph API body for one reply. ``to`` is the number as digits."""
    base: dict[str, Any] = {"messaging_product": "whatsapp", "recipient_type": "individual", "to": to}
    if reply.products:
        settings = get_settings()
        items = [{"product_retailer_id": pid} for pid in reply.products[:MAX_PRODUCTS]]
        return {
            **base,
            "type": "interactive",
            "interactive": {
                "type": "product_list",
                "header": {"type": "text", "text": _cut(reply.header or settings.brand_name, HEADER_MAX)},
                "body": {"text": _cut(reply.text, BODY_MAX)},
                "action": {
                    "catalog_id": settings.whatsapp_catalog_id,
                    "sections": [{"title": _cut(reply.list_button, ROW_TITLE_MAX), "product_items": items}],
                },
            },
        }
    if reply.image_url:
        return {**base, "type": "image", "image": {"link": reply.image_url, "caption": _cut(reply.text, BODY_MAX)}}
    if reply.buttons:
        buttons = [
            {"type": "reply", "reply": {"id": bid, "title": _cut(title, BUTTON_TITLE_MAX)}}
            for bid, title in reply.buttons[:MAX_BUTTONS]
        ]
        return {
            **base,
            "type": "interactive",
            "interactive": {
                "type": "button",
                "body": {"text": _cut(reply.text, BODY_MAX)},
                "action": {"buttons": buttons},
            },
        }
    if reply.rows:
        rows = []
        for row in reply.rows[:MAX_ROWS]:
            item = {"id": row.id, "title": _cut(row.title, ROW_TITLE_MAX)}
            if row.description:
                item["description"] = _cut(row.description, ROW_DESCRIPTION_MAX)
            rows.append(item)
        return {
            **base,
            "type": "interactive",
            "interactive": {
                "type": "list",
                "body": {"text": _cut(reply.text, BODY_MAX)},
                "action": {
                    "button": _cut(reply.list_button, BUTTON_TITLE_MAX),
                    "sections": [{"title": _cut(reply.list_button, ROW_TITLE_MAX), "rows": rows}],
                },
            },
        }
    return {**base, "type": "text", "text": {"body": _cut(reply.text, TEXT_MAX), "preview_url": True}}


def signature_ok(body: bytes, header: str | None) -> bool:
    """True when ``X-Hub-Signature-256`` is the app secret's HMAC of the raw body."""
    secret = get_settings().whatsapp_app_secret
    if not secret or not header or not header.startswith("sha256="):
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header.removeprefix("sha256="))


def _client() -> AsyncClient:
    settings = get_settings()
    if not settings.whatsapp_phone_number_id or not settings.whatsapp_access_token:
        raise WhatsAppNotConfiguredError("WhatsApp Cloud API credentials are not configured")
    return AsyncClient(headers={"Authorization": f"Bearer {settings.whatsapp_access_token}"}, timeout=10)


def _graph(path: str) -> str:
    return f"https://graph.facebook.com/{get_settings().whatsapp_graph_version}/{path}"


async def send(to: str, replies: list[Reply]) -> bool:  # pragma: no cover
    """Send replies in order. One failure is logged and the rest still go out.
    True when every reply was accepted. Outside the customer's 24-hour window
    Meta refuses free-form messages, so callers must be ready for False."""
    ok = True
    async with _client() as client:
        for reply in replies:
            resp = await client.post(
                _graph(f"{get_settings().whatsapp_phone_number_id}/messages"), json=to_payload(to, reply)
            )
            if resp.status_code >= 400:
                ok = False
                await logger.aerror("whatsapp_send_failed", status=resp.status_code, body=resp.text)
    return ok


async def download_media(media_id: str) -> tuple[bytes, str]:  # pragma: no cover
    """A photo or document the customer sent: (content, mime type). The id
    from the webhook first resolves to a short-lived URL that needs the token."""
    async with _client() as client:
        meta = await client.get(_graph(media_id))
        if meta.status_code >= 400:
            raise MediaDownloadError(f"media lookup failed: {meta.status_code}")
        info = meta.json()
        if int(info.get("file_size") or 0) > MAX_MEDIA_BYTES:
            raise MediaDownloadError("file too large")
        resp = await client.get(info["url"])
        if resp.status_code >= 400:
            raise MediaDownloadError(f"media download failed: {resp.status_code}")
        return resp.content[: MAX_MEDIA_BYTES + 1], str(info.get("mime_type") or "application/octet-stream")
