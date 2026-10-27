# ruff: noqa: F811  (pytest fixtures imported from another test module)
"""Back-office screens' API: coupons, users, exchange rates, occasions and shops."""

import uuid
from types import SimpleNamespace

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.loyalty import AuditLog
from app.models.user import UserRole
from tests.test_admin_products import (  # noqa: F401 — fixtures
    _headers,
    _product,
    admin_headers,
    no_search_index,
    shop,
)

API = "/api/v1"


def _code() -> str:
    return f"EID{uuid.uuid4().hex[:6]}".upper()


async def _actions(db: AsyncSession, entity_id: str) -> list[str]:
    rows = await db.scalars(select(AuditLog.action).where(AuditLog.entity_id == entity_id).order_by(AuditLog.created_at))
    return list(rows.all())


# ── Coupons ───────────────────────────────────────────────────────────────────

async def test_coupon_create_edit_and_switch_off(
    client: AsyncClient, db: AsyncSession, admin_headers: dict[str, str]
) -> None:
    code = _code()
    resp = await client.post(
        f"{API}/admin/coupons",
        json={"code": code.lower(), "coupon_type": "fixed", "value": "500", "min_order_pkr": 300000, "usage_limit": 50},
        headers=admin_headers,
    )
    assert resp.status_code == 201, resp.text
    coupon = resp.json()
    assert (coupon["code"], coupon["min_order_pkr"], coupon["used_count"]) == (code, 300000, 0)

    resp = await client.post(f"{API}/admin/coupons", json={"code": code, "coupon_type": "fixed", "value": "1"},
                             headers=admin_headers)
    assert resp.status_code == 409

    resp = await client.patch(
        f"{API}/admin/coupons/{coupon['id']}",
        json={"usage_limit": None, "ends_at": "2030-01-01T00:00:00Z", "value": "750"},
        headers=admin_headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert (body["usage_limit"], float(body["value"]), body["min_order_pkr"]) == (None, 750, 300000)
    assert body["ends_at"].startswith("2030-01-01")

    resp = await client.patch(f"{API}/admin/coupons/{coupon['id']}/active", json={"is_active": False},
                              headers=admin_headers)
    assert resp.json()["is_active"] is False
    listed = (await client.get(f"{API}/admin/coupons", params={"q": code[3:]}, headers=admin_headers)).json()
    assert [c["code"] for c in listed] == [code]
    assert await _actions(db, coupon["id"]) == ["coupon.created", "coupon.updated", "coupon.disabled"]


async def test_coupon_values_must_make_sense(client: AsyncClient, admin_headers: dict[str, str]) -> None:
    url = f"{API}/admin/coupons"
    too_much = {"code": _code(), "coupon_type": "percent", "value": "150"}
    assert (await client.post(url, json=too_much, headers=admin_headers)).status_code == 422
    backwards = {
        "code": _code(), "coupon_type": "percent", "value": "10",
        "starts_at": "2030-02-01T00:00:00Z", "ends_at": "2030-01-01T00:00:00Z",
    }
    assert (await client.post(url, json=backwards, headers=admin_headers)).status_code == 422
    spaced = {"code": "EID 2030", "coupon_type": "percent", "value": "10"}
    assert (await client.post(url, json=spaced, headers=admin_headers)).status_code == 422


# ── Users ─────────────────────────────────────────────────────────────────────

async def test_find_users_and_change_roles(client: AsyncClient, db: AsyncSession, admin_headers: dict[str, str]) -> None:
    staff = await _headers(client, db, UserRole.staff)
    target_email = f"findme_{uuid.uuid4().hex[:6]}@example.com"
    resp = await client.post(f"{API}/auth/register", json={"email": target_email, "password": "Password1"})
    assert resp.status_code in (200, 201), resp.text

    found = (await client.get(f"{API}/admin/users", params={"q": target_email[:12]}, headers=admin_headers)).json()
    assert [u["email"] for u in found] == [target_email]
    target = found[0]

    url = f"{API}/admin/users/{target['id']}/role"
    assert (await client.patch(url, params={"role": "staff"}, headers=staff)).status_code == 403
    resp = await client.patch(url, params={"role": "staff"}, headers=admin_headers)
    assert resp.status_code == 200 and resp.json()["role"] == "staff"

    only_staff = (await client.get(f"{API}/admin/users", params={"role": "staff", "q": target_email},
                                   headers=admin_headers)).json()
    assert [u["id"] for u in only_staff] == [target["id"]]


async def test_admins_cannot_change_their_own_role(client: AsyncClient, admin_headers: dict[str, str]) -> None:
    me = (await client.get(f"{API}/me", headers=admin_headers)).json()
    resp = await client.patch(f"{API}/admin/users/{me['id']}/role", params={"role": "customer"}, headers=admin_headers)
    assert resp.status_code == 422


# ── Exchange rates ────────────────────────────────────────────────────────────

async def test_manual_rate_wins_until_cleared(client: AsyncClient, db: AsyncSession, admin_headers: dict[str, str]) -> None:
    resp = await client.post(f"{API}/admin/fx-rates/override", json={"quote_currency": "gbp", "rate": "0.0029"},
                             headers=admin_headers)
    assert resp.status_code == 200, resp.text
    gbp = next(c for c in (await client.get(f"{API}/admin/fx-rates", headers=admin_headers)).json()
               if c["quote_currency"] == "GBP")
    assert (gbp["manual"]["rate"], gbp["effective_rate"]) == ("0.002900", "0.002900")
    assert "PKR" not in {c["quote_currency"] for c in (await client.get(f"{API}/admin/fx-rates", headers=admin_headers)).json()}

    assert (await client.delete(f"{API}/admin/fx-rates/override/GBP", headers=admin_headers)).status_code == 204
    gbp = next(c for c in (await client.get(f"{API}/admin/fx-rates", headers=admin_headers)).json()
               if c["quote_currency"] == "GBP")
    assert gbp["manual"] is None
    assert (await client.delete(f"{API}/admin/fx-rates/override/GBP", headers=admin_headers)).status_code == 404
    assert await _actions(db, "GBP") == ["fx_rate.overridden", "fx_rate.override_cleared"]


async def test_only_chargeable_currencies_can_be_overridden(client: AsyncClient, admin_headers: dict[str, str]) -> None:
    for code in ("PKR", "XYZ"):
        resp = await client.post(f"{API}/admin/fx-rates/override", json={"quote_currency": code, "rate": "1"},
                                 headers=admin_headers)
        assert resp.status_code == 422, code


# ── Occasions ─────────────────────────────────────────────────────────────────

async def test_occasion_lifecycle(
    client: AsyncClient, db: AsyncSession, admin_headers: dict[str, str], shop: SimpleNamespace
) -> None:
    slug = f"eid-{uuid.uuid4().hex[:6]}"
    resp = await client.post(
        f"{API}/admin/occasions",
        json={"slug": slug, "name": "Eid", "name_ur": "عید", "starts_at": "2030-03-01T00:00:00Z",
              "ends_at": "2030-03-05T00:00:00Z"},
        headers=admin_headers,
    )
    assert resp.status_code == 201, resp.text
    occasion = resp.json()
    product = await _product(client, admin_headers, shop, "Sheer Khurma")
    await client.put(f"{API}/products/{product['slug']}/occasions", json={"occasion_ids": [occasion["id"]]},
                     headers=admin_headers)

    url = f"{API}/admin/occasions/{occasion['id']}"
    resp = await client.patch(url, json={"name_ur": None, "ends_at": None, "is_active": False}, headers=admin_headers)
    assert resp.status_code == 200, resp.text
    assert (resp.json()["name_ur"], resp.json()["ends_at"], resp.json()["is_active"]) == (None, None, False)
    bad = await client.patch(url, json={"ends_at": "2029-01-01T00:00:00Z"}, headers=admin_headers)
    assert bad.status_code == 422

    listed = next(o for o in (await client.get(f"{API}/admin/occasions", headers=admin_headers)).json()
                  if o["id"] == occasion["id"])
    assert (listed["product_count"], listed["is_active"]) == (1, False)
    assert all(o["id"] != occasion["id"] for o in (await client.get(f"{API}/occasions")).json())
    assert await _actions(db, occasion["id"]) == ["occasion.created", "occasion.updated"]


# ── Shops ─────────────────────────────────────────────────────────────────────

async def _on_sale(client: AsyncClient, headers: dict[str, str], shop: SimpleNamespace) -> dict:
    product = await _product(client, headers, shop, "Roses")
    resp = await client.put(f"{API}/products/{product['slug']}/cities",
                            json=[{"city_id": shop.city_id, "delivery_fee_pkr": 0}], headers=headers)
    assert resp.status_code == 200, resp.text
    return product


async def test_closing_a_shop_takes_its_products_off_sale(
    client: AsyncClient, db: AsyncSession, admin_headers: dict[str, str], shop: SimpleNamespace
) -> None:
    product = await _on_sale(client, admin_headers, shop)
    customer = await _headers(client, db, UserRole.customer)
    assert (await client.get(f"{API}/products/{product['slug']}")).status_code == 200

    resp = await client.patch(f"{API}/admin/vendors/{shop.vendor_id}", json={"is_active": False}, headers=admin_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["is_active"] is False

    assert (await client.get(f"{API}/products/{product['slug']}")).status_code == 404
    listing = (await client.get(f"{API}/products", params={"city_id": shop.city_id})).json()
    assert all(p["id"] != product["id"] for p in listing["items"])
    added = await client.post(f"{API}/cart/items", json={"product_id": product["id"], "qty": 1}, headers=customer)
    assert added.status_code == 404

    await client.patch(f"{API}/admin/vendors/{shop.vendor_id}", json={"is_active": True}, headers=admin_headers)
    assert (await client.get(f"{API}/products/{product['slug']}")).status_code == 200
    assert await _actions(db, shop.vendor_id) == ["shop.closed", "shop.opened"]


async def test_shop_list_and_edit(client: AsyncClient, admin_headers: dict[str, str], shop: SimpleNamespace) -> None:
    await _on_sale(client, admin_headers, shop)
    listed = next(s for s in (await client.get(f"{API}/admin/vendors", headers=admin_headers)).json()
                  if s["id"] == shop.vendor_id)
    assert (listed["is_house"], listed["owner_email"], listed["product_count"], listed["live_product_count"]) == (
        True, None, 1, 1,
    )

    resp = await client.patch(
        f"{API}/admin/vendors/{shop.vendor_id}",
        json={"name": "Bouquet Bar", "contact_phone": "+923001234567", "description": None},
        headers=admin_headers,
    )
    assert resp.status_code == 200, resp.text
    assert (resp.json()["name"], resp.json()["contact_phone"], resp.json()["description"]) == (
        "Bouquet Bar", "+923001234567", None,
    )
    missing_city = await client.patch(f"{API}/admin/vendors/{shop.vendor_id}", json={"city_id": str(uuid.uuid4())},
                                      headers=admin_headers)
    assert missing_city.status_code == 404
