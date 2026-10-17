"""Back-office order page: full details, internal notes and timeline."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import UserRole
from tests.test_social_orders import (
    _body,
    _catalog,
    _login,
    _make_user,
    _place,
    _staff_headers,
)

API = "/api/v1/admin/orders"


async def _order(client: AsyncClient, db: AsyncSession, headers: dict[str, str], **extra: object) -> dict:
    product_id, city_id = await _catalog(db)
    return (await _place(client, headers, _body(product_id, city_id, **extra)))["order"]


@pytest.mark.asyncio
async def test_detail_has_contact_address_payment_and_timeline(client: AsyncClient, db: AsyncSession) -> None:
    headers = await _staff_headers(client, db)
    order = await _order(client, db, headers, landmark="Opposite Liberty Market", address_line2="Block C")

    resp = await client.get(f"{API}/{order['id']}", headers=headers)

    assert resp.status_code == 200, resp.text
    d = resp.json()
    assert (d["buyer_name"], d["source_ref"], d["campaign"]) == ("Sara (London)", "@sara.uk", "reel_eid_cakes")
    # The staff account has no name, so it shows by email.
    assert d["buyer_phone"].startswith("+44") and d["taken_by"].endswith("@example.com")
    f = d["fulfillments"][0]
    assert (f["recipient_name"], f["address_line2"], f["landmark"]) == ("Ammi Jaan", "Block C", "Opposite Liberty Market")
    assert "vendor_phone" in f
    assert d["items"][0]["greeting_message"] == "Happy birthday Ammi" and "customization" in d["items"][0]
    assert d["payment"]["method"] == "bank_transfer" and d["payment"]["amount_pkr"] == d["total_pkr"]
    assert d["timeline"][0]["label"] == "Placed (instagram)"
    assert d["staff_notes"] == []


@pytest.mark.asyncio
async def test_timeline_includes_sent_whatsapp_messages(client: AsyncClient, db: AsyncSession) -> None:
    headers = await _staff_headers(client, db)
    order = await _order(client, db, headers)
    await client.post(f"{API}/{order['id']}/whatsapp/order_summary/sent", headers=headers)

    labels = [e["label"] for e in (await client.get(f"{API}/{order['id']}", headers=headers)).json()["timeline"]]

    assert labels == ["Placed (instagram)", "Order summary sent on WhatsApp"]


@pytest.mark.asyncio
async def test_staff_add_notes_in_order(client: AsyncClient, db: AsyncSession) -> None:
    headers = await _staff_headers(client, db)
    order = await _order(client, db, headers)
    url = f"{API}/{order['id']}/notes"

    first = await client.post(url, json={"body": "  Buyer called: deliver after 5pm.  "}, headers=headers)
    await client.post(url, json={"body": "Rider has the gate code."}, headers=headers)

    assert first.status_code == 201, first.text
    assert first.json()["body"] == "Buyer called: deliver after 5pm."
    assert first.json()["author_name"].endswith("@example.com")
    notes = (await client.get(f"{API}/{order['id']}", headers=headers)).json()["staff_notes"]
    assert [n["body"] for n in notes] == ["Buyer called: deliver after 5pm.", "Rider has the gate code."]


@pytest.mark.asyncio
async def test_notes_stay_internal(client: AsyncClient, db: AsyncSession) -> None:
    headers = await _staff_headers(client, db)
    order = await _order(client, db, headers)
    await client.post(f"{API}/{order['id']}/notes", json={"body": "Fraud check: card name differs"}, headers=headers)

    public = await client.get(f"/api/v1/orders/{order['public_token']}")

    assert public.status_code == 200, public.text
    assert "Fraud check" not in public.text and "staff_notes" not in public.json()


@pytest.mark.asyncio
async def test_note_rules_and_access(client: AsyncClient, db: AsyncSession) -> None:
    headers = await _staff_headers(client, db)
    order = await _order(client, db, headers)
    customer = await _make_user(db, role=UserRole.customer)
    customer_headers = {"Authorization": f"Bearer {await _login(client, customer.email)}"}

    assert (await client.post(f"{API}/{order['id']}/notes", json={"body": ""}, headers=headers)).status_code == 422
    assert (await client.post(f"{API}/{order['id']}/notes", json={"body": "x" * 2001}, headers=headers)).status_code == 422
    assert (await client.post(f"{API}/{uuid.uuid4()}/notes", json={"body": "hi"}, headers=headers)).status_code == 404
    assert (await client.get(f"{API}/{uuid.uuid4()}", headers=headers)).status_code == 404
    assert (await client.get(f"{API}/{order['id']}", headers=customer_headers)).status_code == 403
    assert (await client.post(f"{API}/{order['id']}/notes", json={"body": "hi"}, headers=customer_headers)).status_code == 403
