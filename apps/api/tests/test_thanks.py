"""The recipient's thank-you back to the buyer."""

import uuid

import pytest
import pytest_asyncio
import sqlalchemy as sa
from httpx import AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations import s3_client
from app.models.order import OrderStatus
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
def fake_thanks_store(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    uploaded: list[str] = []
    real = s3_client.upload_thanks_media

    async def _upload(order_id: str, fulfillment_id: str, data: bytes, content_type: str) -> str:
        if content_type not in s3_client.THANKS_MIME_TYPES:
            return await real(order_id, fulfillment_id, data, content_type)
        key = f"thanks/{order_id}/{fulfillment_id}{s3_client.THANKS_MIME_TYPES[content_type]}"
        uploaded.append(key)
        return key

    monkeypatch.setattr(s3_client, "upload_thanks_media", _upload)
    return uploaded


@pytest_asyncio.fixture
async def gift(db: AsyncSession) -> dict[str, object]:
    city = await _make_city(db)
    owner = await _make_user(db, UserRole.vendor)
    vendor = await _make_vendor(db, city, owner)
    product = await _make_product(db, vendor, city)
    buyer = await _make_user(db)
    order, fulfillment = await _make_order_with_fulfillment(db, vendor, product, city, buyer)
    order.gift_from = "Ali (London)"
    info = {
        "order": order,
        "order_id": order.id,
        "public_token": order.public_token,
        "thanks_token": fulfillment.thanks_token,
        "product_name": product.name,
        "buyer_email": buyer.email,
        "vendor_email": owner.email,
        "fulfillment_id": fulfillment.id,
    }
    await db.commit()
    return info


async def _send(client: AsyncClient, token: object, message: str | None = None,
                file: tuple[str, bytes, str] | None = None) -> Response:
    return await client.post(
        f"/api/v1/thanks/{token}",
        data={"message": message} if message is not None else {},
        files={"file": file} if file else None,
    )


async def _tracked_thanks(client: AsyncClient, gift: dict[str, object]) -> dict[str, object] | None:
    order = (await client.get(f"/api/v1/orders/{gift['public_token']}")).json()
    return order["fulfillments"][0]["thanks"]  # type: ignore[no-any-return]


@pytest.mark.asyncio
async def test_page_shows_who_to_thank_and_nothing_else(client: AsyncClient, gift: dict[str, object]) -> None:
    resp = await client.get(f"/api/v1/thanks/{gift['thanks_token']}")

    assert resp.status_code == 200
    assert resp.json() == {
        "recipient_name": "Test Recipient",
        "gift_from": "Ali (London)",
        "items": [gift["product_name"]],
        "already_sent": False,
    }


@pytest.mark.asyncio
async def test_recipient_sends_a_photo_thank_you_and_the_buyer_hears_about_it(
    client: AsyncClient, outbox: AsyncSession, gift: dict[str, object], fake_thanks_store: list[str]
) -> None:
    resp = await _send(client, gift["thanks_token"], "Thank you beta!", ("smile.jpg", b"\xff\xd8" + b"\x00" * 32, "image/jpeg"))

    assert resp.status_code == 204
    thanks = await _tracked_thanks(client, gift)
    assert thanks is not None
    assert thanks["message"] == "Thank you beta!"
    assert thanks["media_type"] == "image/jpeg"
    assert "X-Amz-Signature" in str(thanks["media_url"])
    assert fake_thanks_store == [f"thanks/{gift['order_id']}/{gift['fulfillment_id']}.jpg"]

    queued = await outbox.execute(
        sa.text(
            "SELECT channel::text, to_address FROM notifications_outbox "
            "WHERE template = 'thanks_received' AND payload->>'order_id' = :o"
        ),
        {"o": str(gift["order_id"])},
    )
    assert ("email", gift["buyer_email"]) in [tuple(r) for r in queued.all()]


@pytest.mark.asyncio
async def test_sending_again_replaces_without_renotifying(
    client: AsyncClient, outbox: AsyncSession, gift: dict[str, object], fake_thanks_store: list[str]
) -> None:
    await _send(client, gift["thanks_token"], "Thank you!")
    await _send(client, gift["thanks_token"], "Thank you so much, it was delicious!")

    thanks = await _tracked_thanks(client, gift)
    assert thanks is not None and thanks["message"] == "Thank you so much, it was delicious!"
    count = await outbox.execute(
        sa.text("SELECT count(*) FROM notifications_outbox WHERE template = 'thanks_received' AND channel = 'email'")
    )
    assert count.scalar_one() == 1
    assert (await client.get(f"/api/v1/thanks/{gift['thanks_token']}")).json()["already_sent"] is True


@pytest.mark.asyncio
async def test_empty_thank_you_is_rejected(client: AsyncClient, gift: dict[str, object]) -> None:
    resp = await _send(client, gift["thanks_token"], "   ")
    assert resp.status_code == 422
    assert await _tracked_thanks(client, gift) is None


@pytest.mark.asyncio
async def test_only_photos_voice_or_video_are_accepted(
    client: AsyncClient, gift: dict[str, object], fake_thanks_store: list[str]
) -> None:
    resp = await _send(client, gift["thanks_token"], None, ("x.pdf", b"%PDF", "application/pdf"))
    assert resp.status_code == 415


@pytest.mark.asyncio
async def test_unknown_or_cancelled_links_are_404(
    client: AsyncClient, db: AsyncSession, gift: dict[str, object]
) -> None:
    assert (await client.get(f"/api/v1/thanks/{uuid.uuid4()}")).status_code == 404

    order = gift["order"]
    await db.refresh(order)  # type: ignore[arg-type]
    order.status = OrderStatus.cancelled  # type: ignore[attr-defined]
    await db.commit()
    assert (await client.get(f"/api/v1/thanks/{gift['thanks_token']}")).status_code == 404


@pytest.mark.asyncio
async def test_vendor_gets_the_thanks_token_for_the_card(client: AsyncClient, gift: dict[str, object]) -> None:
    token = await _login(client, str(gift["vendor_email"]))
    leg = (
        await client.get(
            f"/api/v1/vendor/fulfillments/{gift['fulfillment_id']}", headers={"Authorization": f"Bearer {token}"}
        )
    ).json()
    assert leg["thanks_token"] == str(gift["thanks_token"])
