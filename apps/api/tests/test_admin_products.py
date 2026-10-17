"""Back-office product management: find, open and edit any product, live or hidden."""

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import UserRole
from app.repositories.catalog_repository import CityRepository
from app.repositories.user_repository import UserRepository

API = "/api/v1"


@pytest.fixture(autouse=True)
def no_search_index(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import catalog_service

    monkeypatch.setattr(catalog_service.meilisearch_client, "index_product", AsyncMock())
    monkeypatch.setattr(catalog_service.meilisearch_client, "delete_product", AsyncMock())


async def _headers(client: AsyncClient, db: AsyncSession, role: UserRole) -> dict[str, str]:
    from app.core.security import hash_password

    email = f"user_{uuid.uuid4().hex[:8]}@example.com"
    await UserRepository(db).create(email=email, password_hash=hash_password("Password1"), role=role)
    await db.commit()
    resp = await client.post(f"{API}/auth/login", json={"email": email, "password": "Password1"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest_asyncio.fixture
async def admin_headers(client: AsyncClient, db: AsyncSession) -> dict[str, str]:
    return await _headers(client, db, UserRole.admin)


@pytest_asyncio.fixture
async def shop(client: AsyncClient, db: AsyncSession, admin_headers: dict[str, str]) -> SimpleNamespace:
    slug = f"city-{uuid.uuid4().hex[:6]}"
    city = await CityRepository(db).create(name=slug.title(), slug=slug, timezone="Asia/Karachi")
    await db.commit()
    city_id = str(city.id)
    resp = await client.post(
        f"{API}/vendors",
        json={"city_id": city_id, "name": "House Shop", "slug": f"house-{uuid.uuid4().hex[:6]}"},
        headers=admin_headers,
    )
    assert resp.status_code == 201, resp.text
    return SimpleNamespace(vendor_id=resp.json()["id"], city_id=city_id)


async def _product(client: AsyncClient, headers: dict[str, str], shop: SimpleNamespace, name: str) -> dict:
    resp = await client.post(
        f"{API}/products",
        json={
            "vendor_id": shop.vendor_id,
            "name": name,
            "slug": f"{name.lower().replace(' ', '-')}-{uuid.uuid4().hex[:6]}",
            "description": "Fresh every morning.",
            "base_price_pkr": 250000,
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_list_searches_by_name_and_filters_by_vendor(
    client: AsyncClient, admin_headers: dict[str, str], shop: SimpleNamespace
) -> None:
    tag = uuid.uuid4().hex[:6]
    roses = await _product(client, admin_headers, shop, f"Red Roses {tag}")
    await _product(client, admin_headers, shop, f"Chocolate Cake {tag}")

    resp = await client.get(f"{API}/admin/products", params={"q": f"roses {tag}"}, headers=admin_headers)
    assert [p["id"] for p in resp.json()] == [roses["id"]]

    by_vendor = await client.get(f"{API}/admin/products", params={"vendor_id": shop.vendor_id}, headers=admin_headers)
    assert len(by_vendor.json()) == 2
    row = by_vendor.json()[0]
    assert row["image_url"] is None and "updated_at" in row


async def test_hidden_product_opens_in_the_editor_but_not_the_storefront(
    client: AsyncClient, admin_headers: dict[str, str], shop: SimpleNamespace
) -> None:
    product = await _product(client, admin_headers, shop, "Pink Peonies")
    await client.patch(f"{API}/admin/products/{product['id']}/active", json={"is_active": False}, headers=admin_headers)

    assert (await client.get(f"{API}/products/{product['slug']}")).status_code == 404
    resp = await client.get(f"{API}/admin/products/{product['id']}", headers=admin_headers)
    assert resp.status_code == 200
    assert (resp.json()["name"], resp.json()["is_active"]) == ("Pink Peonies", False)

    assert (await client.get(f"{API}/admin/products/{uuid.uuid4()}", headers=admin_headers)).status_code == 404


async def test_only_staff_open_the_editor(
    client: AsyncClient, db: AsyncSession, admin_headers: dict[str, str], shop: SimpleNamespace
) -> None:
    product = await _product(client, admin_headers, shop, "Tulips")
    customer = await _headers(client, db, UserRole.customer)
    staff = await _headers(client, db, UserRole.staff)

    assert (await client.get(f"{API}/admin/products/{product['id']}", headers=customer)).status_code == 403
    assert (await client.get(f"{API}/admin/products/{product['id']}", headers=staff)).status_code == 200


async def test_category_and_description_can_be_cleared(
    client: AsyncClient, admin_headers: dict[str, str], shop: SimpleNamespace
) -> None:
    product = await _product(client, admin_headers, shop, "Lilies")
    cat = await client.post(
        f"{API}/categories", json={"name": "Flowers", "slug": f"flowers-{uuid.uuid4().hex[:6]}"}, headers=admin_headers
    )
    url = f"{API}/products/{product['slug']}"
    await client.patch(url, json={"category_id": cat.json()["id"]}, headers=admin_headers)

    resp = await client.patch(url, json={"category_id": None, "description": None, "name": None}, headers=admin_headers)

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert (body["category_id"], body["description"], body["name"]) == (None, None, "Lilies")


async def test_main_photo_can_be_changed_and_survives_deletion(
    client: AsyncClient, admin_headers: dict[str, str], shop: SimpleNamespace
) -> None:
    product = await _product(client, admin_headers, shop, "Orchids")
    base = f"{API}/products/{product['slug']}/images"
    first = (await client.post(base, params={"url": "https://img.example/1.jpg"}, headers=admin_headers)).json()
    second = (await client.post(base, params={"url": "https://img.example/2.jpg"}, headers=admin_headers)).json()
    assert (first["is_primary"], second["is_primary"]) == (True, False)

    resp = await client.post(f"{base}/{second['id']}/primary", headers=admin_headers)
    assert resp.status_code == 200, resp.text
    assert {i["id"]: i["is_primary"] for i in resp.json()["images"]} == {first["id"]: False, second["id"]: True}

    # Deleting the main photo promotes the one that is left.
    await client.delete(f"{base}/{second['id']}", headers=admin_headers)
    images = (await client.get(f"{API}/admin/products/{product['id']}", headers=admin_headers)).json()["images"]
    assert [(i["id"], i["is_primary"]) for i in images] == [(first["id"], True)]

    assert (await client.post(f"{base}/{uuid.uuid4()}/primary", headers=admin_headers)).status_code == 404
