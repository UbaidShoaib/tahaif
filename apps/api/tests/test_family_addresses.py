"""Family address book: relationship, birthday and anniversary on saved recipients."""

import uuid

import pytest
from httpx import AsyncClient


async def _headers(client: AsyncClient) -> dict[str, str]:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": f"family_{uuid.uuid4().hex[:8]}@example.com", "password": "Strongpass1", "full_name": "Ali"},
    )
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


_AMMI = {
    "recipient_name": "Shabana Khan",
    "recipient_phone": "+923001234567",
    "line1": "House 5 Street 10",
    "city_name": "Lahore",
    "relationship": "  Ammi ",
    "birthday": {"month": 3, "day": 12},
    "anniversary": {"month": 12, "day": 1},
}


@pytest.mark.asyncio
async def test_saves_relationship_and_occasions(client: AsyncClient) -> None:
    headers = await _headers(client)

    created = await client.post("/api/v1/me/addresses", json=_AMMI, headers=headers)

    assert created.status_code == 201
    body = created.json()
    assert body["relationship"] == "Ammi"
    assert body["birthday"] == {"month": 3, "day": 12}
    assert body["anniversary"] == {"month": 12, "day": 1}
    listed = (await client.get("/api/v1/me/addresses", headers=headers)).json()
    assert listed[0]["relationship"] == "Ammi"


@pytest.mark.asyncio
async def test_update_can_change_or_clear_an_occasion_and_leaves_the_rest(client: AsyncClient) -> None:
    headers = await _headers(client)
    addr_id = (await client.post("/api/v1/me/addresses", json=_AMMI, headers=headers)).json()["id"]

    resp = await client.patch(
        f"/api/v1/me/addresses/{addr_id}",
        json={"birthday": {"month": 2, "day": 29}, "anniversary": None},
        headers=headers,
    )

    body = resp.json()
    assert resp.status_code == 200
    assert body["birthday"] == {"month": 2, "day": 29}  # leap-day birthdays are real
    assert body["anniversary"] is None
    assert body["relationship"] == "Ammi"
    assert body["line1"] == "House 5 Street 10"


@pytest.mark.parametrize("bad", [{"month": 2, "day": 30}, {"month": 13, "day": 1}, {"month": 4, "day": 31}])
@pytest.mark.asyncio
async def test_rejects_impossible_dates(client: AsyncClient, bad: dict[str, int]) -> None:
    headers = await _headers(client)
    resp = await client.post("/api/v1/me/addresses", json={**_AMMI, "birthday": bad}, headers=headers)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_plain_address_still_works_without_family_fields(client: AsyncClient) -> None:
    headers = await _headers(client)
    plain = {k: v for k, v in _AMMI.items() if k not in ("relationship", "birthday", "anniversary")}

    body = (await client.post("/api/v1/me/addresses", json=plain, headers=headers)).json()

    assert body["relationship"] is None
    assert body["birthday"] is None


@pytest.mark.asyncio
async def test_data_export_includes_the_whole_address_book(client: AsyncClient) -> None:
    headers = await _headers(client)
    await client.post("/api/v1/me/addresses", json=_AMMI, headers=headers)

    export = (await client.get("/api/v1/me/export", headers=headers)).json()

    [entry] = export["addresses"]
    assert entry["recipient_name"] == "Shabana Khan"
    assert entry["recipient_phone"] == "+923001234567"
    assert entry["relationship"] == "Ammi"
    assert entry["birthday"] == {"month": 3, "day": 12}
