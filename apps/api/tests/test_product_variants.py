# ruff: noqa: F811  (pytest fixtures imported from another test module)
"""Sizes/options and stock: staff add and edit them; counted stock sells down and comes back on cancel."""

from types import SimpleNamespace

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.test_admin_products import (  # noqa: F401
    _product,
    admin_headers,
    no_search_index,
    shop,
)
from tests.test_audit_log import _admin, _log
from tests.test_social_orders import _body, _catalog, _place, _staff_headers

API = "/api/v1"


def _variant(product: dict, name: str) -> dict:
    return next(v for v in product["variants"] if v["name"] == name)


async def test_add_and_edit_sizes(client: AsyncClient, admin_headers: dict[str, str], shop: SimpleNamespace) -> None:
    product = await _product(client, admin_headers, shop, "Chocolate Cake")
    url = f"{API}/products/{product['slug']}/variants"

    resp = await client.post(url, json={"name": " 2 lb ", "price_delta_pkr": 280000}, headers=admin_headers)
    assert resp.status_code == 201, resp.text
    two = _variant(resp.json(), "2 lb")
    assert two["stock_qty"] is None and two["is_active"] is True

    resp = await client.post(url, json={"name": "2 LB"}, headers=admin_headers)
    assert resp.status_code == 409

    # Start counting, then reprice without touching the count, then stop counting.
    resp = await client.patch(f"{url}/{two['id']}", json={"stock_qty": 4}, headers=admin_headers)
    assert _variant(resp.json(), "2 lb")["stock_qty"] == 4
    resp = await client.patch(f"{url}/{two['id']}", json={"price_delta_pkr": 300000}, headers=admin_headers)
    v = _variant(resp.json(), "2 lb")
    assert (v["price_delta_pkr"], v["stock_qty"]) == (300000, 4)
    resp = await client.patch(f"{url}/{two['id']}", json={"stock_qty": None, "is_active": False}, headers=admin_headers)
    v = _variant(resp.json(), "2 lb")
    assert (v["stock_qty"], v["is_active"]) == (None, False)

    assert (await client.post(url, json={"name": "x", "stock_qty": -1}, headers=admin_headers)).status_code == 422
    missing = "00000000-0000-0000-0000-000000000000"
    assert (await client.patch(f"{url}/{missing}", json={"stock_qty": 1}, headers=admin_headers)).status_code == 404


async def test_customers_cannot_edit_sizes(
    client: AsyncClient, db: AsyncSession, admin_headers: dict[str, str], shop: SimpleNamespace
) -> None:
    from app.models.user import UserRole
    from tests.test_admin_products import _headers

    product = await _product(client, admin_headers, shop, "Roses")
    customer = await _headers(client, db, UserRole.customer)
    resp = await client.post(f"{API}/products/{product['slug']}/variants", json={"name": "Dozen"}, headers=customer)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_cancel_puts_counted_stock_back_and_is_logged(client: AsyncClient, db: AsyncSession) -> None:
    staff = await _staff_headers(client, db)
    admin = await _admin(client, db)
    product_id, city_id = await _catalog(db)
    slug = (await client.get(f"{API}/admin/products/{product_id}", headers=admin)).json()["slug"]
    resp = await client.post(f"{API}/products/{slug}/variants", json={"name": "Gift box", "stock_qty": 3}, headers=admin)
    variant_id = _variant(resp.json(), "Gift box")["id"]

    body = _body(product_id, city_id)
    body["items"][0]["variant_id"] = variant_id  # qty 2
    order = (await _place(client, staff, body))["order"]

    def stock() -> object:
        return client.get(f"{API}/admin/products/{product_id}", headers=admin)

    assert _variant((await stock()).json(), "Gift box")["stock_qty"] == 1

    resp = await client.patch(f"{API}/admin/orders/{order['id']}/status", json={"status": "cancelled"}, headers=staff)
    assert resp.status_code == 200
    assert _variant((await stock()).json(), "Gift box")["stock_qty"] == 3

    restocked = await _log(client, admin, entity="order", action="order.restocked")
    assert restocked[0]["after"]["items"] == [{"variant": "Gift box", "qty": 2, "stock_now": 3}]
    added = await _log(client, admin, entity="product", action="product.variant")
    assert {e["action"] for e in added} >= {"product.variant_added"}
