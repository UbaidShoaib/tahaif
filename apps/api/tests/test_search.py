"""Product search (Meilisearch with DB fallback) and hiding deactivated products."""

import uuid
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.integrations.meilisearch_client import SearchUnavailable
from app.models.catalog import City, Product, ProductCity, Vendor
from app.models.user import UserRole
from app.repositories.catalog_repository import (
    CityRepository,
    ProductRepository,
    VendorRepository,
)
from app.repositories.user_repository import UserRepository

_SEARCH_IDS = "app.services.catalog_service.meilisearch_client.search_ids"
_INDEX = "app.services.catalog_service.meilisearch_client.index_product"
_DELETE = "app.services.catalog_service.meilisearch_client.delete_product"


def _tag() -> str:
    return uuid.uuid4().hex[:8]


async def _city(db: AsyncSession) -> City:
    slug = f"s-city-{_tag()}"
    return await CityRepository(db).create(name=slug.title(), slug=slug, timezone="Asia/Karachi")


async def _vendor(db: AsyncSession, city: City, name: str) -> Vendor:
    return await VendorRepository(db).create(city_id=city.id, name=name, slug=f"v-{_tag()}")


async def _product(
    db: AsyncSession, vendor: Vendor, name: str, city: City | None = None, active: bool = True
) -> Product:
    product = await ProductRepository(db).create(
        vendor_id=vendor.id, name=name, slug=f"p-{_tag()}", base_price_pkr=100000, is_active=active,
        description=f"{name} description",
    )
    if city:
        db.add(ProductCity(product_id=product.id, city_id=city.id, delivery_fee_pkr=20000))
        await db.flush()
    return product


async def _admin_token(client: AsyncClient, db: AsyncSession) -> str:
    email = f"adm_{_tag()}@example.com"
    await UserRepository(db).create(email=email, password_hash=hash_password("Password1"), role=UserRole.admin)
    await db.commit()
    resp = await client.post("/api/v1/auth/login", json={"email": email, "password": "Password1"})
    return str(resp.json()["access_token"])


# ── Fallback path ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_search_falls_back_to_db_when_meilisearch_down(client: AsyncClient, db: AsyncSession) -> None:
    tag = _tag()
    city = await _city(db)
    vendor = await _vendor(db, city, f"Bakery {tag}")
    await _product(db, vendor, f"Truffle {tag}", city)
    await db.commit()

    with patch(_SEARCH_IDS, new=AsyncMock(side_effect=SearchUnavailable("down"))):
        resp = await client.get(f"/api/v1/search?q=truffle {tag}")

    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["name"] == f"Truffle {tag}"


@pytest.mark.asyncio
async def test_fallback_matches_vendor_name_and_description(client: AsyncClient, db: AsyncSession) -> None:
    tag = _tag()
    city = await _city(db)
    vendor = await _vendor(db, city, f"Layers {tag}")
    await _product(db, vendor, f"Plain Loaf {tag}")
    await db.commit()

    with patch(_SEARCH_IDS, new=AsyncMock(side_effect=SearchUnavailable("down"))):
        by_vendor = (await client.get(f"/api/v1/search?q=layers {tag}")).json()
        by_description = (await client.get(f"/api/v1/search?q=loaf {tag} description")).json()

    assert [p["name"] for p in by_vendor["items"]] == [f"Plain Loaf {tag}"]
    assert by_description["total"] == 1


@pytest.mark.asyncio
async def test_fallback_excludes_inactive_and_respects_city(client: AsyncClient, db: AsyncSession) -> None:
    tag = _tag()
    lahore, karachi = await _city(db), await _city(db)
    vendor = await _vendor(db, lahore, f"Shop {tag}")
    await _product(db, vendor, f"Rose {tag} A", lahore)
    await _product(db, vendor, f"Rose {tag} B", karachi)
    await _product(db, vendor, f"Rose {tag} C", lahore, active=False)
    lahore_id = lahore.id
    await db.commit()

    with patch(_SEARCH_IDS, new=AsyncMock(side_effect=SearchUnavailable("down"))):
        resp = await client.get(f"/api/v1/search?q=rose {tag}&city_id={lahore_id}")

    assert [p["name"] for p in resp.json()["items"]] == [f"Rose {tag} A"]


# ── Meilisearch path ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_search_keeps_meilisearch_ranking_and_drops_stale_hits(client: AsyncClient, db: AsyncSession) -> None:
    tag = _tag()
    city = await _city(db)
    vendor = await _vendor(db, city, f"Florist {tag}")
    first = await _product(db, vendor, f"Zinnia {tag}")
    second = await _product(db, vendor, f"Aster {tag}")
    inactive = await _product(db, vendor, f"Tulip {tag}", active=False)
    ids = [first.id, uuid.uuid4(), inactive.id, second.id]  # unknown + inactive ids must be dropped
    city_id = city.id
    await db.commit()

    mock = AsyncMock(return_value=(ids, 4))
    with patch(_SEARCH_IDS, new=mock):
        resp = await client.get(f"/api/v1/search?q=flower&city_id={city_id}&limit=5")

    assert [p["name"] for p in resp.json()["items"]] == [f"Zinnia {tag}", f"Aster {tag}"]
    mock.assert_awaited_once_with("flower", city_id=city_id, limit=5)


@pytest.mark.asyncio
async def test_search_requires_query(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/search?q=")).status_code == 422


# ── Deactivated products ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_inactive_product_detail_is_404(client: AsyncClient, db: AsyncSession) -> None:
    city = await _city(db)
    vendor = await _vendor(db, city, f"Hidden {_tag()}")
    product = await _product(db, vendor, "Retired Cake", active=False)
    slug = product.slug
    await db.commit()

    assert (await client.get(f"/api/v1/products/{slug}")).status_code == 404


@pytest.mark.asyncio
async def test_admin_toggle_hides_and_restores_product(client: AsyncClient, db: AsyncSession) -> None:
    city = await _city(db)
    vendor = await _vendor(db, city, f"Toggle {_tag()}")
    product = await _product(db, vendor, "Seasonal Box", city)
    pid, slug = product.id, product.slug
    token = await _admin_token(client, db)
    auth = {"Authorization": f"Bearer {token}"}

    with patch(_DELETE, new=AsyncMock()) as delete_mock:
        off = await client.patch(f"/api/v1/admin/products/{pid}/active", json={"is_active": False}, headers=auth)
    assert off.status_code == 200 and off.json()["is_active"] is False
    delete_mock.assert_awaited_once_with(str(pid))
    assert (await client.get(f"/api/v1/products/{slug}")).status_code == 404

    with patch(_INDEX, new=AsyncMock()) as index_mock:
        on = await client.patch(f"/api/v1/admin/products/{pid}/active", json={"is_active": True}, headers=auth)
    assert on.status_code == 200 and on.json()["is_active"] is True
    assert index_mock.await_args is not None
    doc = index_mock.await_args.args[0]
    assert doc["id"] == str(pid) and doc["vendor_name"].startswith("Toggle")
    assert (await client.get(f"/api/v1/products/{slug}")).status_code == 200


@pytest.mark.asyncio
async def test_admin_toggle_unknown_product_is_404(client: AsyncClient, db: AsyncSession) -> None:
    token = await _admin_token(client, db)
    resp = await client.patch(
        f"/api/v1/admin/products/{uuid.uuid4()}/active",
        json={"is_active": False},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404
