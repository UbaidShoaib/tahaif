"""Audit log: back-office changes record who, what changed and from where."""

import uuid
from types import SimpleNamespace

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import UserRole
from app.repositories.user_repository import UserRepository
from tests.test_admin_products import (  # noqa: F401
    _product,
    admin_headers,
    no_search_index,
    shop,
)
from tests.test_social_orders import (
    _body,
    _catalog,
    _login,
    _make_user,
    _place,
    _staff_headers,
)

LOG = "/api/v1/admin/audit-log"


async def _admin(client: AsyncClient, db: AsyncSession) -> dict[str, str]:
    user = await _make_user(db, role=UserRole.admin)
    return {"Authorization": f"Bearer {await _login(client, user.email)}"}


async def _order(client: AsyncClient, db: AsyncSession, headers: dict[str, str]) -> dict:
    product_id, city_id = await _catalog(db)
    return (await _place(client, headers, _body(product_id, city_id)))["order"]


async def _log(client: AsyncClient, headers: dict[str, str], **params: object) -> list[dict]:
    resp = await client.get(LOG, params=params, headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()["items"]


@pytest.mark.asyncio
async def test_status_change_records_actor_change_and_ip(client: AsyncClient, db: AsyncSession) -> None:
    staff = await _staff_headers(client, db)
    admin = await _admin(client, db)
    order = await _order(client, db, staff)

    await client.patch(f"/api/v1/admin/orders/{order['id']}/status", json={"status": "on_hold"}, headers=staff)

    rows = await _log(client, admin, entity="order", entity_id=order["id"], action="order.status_changed")
    assert len(rows) == 1
    e = rows[0]
    assert (e["before"], e["after"]) == ({"status": "pending_payment"}, {"status": "on_hold"})
    assert e["label"] == "Changed order status"
    assert e["actor_name"].endswith("@example.com") and e["ip_address"]


@pytest.mark.asyncio
async def test_no_entry_when_nothing_changes(client: AsyncClient, db: AsyncSession) -> None:
    staff = await _staff_headers(client, db)
    admin = await _admin(client, db)
    order = await _order(client, db, staff)

    await client.patch(f"/api/v1/admin/orders/{order['id']}/status", json={"status": "pending_payment"}, headers=staff)

    assert await _log(client, admin, entity_id=order["id"], action="order.status_changed") == []


@pytest.mark.asyncio
async def test_order_timeline_shows_who_changed_status(client: AsyncClient, db: AsyncSession) -> None:
    staff = await _staff_headers(client, db)
    order = await _order(client, db, staff)
    await client.patch(f"/api/v1/admin/orders/{order['id']}/status", json={"status": "on_hold"}, headers=staff)
    await client.post(f"/api/v1/admin/orders/{order['id']}/verify-payment", json={"verified": False}, headers=staff)

    timeline = (await client.get(f"/api/v1/admin/orders/{order['id']}", headers=staff)).json()["timeline"]

    changed = next(e for e in timeline if e["label"] == "Status: pending payment → on hold")
    assert changed["by"].endswith("@example.com")
    assert "Payment rejected" in [e["label"] for e in timeline]


@pytest.mark.asyncio
async def test_staff_order_and_note_are_logged(client: AsyncClient, db: AsyncSession) -> None:
    staff = await _staff_headers(client, db)
    admin = await _admin(client, db)
    order = await _order(client, db, staff)
    await client.post(f"/api/v1/admin/orders/{order['id']}/notes", json={"body": "Called buyer"}, headers=staff)

    actions = [e["action"] for e in await _log(client, admin, entity_id=order["id"])]

    assert actions == ["order.note_added", "order.created_by_staff"]  # newest first


@pytest.mark.asyncio
async def test_product_edit_keeps_only_changed_fields(
    client: AsyncClient, admin_headers: dict[str, str], shop: SimpleNamespace  # noqa: F811
) -> None:
    product = await _product(client, admin_headers, shop, "Gerberas")
    await client.patch(f"/api/v1/products/{product['slug']}", json={"base_price_pkr": 300000, "name": "Gerberas"}, headers=admin_headers)
    await client.patch(f"/api/v1/admin/products/{product['id']}/active", json={"is_active": False}, headers=admin_headers)

    rows = await _log(client, admin_headers, entity="product", entity_id=product["id"])

    assert [e["action"] for e in rows] == ["product.hidden", "product.updated", "product.created"]
    assert (rows[1]["before"], rows[1]["after"]) == ({"base_price_pkr": 250000}, {"base_price_pkr": 300000})


@pytest.mark.asyncio
async def test_coupon_and_role_changes_are_logged(client: AsyncClient, db: AsyncSession) -> None:
    admin = await _admin(client, db)
    code = f"EID{uuid.uuid4().hex[:6]}".upper()
    coupon = (await client.post(
        "/api/v1/admin/coupons", json={"code": code, "coupon_type": "percent", "value": "10"}, headers=admin
    )).json()
    await client.patch(f"/api/v1/admin/coupons/{coupon['id']}/active", json={"is_active": False}, headers=admin)
    target = await _make_user(db)
    user = await UserRepository(db).get_by_email(target.email)
    assert user is not None
    target_id = str(user.id)
    await client.patch(f"/api/v1/admin/users/{target_id}/role", params={"role": "staff"}, headers=admin)

    coupon_rows = await _log(client, admin, entity="coupon", entity_id=coupon["id"])
    assert [e["action"] for e in coupon_rows] == ["coupon.disabled", "coupon.created"]
    assert coupon_rows[0]["after"] == {"is_active": False, "code": code}
    role = (await _log(client, admin, entity="user", entity_id=target_id))[0]
    assert (role["before"], role["after"]["role"]) == ({"role": "customer"}, "staff")


@pytest.mark.asyncio
async def test_only_admins_read_the_log_and_paging_works(client: AsyncClient, db: AsyncSession) -> None:
    staff = await _staff_headers(client, db)
    admin = await _admin(client, db)
    order = await _order(client, db, staff)
    for body in ("one", "two", "three"):
        await client.post(f"/api/v1/admin/orders/{order['id']}/notes", json={"body": body}, headers=staff)

    assert (await client.get(LOG, headers=staff)).status_code == 403
    page = (await client.get(LOG, params={"entity_id": order["id"], "action": "order.note", "limit": 2}, headers=admin)).json()
    assert (page["total"], len(page["items"])) == (3, 2)
    assert page["items"][0]["after"] == {"note": "three"}
