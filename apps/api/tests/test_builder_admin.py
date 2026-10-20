"""Setting up builders from the admin (ADR 0014)."""

import uuid
from dataclasses import dataclass

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.catalog import Product
from app.models.loyalty import AuditLog
from app.models.user import UserRole
from tests.test_cart import _login, _make_city, _make_user, _make_vendor


@dataclass(frozen=True)
class _Shop:
    base: uuid.UUID
    base_slug: str
    rose: uuid.UUID
    lily: uuid.UUID
    other_shop_item: uuid.UUID


async def _shop(db: AsyncSession) -> _Shop:
    city = await _make_city(db)
    vendor, other = await _make_vendor(db, city), await _make_vendor(db, city)
    s = uuid.uuid4().hex[:6]
    base = Product(vendor_id=vendor.id, name="Hamper", slug=f"hamper-{s}", base_price_pkr=80000)
    rose = Product(vendor_id=vendor.id, name="Roses", slug=f"roses-{s}", base_price_pkr=75000)
    lily = Product(vendor_id=vendor.id, name="Lilies", slug=f"lilies-{s}", base_price_pkr=60000)
    elsewhere = Product(vendor_id=other.id, name="Cake", slug=f"cake-{s}", base_price_pkr=300000)
    db.add_all([base, rose, lily, elsewhere])
    await db.commit()
    return _Shop(base.id, base.slug, rose.id, lily.id, elsewhere.id)


async def _admin(client: AsyncClient, db: AsyncSession, role: UserRole = UserRole.admin) -> dict[str, str]:
    user = await _make_user(db, role)
    await db.commit()
    email = user.email
    return {"Authorization": f"Bearer {await _login(client, email)}"}


@pytest.mark.asyncio
async def test_set_up_a_builder_end_to_end(client: AsyncClient, db: AsyncSession) -> None:
    shop = await _shop(db)
    auth = await _admin(client, db)
    url = f"/api/v1/admin/products/{shop.base}/builder"

    # An ordinary product to start with; items can't be added yet.
    assert (await client.get(url, headers=auth)).json()["builder_kind"] is None
    resp = await client.post(f"{url}/components", json={"component_product_id": str(shop.rose)}, headers=auth)
    assert resp.status_code == 409

    resp = await client.put(url, json={"builder_kind": "hamper", "min_items": 2, "max_items": 6}, headers=auth)
    assert resp.status_code == 200, resp.text
    # No items yet: buyers can't start it, and it isn't listed for them.
    assert (await client.post("/api/v1/buckets", json={"builder_slug": shop.base_slug})).status_code == 409
    assert all(b["slug"] != shop.base_slug for b in (await client.get("/api/v1/builders")).json())
    assert (resp.json()["min_items"], resp.json()["max_items"]) == (2, 6)

    resp = await client.post(f"{url}/components", json={"component_product_id": str(shop.rose), "max_qty": 2}, headers=auth)
    assert resp.status_code == 201
    resp = await client.post(f"{url}/components", json={"component_product_id": str(shop.lily), "role": "item"}, headers=auth)
    [rose, lily] = resp.json()["components"]
    assert (rose["name"], rose["max_qty"], lily["sort_order"]) == ("Roses", 2, 1)

    # Buyers can now start it, and it's listed.
    builder = (await client.get(f"/api/v1/builders/{shop.base_slug}")).json()
    assert {c["name"] for c in builder["components"]} == {"Roses", "Lilies"}
    listed = (await client.get("/api/v1/admin/builders", headers=auth)).json()
    entry = next(b for b in listed if b["product_id"] == str(shop.base))
    assert (entry["component_count"], entry["bucket_count"]) == (2, 0)
    assert any(b["slug"] == shop.base_slug for b in (await client.get("/api/v1/builders")).json())

    # Switching an item off hides it from buyers; removing takes it out.
    resp = await client.patch(f"{url}/components/{lily['id']}", json={"is_active": False, "max_qty": 4}, headers=auth)
    assert resp.json()["components"][1]["is_active"] is False
    builder = (await client.get(f"/api/v1/builders/{shop.base_slug}")).json()
    assert [c["name"] for c in builder["components"]] == ["Roses"]
    resp = await client.delete(f"{url}/components/{rose['id']}", headers=auth)
    assert [c["name"] for c in resp.json()["components"]] == ["Lilies"]

    actions = (await db.execute(
        select(AuditLog.action).where(AuditLog.entity_id == str(shop.base)).order_by(AuditLog.created_at)
    )).scalars().all()
    assert actions == [
        "builder.updated", "builder.item_added", "builder.item_added", "builder.item_updated", "builder.item_removed",
    ]


@pytest.mark.asyncio
async def test_item_rules(client: AsyncClient, db: AsyncSession) -> None:
    shop = await _shop(db)
    auth = await _admin(client, db)
    url = f"/api/v1/admin/products/{shop.base}/builder"
    await client.put(url, json={"builder_kind": "bouquet", "min_items": 1}, headers=auth)

    async def add(product_id: uuid.UUID) -> int:
        resp = await client.post(f"{url}/components", json={"component_product_id": str(product_id)}, headers=auth)
        return resp.status_code

    assert await add(shop.other_shop_item) == 409  # another shop: two deliveries
    assert await add(shop.base) == 409  # itself
    assert await add(shop.rose) == 201
    assert await add(shop.rose) == 409  # already in

    # An item can't become a builder; min can't exceed max.
    resp = await client.put(f"/api/v1/admin/products/{shop.rose}/builder", json={"builder_kind": "hamper"}, headers=auth)
    assert resp.status_code == 409
    resp = await client.put(url, json={"builder_kind": "bouquet", "min_items": 5, "max_items": 2}, headers=auth)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_builder_base_cannot_be_bought_alone_and_switching_off_closes_buckets(
    client: AsyncClient, db: AsyncSession
) -> None:
    shop = await _shop(db)
    auth = await _admin(client, db)
    url = f"/api/v1/admin/products/{shop.base}/builder"
    await client.put(url, json={"builder_kind": "hamper", "min_items": 1}, headers=auth)
    await client.post(f"{url}/components", json={"component_product_id": str(shop.rose)}, headers=auth)

    resp = await client.post("/api/v1/cart/items", json={"product_id": str(shop.base)})
    assert resp.status_code == 409
    assert f"/build/{shop.base_slug}" in resp.json()["detail"]
    product = (await client.get(f"/api/v1/products/{shop.base_slug}")).json()
    assert product["builder_kind"] == "hamper"

    bucket = (await client.post("/api/v1/buckets", json={"builder_slug": shop.base_slug})).json()
    edit_url = f"/api/v1/buckets/{bucket['id']}/edits?t={bucket['share_token']}"
    assert (await client.post(edit_url, json={"edit": {"op": "add", "component_id": str(shop.rose)}})).status_code == 200

    await client.put(url, json={"builder_kind": None}, headers=auth)
    assert (await client.post(edit_url, json={"edit": {"op": "clear"}})).status_code == 409
    assert (await client.get(f"/api/v1/builders/{shop.base_slug}")).status_code == 404


@pytest.mark.asyncio
async def test_customers_cannot_manage_builders(client: AsyncClient, db: AsyncSession) -> None:
    shop = await _shop(db)
    auth = await _admin(client, db, UserRole.customer)
    resp = await client.put(f"/api/v1/admin/products/{shop.base}/builder", json={"builder_kind": "hamper"}, headers=auth)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_hidden_product_can_be_a_builder_only_item(client: AsyncClient, db: AsyncSession) -> None:
    shop = await _shop(db)
    stem = Product(vendor_id=(await db.get(Product, shop.rose)).vendor_id, name="Single stem",  # type: ignore[union-attr]
                   slug=f"stem-{uuid.uuid4().hex[:6]}", base_price_pkr=25000, is_active=False)
    db.add(stem)
    await db.commit()
    stem_id = stem.id
    auth = await _admin(client, db)
    url = f"/api/v1/admin/products/{shop.base}/builder"
    await client.put(url, json={"builder_kind": "bouquet", "min_items": 1}, headers=auth)
    resp = await client.post(f"{url}/components", json={"component_product_id": str(stem_id), "role": "stem"}, headers=auth)
    assert resp.json()["components"][0]["product_is_active"] is False

    builder = (await client.get(f"/api/v1/builders/{shop.base_slug}")).json()
    assert [c["name"] for c in builder["components"]] == ["Single stem"]
