"""Access to bank-transfer receipts, which live in a private bucket."""

import structlog

from app.integrations import s3_client

logger = structlog.get_logger()


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
