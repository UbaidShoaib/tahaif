"""Tests for the bank-transfer proof upload wrapper."""

import pytest
from botocore.exceptions import ClientError, EndpointConnectionError
from fastapi import HTTPException

from app.integrations import s3_client


def _no_such_bucket(*_args: object) -> str:
    raise ClientError({"Error": {"Code": "NoSuchBucket", "Message": "missing"}}, "PutObject")


def _unreachable(*_args: object) -> str:
    raise EndpointConnectionError(endpoint_url="http://localhost:9000")


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", [_no_such_bucket, _unreachable])
async def test_storage_failure_returns_503(monkeypatch: pytest.MonkeyPatch, failure: object) -> None:
    monkeypatch.setattr(s3_client, "_upload_sync", failure)

    with pytest.raises(HTTPException) as exc:
        await s3_client.upload_proof("order-1", "receipt.png", b"png-bytes", "image/png")

    assert exc.value.status_code == 503
    assert "storage is unavailable" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_successful_upload_returns_url_and_key(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, object] = {}

    def _fake_upload(key: str, data: bytes, content_type: str) -> str:
        seen.update(key=key, data=data, content_type=content_type)
        return f"http://storage/{key}"

    monkeypatch.setattr(s3_client, "_upload_sync", _fake_upload)

    url = await s3_client.upload_proof("order-1", "receipt.png", b"png-bytes", "image/png")

    assert url == "http://storage/proofs/order-1/receipt.png"
    assert seen == {"key": "proofs/order-1/receipt.png", "data": b"png-bytes", "content_type": "image/png"}


@pytest.mark.asyncio
async def test_unsupported_type_rejected_before_upload(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(s3_client, "_upload_sync", _no_such_bucket)

    with pytest.raises(HTTPException) as exc:
        await s3_client.upload_proof("order-1", "evil.exe", b"MZ", "application/octet-stream")

    assert exc.value.status_code == 415
