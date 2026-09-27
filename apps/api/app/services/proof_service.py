"""Access to bank-transfer receipts, which live in a private bucket."""

import structlog

from app.integrations import s3_client

logger = structlog.get_logger()


# Buyers often open the tracking link from a WhatsApp message hours later, and
# each page load re-signs, so an hour is plenty without making links long-lived.
DELIVERY_PHOTO_URL_TTL_SECS = 60 * 60


def signed_delivery_photo_url(key: str | None) -> str | None:
    """Short-lived link to a proof-of-delivery photo, or None if there is none."""
    if not key:
        return None
    try:
        return s3_client.presign_get(key, expires_in=DELIVERY_PHOTO_URL_TTL_SECS)
    except Exception as exc:  # noqa: BLE001 — a bad credential must not break tracking
        logger.warning("delivery_photo_presign_failed", key=key, error=str(exc))
        return None


def signed_note_url(key: str | None) -> str | None:
    """Short-lived link to a greeting-card voice/video note (same TTL as delivery photos)."""
    if not key:
        return None
    try:
        return s3_client.presign_get(key, expires_in=DELIVERY_PHOTO_URL_TTL_SECS)
    except Exception as exc:  # noqa: BLE001 — a bad credential must not break playback
        logger.warning("note_presign_failed", key=key, error=str(exc))
        return None


def signed_proof_url(stored_url: str | None) -> str | None:
    """Turn a stored receipt URL into a short-lived link an admin can open.

    Receipts are payment documents, so the bucket stays private and the stored
    URL is never handed out directly.
    """
    key = s3_client.object_key_from_url(stored_url)
    if key is None:
        return None
    try:
        return s3_client.presign_get(key)
    except Exception as exc:  # noqa: BLE001 — a bad credential must not break the order list
        logger.warning("proof_presign_failed", key=key, error=str(exc))
        return None
