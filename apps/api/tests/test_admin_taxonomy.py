"""Back-office cities and categories: list everything, edit, switch off, and delete what nothing uses."""

import uuid

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.loyalty import AuditLog
from app.models.user import UserRole
from tests.test_admin_products import (  # noqa: F401 — autouse fixture
    _headers,
    no_search_index,
)

API = "/api/v1"


def _slug(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:6]}"


@pytest_asyncio.fixture
async def admin(client: AsyncClient, db: AsyncSession) -> dict[str, str]:
    return await _headers(client, db, UserRole.admin)


# ── Cities ────────────────────────────────────────────────────────────────────

async def test_city_lifecycle(client: AsyncClient, db: AsyncSession, admin: dict[str, str]) -> None:
    slug = _slug("multan")
    resp = await client.post(f"{API}/cities", json={"name": "Multan", "slug": slug}, headers=admin)
    assert resp.status_code == 201, resp.text
    city = resp.json()
    assert city["timezone"] == "Asia/Karachi"

    resp = await client.patch(f"{API}/cities/{slug}", json={"name": "Multan City", "is_active": False}, headers=admin)
    assert resp.status_code == 200, resp.text

    # Switched off: gone from the store, still in the back office.
    assert all(c["slug"] != slug for c in (await client.get(f"{API}/cities")).json())
    listed = next(c for c in (await client.get(f"{API}/admin/cities", headers=admin)).json() if c["slug"] == slug)
    assert (listed["name"], listed["is_active"], listed["vendor_count"], listed["product_count"]) == (
        "Multan City", False, 0, 0,
    )

    assert (await client.delete(f"{API}/admin/cities/{city['id']}", headers=admin)).status_code == 204
    assert all(c["slug"] != slug for c in (await client.get(f"{API}/admin/cities", headers=admin)).json())
    actions = set((await db.scalars(select(AuditLog.action).where(AuditLog.entity_id == city["id"]))).all())
    assert actions == {"city.created", "city.updated", "city.deleted"}


async def test_city_in_use_cannot_be_deleted(client: AsyncClient, admin: dict[str, str]) -> None:
    city = (await client.post(f"{API}/cities", json={"name": "Quetta", "slug": _slug("quetta")}, headers=admin)).json()
    resp = await client.post(
        f"{API}/vendors", json={"city_id": city["id"], "name": "Shop", "slug": _slug("shop")}, headers=admin
    )
    assert resp.status_code == 201

    resp = await client.delete(f"{API}/admin/cities/{city['id']}", headers=admin)
    assert resp.status_code == 409
    assert "Switch it off" in resp.json()["detail"]


async def test_city_time_zone_must_be_real(client: AsyncClient, admin: dict[str, str]) -> None:
    resp = await client.post(
        f"{API}/cities", json={"name": "X", "slug": _slug("x"), "timezone": "Mars/Olympus"}, headers=admin
    )
    assert resp.status_code == 422


async def test_only_staff_manage_cities(client: AsyncClient, db: AsyncSession, admin: dict[str, str]) -> None:
    customer = await _headers(client, db, UserRole.customer)
    city = (await client.post(f"{API}/cities", json={"name": "Sialkot", "slug": _slug("skt")}, headers=admin)).json()
    assert (await client.get(f"{API}/admin/cities", headers=customer)).status_code == 403
    assert (await client.delete(f"{API}/admin/cities/{city['id']}", headers=customer)).status_code == 403
    assert (await client.post(f"{API}/cities", json={"name": "Y", "slug": _slug("y")}, headers=customer)).status_code == 403


# ── Categories ────────────────────────────────────────────────────────────────

async def _category(client: AsyncClient, admin: dict[str, str], name: str, parent_id: str | None = None) -> dict:
    resp = await client.post(
        f"{API}/categories", json={"name": name, "slug": _slug(name.lower()), "parent_id": parent_id}, headers=admin
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_subcategories_and_moving_to_top_level(client: AsyncClient, admin: dict[str, str]) -> None:
    flowers = await _category(client, admin, "Flowers")
    roses = await _category(client, admin, "Roses", flowers["id"])

    listed = {c["id"]: c for c in (await client.get(f"{API}/admin/categories", headers=admin)).json()}
    assert listed[flowers["id"]]["child_count"] == 1
    assert listed[roses["id"]]["parent_id"] == flowers["id"]

    # The store menu nests it under its parent...
    menu = next(c for c in (await client.get(f"{API}/categories")).json() if c["id"] == flowers["id"])
    assert [ch["id"] for ch in menu["children"]] == [roses["id"]]

    # ...and drops it once switched off.
    resp = await client.patch(f"{API}/categories/{roses['slug']}", json={"is_active": False}, headers=admin)
    assert resp.status_code == 200, resp.text
    menu = next(c for c in (await client.get(f"{API}/categories")).json() if c["id"] == flowers["id"])
    assert menu["children"] == []

    # null parent moves it to the top level.
    resp = await client.patch(f"{API}/categories/{roses['slug']}", json={"parent_id": None}, headers=admin)
    assert resp.status_code == 200, resp.text
    assert resp.json()["parent_id"] is None


async def test_category_nesting_stays_two_levels(client: AsyncClient, admin: dict[str, str]) -> None:
    gifts = await _category(client, admin, "Gifts")
    mugs = await _category(client, admin, "Mugs", gifts["id"])
    other = await _category(client, admin, "Other")

    # Not under a subcategory, not under itself, and a parent can't become a child.
    resp = await client.post(
        f"{API}/categories", json={"name": "Deep", "slug": _slug("deep"), "parent_id": mugs["id"]}, headers=admin
    )
    assert resp.status_code == 422
    resp = await client.patch(f"{API}/categories/{other['slug']}", json={"parent_id": other["id"]}, headers=admin)
    assert resp.status_code == 422
    resp = await client.patch(f"{API}/categories/{gifts['slug']}", json={"parent_id": other["id"]}, headers=admin)
    assert resp.status_code == 422


async def test_category_with_products_or_children_cannot_be_deleted(
    client: AsyncClient, admin: dict[str, str]
) -> None:
    cakes = await _category(client, admin, "Cakes")
    await _category(client, admin, "Cupcakes", cakes["id"])
    assert (await client.delete(f"{API}/admin/categories/{cakes['id']}", headers=admin)).status_code == 409

    perfumes = await _category(client, admin, "Perfumes")
    city = (await client.post(f"{API}/cities", json={"name": "Lahore", "slug": _slug("lhr")}, headers=admin)).json()
    vendor = (
        await client.post(f"{API}/vendors", json={"city_id": city["id"], "name": "S", "slug": _slug("s")}, headers=admin)
    ).json()
    resp = await client.post(
        f"{API}/products",
        json={
            "vendor_id": vendor["id"], "category_id": perfumes["id"], "name": "Oud",
            "slug": _slug("oud"), "base_price_pkr": 100000,
        },
        headers=admin,
    )
    assert resp.status_code == 201, resp.text
    listed = {c["id"]: c for c in (await client.get(f"{API}/admin/categories", headers=admin)).json()}
    assert listed[perfumes["id"]]["product_count"] == 1
    assert (await client.delete(f"{API}/admin/categories/{perfumes['id']}", headers=admin)).status_code == 409

    empty = await _category(client, admin, "Empty")
    assert (await client.delete(f"{API}/admin/categories/{empty['id']}", headers=admin)).status_code == 204
    assert (await client.delete(f"{API}/admin/categories/{empty['id']}", headers=admin)).status_code == 404
