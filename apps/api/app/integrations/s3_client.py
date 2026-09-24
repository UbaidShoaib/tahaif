"""S3 / MinIO object storage client (sync boto3 wrapped in asyncio.to_thread)."""

import asyncio
from pathlib import PurePosixPath

import boto3
import structlog
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException, status

from app.core.config import get_settings

logger = structlog.get_logger()

_ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
_MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


def _get_client() -> "boto3.client":
    settings = get_settings()
    kwargs: dict[str, object] = {
        "service_name": "s3",
        "aws_access_key_id": settings.s3_access_key_id,
        "aws_secret_access_key": settings.s3_secret_access_key,
    }
    if settings.s3_endpoint_url:
        kwargs["endpoint_url"] = settings.s3_endpoint_url
    return boto3.client(**kwargs)


def _upload_sync(key: str, data: bytes, content_type: str) -> str:
    settings = get_settings()
    client = _get_client()
    client.put_object(
        Bucket=settings.s3_bucket_name,
        Key=key,
        Body=data,
        ContentType=content_type,
    )
    public_url = settings.s3_public_url or ""
    if public_url:
        return f"{public_url.rstrip('/')}/{key}"
    return f"https://{settings.s3_bucket_name}.s3.amazonaws.com/{key}"


async def upload_proof(order_id: str, filename: str, data: bytes, content_type: str) -> str:
    """Upload bank-transfer proof; returns the public URL."""
    if content_type not in _ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type. Allowed: {', '.join(_ALLOWED_MIME_TYPES)}",
        )
    if len(data) > _MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File exceeds 10 MB limit",
        )

    ext = PurePosixPath(filename).suffix or ".jpg"
    key = f"proofs/{order_id}/receipt{ext}"

    try:
        url = await asyncio.to_thread(_upload_sync, key, data, content_type)
    except (BotoCoreError, ClientError) as exc:
        # e.g. missing bucket or unreachable storage: an ops problem, not a client error.
        await logger.aexception("s3_proof_upload_failed", order_id=order_id, key=key, error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Receipt storage is unavailable right now. Please try again shortly.",
        ) from exc
    await logger.ainfo("s3_proof_uploaded", order_id=order_id, key=key)
    return url
