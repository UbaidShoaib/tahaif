"""Twilio SMS / WhatsApp notification client."""

import structlog
from httpx import AsyncClient

from app.core.config import get_settings

logger = structlog.get_logger()


async def send_sms(to: str, body: str) -> None:  # pragma: no cover
    """Send an SMS via Twilio REST API."""
    settings = get_settings()
    if not settings.twilio_account_sid or not settings.twilio_auth_token:
        await logger.awarning("twilio_not_configured", to=to)
        return

    url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/Messages.json"
    async with AsyncClient() as client:
        resp = await client.post(
            url,
            auth=(settings.twilio_account_sid, settings.twilio_auth_token),
            data={"From": settings.twilio_sms_from, "To": to, "Body": body},
            timeout=10,
        )
        if resp.status_code >= 400:
            await logger.aerror("twilio_sms_failed", status=resp.status_code, body=resp.text)
        else:
            await logger.ainfo("twilio_sms_sent", to=to)


async def send_whatsapp(to: str, body: str) -> None:  # pragma: no cover
    """Send a WhatsApp message via Twilio."""
    settings = get_settings()
    if not settings.twilio_account_sid or not settings.twilio_auth_token:
        await logger.awarning("twilio_not_configured", to=to)
        return

    url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/Messages.json"
    async with AsyncClient() as client:
        resp = await client.post(
            url,
            auth=(settings.twilio_account_sid, settings.twilio_auth_token),
            data={
                "From": settings.twilio_whatsapp_from,
                "To": f"whatsapp:{to}" if not to.startswith("whatsapp:") else to,
                "Body": body,
            },
            timeout=10,
        )
        if resp.status_code >= 400:
            await logger.aerror("twilio_whatsapp_failed", status=resp.status_code, body=resp.text)
        else:
            await logger.ainfo("twilio_whatsapp_sent", to=to)
