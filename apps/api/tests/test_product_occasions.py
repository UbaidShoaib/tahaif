# ruff: noqa: F811  (pytest fixtures imported from another test module)
"""Occasions on a product: staff choose which occasion pages list it."""

import uuid
from types import SimpleNamespace

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import UserRole
from tests.test_admin_products import (  # noqa: F401
    _headers,
    _product,
    admin_headers,
    no_search_index,
    shop,
)

API = "/api/v1"


async def _occasion(client: AsyncClient, headers: dict[str, str], name: str) -> dict:
    slug = f"{name.lower().replace(' ', '-').replace(chr(39), '')}-{uuid.uuid4().hex[:6]}"
    resp = await client.post(f"{API}/occasions", json={"slug": slug, "name": name}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_set_occasions_shows_in_editor_and_on_occasion_page(
    client: AsyncClient, admin_headers: dict[str, str], shop: SimpleNamespace
) -> None:
    product = await _product(client, admin_headers, shop, "Red Roses")
    mothers = await _occasion(client, admin_headers, "Mother's Day")
    eid = await _occasion(client, admin_headers, "Eid")
    url = f"{API}/products/{product['slug']}/occasions"

    resp = await client.put(url, json={"occasion_ids": [mothers["id"], eid["id"], eid["id"]]}, headers=admin_headers)
    assert resp.status_code == 200, resp.text
    detail = (await client.get(f"{API}/admin/products/{product['id']}", headers=admin_headers)).json()
    assert sorted(o["name"] for o in detail["occasions"]) == ["Eid", "Mother's Day"]

    listed = (await client.get(f"{API}/products", params={"occasion_id": eid["id"]})).json()
    assert product["id"] in [p["id"] for p in listed["items"]]

    # The full set is replaced: dropping Eid takes it off the Eid page.
    await client.put(url, json={"occasion_ids": [mothers["id"]]}, headers=admin_headers)
    listed = (await client.get(f"{API}/products", params={"occasion_id": eid["id"]})).json()
    assert product["id"] not in [p["id"] for p in listed["items"]]

    log = (await client.get(f"{API}/admin/audit-log", params={"entity": "product", "action": "product.occasions"},
                            headers=admin_headers)).json()["items"]
    assert log[0]["before"] == {"occasions": ["Eid", "Mother's Day"]}
    assert log[0]["after"] == {"occasions": ["Mother's Day"]}


async def test_unknown_occasion_and_strangers_are_refused(
    client: AsyncClient, db: AsyncSession, admin_headers: dict[str, str], shop: SimpleNamespace
) -> None:
    product = await _product(client, admin_headers, shop, "Cake")
    url = f"{API}/products/{product['slug']}/occasions"

    resp = await client.put(url, json={"occasion_ids": [str(uuid.uuid4())]}, headers=admin_headers)
    assert resp.status_code == 404

    customer = await _headers(client, db, UserRole.customer)
    assert (await client.put(url, json={"occasion_ids": []}, headers=customer)).status_code == 403
