"""Voice/video notes on greeting cards: buyer attaches, vendor prints a QR, recipient plays."""

import uuid
from datetime import timedelta
from typing import Any

import pytest
import pytest_asyncio
from httpx import AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations import s3_client
from app.models.base import utcnow
from app.models.order import CardNoteReport, FulfillmentStatus, OrderItem
from app.models.user import UserRole
from tests.test_vendor import (
    _login,
    _make_city,
    _make_order_with_fulfillment,
    _make_product,
    _make_user,
    _make_vendor,
)


@pytest.fixture
def fake_note_store(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Stand in for S3 for accepted types; unsupported types still hit the real validation."""
    uploaded: list[str] = []
    real = s3_client.upload_card_note

    async def _upload(order_id: str, item_id: str, data: bytes, content_type: str) -> str:
        if content_type not in s3_client.NOTE_MIME_TYPES:
            return await real(order_id, item_id, data, content_type)
        key = f"notes/{order_id}/{item_id}{s3_client.NOTE_MIME_TYPES[content_type]}"
        uploaded.append(key)
        return key

    monkeypatch.setattr(s3_client, "upload_card_note", _upload)
    return uploaded


@pytest_asyncio.fixture
async def gift(db: AsyncSession) -> dict[str, object]:
    city = await _make_city(db)
    vendor_owner = await _make_user(db, UserRole.vendor)
    vendor = await _make_vendor(db, city, vendor_owner)
    product = await _make_product(db, vendor, city)
    buyer = await _make_user(db)
    order, fulfillment = await _make_order_with_fulfillment(db, vendor, product, city, buyer)
    await db.refresh(order, ["items"])
    info = {
        "token": order.public_token,
        "item_id": order.items[0].id,
        "fulfillment": fulfillment,
        "vendor_email": vendor_owner.email,
        "fulfillment_id": fulfillment.id,
    }
    await db.commit()
    return info


async def _attach(
    client: AsyncClient, gift: dict[str, object], content_type: str = "audio/mp4", accepted_terms: bool = True
) -> Response:
    return await client.post(
        f"/api/v1/orders/by-token/{gift['token']}/items/{gift['item_id']}/note",
        files={"file": ("note.m4a", b"\x00" * 64, content_type)},
        data={"accepted_terms": "true" if accepted_terms else "false"},
    )


async def _note_token(client: AsyncClient, gift: dict[str, object]) -> str:
    vendor_token = await _login(client, str(gift["vendor_email"]))
    leg = (
        await client.get(
            f"/api/v1/vendor/fulfillments/{gift['fulfillment_id']}", headers={"Authorization": f"Bearer {vendor_token}"}
        )
    ).json()
    return str(leg["items"][0]["note_token"])


async def _item(client: AsyncClient, gift: dict[str, object]) -> dict[str, object]:
    order = (await client.get(f"/api/v1/orders/{gift['token']}")).json()
    return next(i for i in order["items"] if i["id"] == str(gift["item_id"]))


@pytest.mark.asyncio
async def test_buyer_attaches_note_and_recipient_can_play_it(
    client: AsyncClient, gift: dict[str, object], fake_note_store: list[str]
) -> None:
    before = await _item(client, gift)
    assert before["has_note"] is False
    assert before["can_edit_note"] is True

    assert (await _attach(client, gift)).status_code == 204

    item = await _item(client, gift)
    assert item["has_note"] is True
    assert item["note_content_type"] == "audio/mp4"

    vendor_token = await _login(client, str(gift["vendor_email"]))
    leg = (
        await client.get(
            f"/api/v1/vendor/fulfillments/{gift['fulfillment_id']}", headers={"Authorization": f"Bearer {vendor_token}"}
        )
    ).json()
    note_token = leg["items"][0]["note_token"]
    assert note_token

    played = await client.get(f"/api/v1/notes/{note_token}")
    assert played.status_code == 200
    body = played.json()
    # Only what the recipient needs: no order id, prices or tracking token.
    assert set(body) == {"media_url", "content_type", "greeting_message", "product_name"}
    assert body["content_type"] == "audio/mp4"
    assert body["greeting_message"] == "Happy birthday Ammi! Love, Ali"
    assert "X-Amz-Signature" in body["media_url"]
    assert fake_note_store == [f"notes/{leg['order_id']}/{gift['item_id']}.m4a"]


@pytest.mark.asyncio
async def test_replacing_a_note_keeps_the_printed_qr_valid(
    client: AsyncClient, gift: dict[str, object], fake_note_store: list[str]
) -> None:
    vendor_token = await _login(client, str(gift["vendor_email"]))
    headers = {"Authorization": f"Bearer {vendor_token}"}
    url = f"/api/v1/vendor/fulfillments/{gift['fulfillment_id']}"

    await _attach(client, gift, "audio/mp4")
    first = (await client.get(url, headers=headers)).json()["items"][0]["note_token"]
    await _attach(client, gift, "video/mp4")
    second = (await client.get(url, headers=headers)).json()["items"][0]["note_token"]

    assert first == second
    assert (await client.get(f"/api/v1/notes/{second}")).json()["content_type"] == "video/mp4"


@pytest.mark.asyncio
async def test_codec_parameters_are_ignored(
    client: AsyncClient, gift: dict[str, object], fake_note_store: list[str]
) -> None:
    # Browsers' MediaRecorder reports e.g. "audio/webm;codecs=opus".
    assert (await _attach(client, gift, "audio/webm;codecs=opus")).status_code == 204
    assert (await _item(client, gift))["note_content_type"] == "audio/webm"


@pytest.mark.asyncio
async def test_only_audio_or_video_is_accepted(
    client: AsyncClient, gift: dict[str, object], fake_note_store: list[str]
) -> None:
    assert (await _attach(client, gift, "application/pdf")).status_code == 415
    assert fake_note_store == []


@pytest.mark.asyncio
async def test_note_is_locked_once_the_gift_is_dispatched(
    client: AsyncClient, db: AsyncSession, gift: dict[str, object], fake_note_store: list[str]
) -> None:
    fulfillment = gift["fulfillment"]
    fulfillment.status = FulfillmentStatus.dispatched  # type: ignore[attr-defined]
    await db.commit()

    assert (await _item(client, gift))["can_edit_note"] is False
    resp = await _attach(client, gift)
    assert resp.status_code == 409
    assert fake_note_store == []


@pytest.mark.asyncio
async def test_removing_a_note_disables_the_qr_link(
    client: AsyncClient, gift: dict[str, object], fake_note_store: list[str]
) -> None:
    await _attach(client, gift)
    vendor_token = await _login(client, str(gift["vendor_email"]))
    leg = (
        await client.get(
            f"/api/v1/vendor/fulfillments/{gift['fulfillment_id']}", headers={"Authorization": f"Bearer {vendor_token}"}
        )
    ).json()
    note_token = leg["items"][0]["note_token"]

    resp = await client.delete(f"/api/v1/orders/by-token/{gift['token']}/items/{gift['item_id']}/note")

    assert resp.status_code == 204
    assert (await _item(client, gift))["has_note"] is False
    assert (await client.get(f"/api/v1/notes/{note_token}")).status_code == 404


@pytest.mark.asyncio
async def test_unknown_order_item_or_note_is_404(
    client: AsyncClient, gift: dict[str, object], fake_note_store: list[str]
) -> None:
    other_item = {**gift, "item_id": uuid.uuid4()}
    other_order = {**gift, "token": uuid.uuid4()}

    assert (await _attach(client, other_item)).status_code == 404
    assert (await _attach(client, other_order)).status_code == 404
    assert (await client.get(f"/api/v1/notes/{uuid.uuid4()}")).status_code == 404


@pytest.mark.asyncio
async def test_note_requires_consent_and_records_it(
    client: AsyncClient, db: AsyncSession, gift: dict[str, object], fake_note_store: list[str]
) -> None:
    refused = await _attach(client, gift, accepted_terms=False)
    assert refused.status_code == 422
    assert "content rules" in refused.json()["detail"]
    assert fake_note_store == []

    assert (await _attach(client, gift)).status_code == 204
    item = await db.get(OrderItem, gift["item_id"], populate_existing=True)
    assert item is not None
    assert item.note_consent_at is not None
    assert item.note_consent_ip


@pytest.mark.asyncio
async def test_note_expires_after_delivery(
    client: AsyncClient, db: AsyncSession, gift: dict[str, object], fake_note_store: list[str]
) -> None:
    await _attach(client, gift)
    note_token = await _note_token(client, gift)
    fulfillment = gift["fulfillment"]

    fulfillment.status = FulfillmentStatus.delivered  # type: ignore[attr-defined]
    fulfillment.delivered_at = utcnow() - timedelta(days=89)  # type: ignore[attr-defined]
    await db.commit()
    assert (await client.get(f"/api/v1/notes/{note_token}")).status_code == 200

    fulfillment.delivered_at = utcnow() - timedelta(days=91)  # type: ignore[attr-defined]
    await db.commit()
    assert (await client.get(f"/api/v1/notes/{note_token}")).status_code == 404


@pytest.mark.asyncio
async def test_anyone_with_the_link_can_report_a_note_once(
    client: AsyncClient, db: AsyncSession, gift: dict[str, object], fake_note_store: list[str]
) -> None:
    await _attach(client, gift)
    note_token = await _note_token(client, gift)
    url = f"/api/v1/notes/{note_token}/report"

    assert (await client.post(url, json={"reason": "abusive", "details": "  Not from my son  "})).status_code == 204
    assert (await client.post(url, json={"reason": "other"})).status_code == 204  # repeat: ignored

    reports = (
        (await db.execute(select(CardNoteReport).where(CardNoteReport.order_item_id == gift["item_id"])))
        .scalars()
        .all()
    )
    assert len(reports) == 1
    assert reports[0].order_item_id == gift["item_id"]
    assert reports[0].reason == "abusive"
    assert reports[0].details == "Not from my son"


@pytest.mark.asyncio
async def test_report_validation_and_unknown_note(
    client: AsyncClient, gift: dict[str, object], fake_note_store: list[str]
) -> None:
    await _attach(client, gift)
    note_token = await _note_token(client, gift)

    assert (await client.post(f"/api/v1/notes/{note_token}/report", json={"reason": "spam!"})).status_code == 422
    assert (await client.post(f"/api/v1/notes/{uuid.uuid4()}/report", json={"reason": "abusive"})).status_code == 404


async def _report(client: AsyncClient, gift: dict[str, object], reason: str = "abusive") -> str:
    await _attach(client, gift)
    note_token = await _note_token(client, gift)
    await client.post(f"/api/v1/notes/{note_token}/report", json={"reason": reason, "details": "scary"})
    return note_token


async def _queue(
    client: AsyncClient, headers: dict[str, str], gift: dict[str, object], status: str = "open"
) -> list[dict[str, Any]]:
    """This test's note in the admin list (other tests' rows share the database)."""
    rows = (await client.get(f"/api/v1/admin/note-reports?status={status}", headers=headers)).json()
    return [r for r in rows if r["item_id"] == str(gift["item_id"])]


async def _admin_headers(client: AsyncClient, db: AsyncSession) -> dict[str, str]:
    admin = await _make_user(db, UserRole.admin)
    await db.commit()
    return {"Authorization": f"Bearer {await _login(client, admin.email)}"}


@pytest.mark.asyncio
async def test_admin_sees_reported_notes_in_the_queue(
    client: AsyncClient, db: AsyncSession, gift: dict[str, object], fake_note_store: list[str]
) -> None:
    await _report(client, gift)
    headers = await _admin_headers(client, db)

    queue = await _queue(client, headers, gift)

    assert len(queue) == 1
    note = queue[0]
    assert note["item_id"] == str(gift["item_id"])
    assert note["public_token"] == str(gift["token"])
    assert note["consent_at"] and note["consent_ip"]
    assert note["disabled_at"] is None
    assert "X-Amz-Signature" in note["media_url"]
    assert [(r["reason"], r["details"], r["status"]) for r in note["reports"]] == [("abusive", "scary", "open")]


@pytest.mark.asyncio
async def test_admin_takes_a_note_down_and_can_restore_it(
    client: AsyncClient, db: AsyncSession, gift: dict[str, object], fake_note_store: list[str]
) -> None:
    note_token = await _report(client, gift)
    headers = await _admin_headers(client, db)

    resp = await client.post(f"/api/v1/admin/note-reports/{gift['item_id']}/disable", headers=headers)
    assert resp.status_code == 204
    assert (await client.get(f"/api/v1/notes/{note_token}")).status_code == 404
    # Handled: off the open queue, still in the full list with the recording kept.
    assert await _queue(client, headers, gift) == []
    everything = await _queue(client, headers, gift, "all")
    assert everything[0]["reports"][0]["status"] == "note_disabled"
    assert everything[0]["disabled_at"]
    # The buyer can't bring it back by uploading again.
    await _attach(client, gift)
    assert (await client.get(f"/api/v1/notes/{note_token}")).status_code == 404

    assert (await client.post(f"/api/v1/admin/note-reports/{gift['item_id']}/restore", headers=headers)).status_code == 204
    assert (await client.get(f"/api/v1/notes/{note_token}")).status_code == 200


@pytest.mark.asyncio
async def test_admin_dismisses_reports_and_the_note_keeps_playing(
    client: AsyncClient, db: AsyncSession, gift: dict[str, object], fake_note_store: list[str]
) -> None:
    note_token = await _report(client, gift, "unwanted")
    headers = await _admin_headers(client, db)

    assert (await client.post(f"/api/v1/admin/note-reports/{gift['item_id']}/dismiss", headers=headers)).status_code == 204

    assert (await client.get(f"/api/v1/notes/{note_token}")).status_code == 200
    assert await _queue(client, headers, gift) == []
    report = (
        await db.execute(select(CardNoteReport).where(CardNoteReport.order_item_id == gift["item_id"]))
    ).scalar_one()
    await db.refresh(report)
    assert report.status == "dismissed"
    assert report.resolved_at is not None


@pytest.mark.asyncio
async def test_note_reports_are_admin_only_and_need_a_report(
    client: AsyncClient, db: AsyncSession, gift: dict[str, object], fake_note_store: list[str]
) -> None:
    await _attach(client, gift)
    buyer = await _make_user(db)
    await db.commit()
    buyer_headers = {"Authorization": f"Bearer {await _login(client, buyer.email)}"}
    admin_headers = await _admin_headers(client, db)

    assert (await client.get("/api/v1/admin/note-reports", headers=buyer_headers)).status_code == 403
    # An item nobody reported can't be taken down from here.
    url = f"/api/v1/admin/note-reports/{gift['item_id']}/disable"
    assert (await client.post(url, headers=admin_headers)).status_code == 404
