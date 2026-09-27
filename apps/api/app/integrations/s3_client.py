"""S3 / MinIO object storage client (sync boto3 wrapped in asyncio.to_thread)."""

import asyncio
from pathlib import PurePosixPath

import boto3
import structlog
from botocore.config import Config
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
        "region_name": settings.s3_region,
        # SigV4: presigned links use X-Amz-* parameters. boto3 otherwise falls
        # back to legacy SigV2 for presigning, which newer AWS regions reject.
        "config": Config(signature_version="s3v4"),
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


_PHOTO_MIME_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


async def upload_delivery_photo(order_id: str, fulfillment_id: str, data: bytes, content_type: str) -> str:
    """Upload a proof-of-delivery photo; returns the object key (the bucket is private)."""
    ext = _PHOTO_MIME_TYPES.get(content_type)
    if ext is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Upload a JPEG, PNG or WebP photo",
        )
    if len(data) > _MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File exceeds 10 MB limit",
        )
    key = f"deliveries/{order_id}/{fulfillment_id}{ext}"
    try:
        await asyncio.to_thread(_upload_sync, key, data, content_type)
    except (BotoCoreError, ClientError) as exc:
        await logger.aexception("s3_delivery_photo_upload_failed", order_id=order_id, key=key, error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Photo storage is unavailable right now. Please try again shortly.",
        ) from exc
    await logger.ainfo("s3_delivery_photo_uploaded", order_id=order_id, key=key)
    return key


# Card notes: what phones record by default (m4a/aac, webm/ogg, mp3, 3gp) and video.
NOTE_MIME_TYPES = {
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "audio/x-m4a": ".m4a",
    "audio/aac": ".aac",
    "audio/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/wav": ".wav",
    "audio/3gpp": ".3gp",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "video/3gpp": ".3gp",
}
MAX_NOTE_BYTES = 25 * 1024 * 1024


async def upload_card_note(order_id: str, item_id: str, data: bytes, content_type: str) -> str:
    """Upload a greeting-card voice/video note; returns the object key (private bucket)."""
    ext = NOTE_MIME_TYPES.get(content_type)
    if ext is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Upload an audio or video recording (MP3, M4A, MP4, MOV, WebM or OGG)",
        )
    if len(data) > MAX_NOTE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="The recording must be 25 MB or smaller (about 2 minutes of video)",
        )
    key = f"notes/{order_id}/{item_id}{ext}"
    try:
        await asyncio.to_thread(_upload_sync, key, data, content_type)
    except (BotoCoreError, ClientError) as exc:
        await logger.aexception("s3_note_upload_failed", order_id=order_id, key=key, error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Recording storage is unavailable right now. Please try again shortly.",
        ) from exc
    await logger.ainfo("s3_note_uploaded", order_id=order_id, key=key)
    return key


THANKS_MIME_TYPES = {**NOTE_MIME_TYPES, **_PHOTO_MIME_TYPES}


async def upload_thanks_media(order_id: str, fulfillment_id: str, data: bytes, content_type: str) -> str:
    """Upload the recipient's thank-you photo/voice/video; returns the object key (private bucket)."""
    ext = THANKS_MIME_TYPES.get(content_type)
    if ext is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Send a photo, voice note or video",
        )
    if len(data) > MAX_NOTE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="The file must be 25 MB or smaller",
        )
    key = f"thanks/{order_id}/{fulfillment_id}{ext}"
    try:
        await asyncio.to_thread(_upload_sync, key, data, content_type)
    except (BotoCoreError, ClientError) as exc:
        await logger.aexception("s3_thanks_upload_failed", order_id=order_id, key=key, error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Storage is unavailable right now. Please try again shortly.",
        ) from exc
    await logger.ainfo("s3_thanks_uploaded", order_id=order_id, key=key)
    return key


_PROOF_PREFIX = "proofs/"
SIGNED_URL_TTL_SECS = 15 * 60


def object_key_from_url(url: str | None) -> str | None:
    """Recover the object key from a stored proof URL (keys always start with proofs/)."""
    if not url or _PROOF_PREFIX not in url:
        return None
    return url[url.index(_PROOF_PREFIX):].split("?", 1)[0]


def presign_get(key: str, expires_in: int = SIGNED_URL_TTL_SECS) -> str:
    """Short-lived GET link for a private object. Signing is local; no network call."""
    return str(
        _get_client().generate_presigned_url(
            "get_object",
            Params={"Bucket": get_settings().s3_bucket_name, "Key": key},
            ExpiresIn=expires_in,
        )
    )
