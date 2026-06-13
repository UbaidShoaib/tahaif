"""HTTP-layer tests for the catalog endpoints."""

import uuid
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.catalog import City, Vendor
from app.models.user import User, UserRole
from app.repositories.catalog_repository import (
    CategoryRepository,
    CityRepository,
    ProductRepository,
    VendorRepository,
)
from app.repositories.user_repository import UserRepository

# ── Helpers ───────────────────────────────────────────────────────────────────

async def _make_user(db: AsyncSession, role: UserRole = UserRole.customer) -> User:
    from app.core.security import hash_password
    suffix = uuid.uuid4().hex[:8]
    return await UserRepository(db).create(
        email=f"user_{suffix}@example.com",
        password_hash=hash_password("Password1"),
        role=role,
    )


async def _make_city(db: AsyncSession, slug: str | None = None) -> City:
    repo = CityRepository(db)
    slug = slug or f"city-{uuid.uuid4().hex[:6]}"
    return await repo.create(name=slug.title(), slug=slug, timezone="Asia/Karachi")


async def _make_vendor(db: AsyncSession, city: City, owner: User | None = None) -> Vendor:
    repo = VendorRepository(db)
    suffix = uuid.uuid4().hex[:6]
    return await repo.create(
        city_id=city.id,
        owner_user_id=owner.id if owner else None,
        name=f"Vendor {suffix}",
        slug=f"vendor-{suffix}",
    )


async def _login(client: AsyncClient, email: str, password: str = "Password1") -> str:
    resp = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    return resp.json()["access_token"]


@pytest_asyncio.fixture
async def staff_user(db: AsyncSession) -> User:
    return await _make_user(db, role=UserRole.staff)


@pytest_asyncio.fixture
async def vendor_user(db: AsyncSession) -> User:
    return await _make_user(db, role=UserRole.vendor)


@pytest_asyncio.fixture
async def city(db: AsyncSession) -> City:
    return await _make_city(db)


@pytest_asyncio.fixture
async def vendor(db: AsyncSession, city: City) -> Vendor:
    return await _make_vendor(db, city)


# ── City endpoints ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_cities_empty(client: AsyncClient, _setup_db: None) -> None:
    resp = await client.get("/api/v1/cities")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_create_and_get_city(client: AsyncClient, db: AsyncSession, staff_user: User) -> None:
    slug = f"lahore-{uuid.uuid4().hex[:4]}"
    staff_email = staff_user.email  # capture before any HTTP call
    token = await _login(client, staff_email)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        "/api/v1/cities",
        json={"name": "Lahore", "slug": slug, "timezone": "Asia/Karachi"},
        headers=headers,
    )
    assert resp.status_code == 201
    assert resp.json()["slug"] == slug
    assert resp.json()["is_active"] is True

    resp2 = await client.get(f"/api/v1/cities/{slug}")
    assert resp2.status_code == 200
    assert resp2.json()["name"] == "Lahore"


@pytest.mark.asyncio
async def test_create_city_duplicate_slug(
    client: AsyncClient, db: AsyncSession, staff_user: User, city: City
) -> None:
    staff_email = staff_user.email
    city_slug = city.slug  # capture before HTTP call
    token = await _login(client, staff_email)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        "/api/v1/cities",
        json={"name": "Duplicate", "slug": city_slug, "timezone": "Asia/Karachi"},
        headers=headers,
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_create_city_requires_staff(
    client: AsyncClient, db: AsyncSession, vendor_user: User
) -> None:
    vendor_email = vendor_user.email
    token = await _login(client, vendor_email)
    resp = await client.post(
        "/api/v1/cities",
        json={"name": "X", "slug": "x-city-xyz", "timezone": "UTC"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_city_not_found(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/cities/nonexistent-city-slug")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_city(
    client: AsyncClient, db: AsyncSession, staff_user: User, city: City
) -> None:
    staff_email = staff_user.email
    city_slug = city.slug
    token = await _login(client, staff_email)
    resp = await client.patch(
        f"/api/v1/cities/{city_slug}",
        json={"is_active": False},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False


# ── Vendor endpoints ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_vendors(client: AsyncClient, city: City, vendor: Vendor) -> None:
    vendor_slug = vendor.slug
    resp = await client.get("/api/v1/vendors")
    assert resp.status_code == 200
    slugs = [v["slug"] for v in resp.json()]
    assert vendor_slug in slugs


@pytest.mark.asyncio
async def test_list_vendors_filter_by_city(
    client: AsyncClient, db: AsyncSession, city: City
) -> None:
    city_id = str(city.id)
    other_city = await _make_city(db)
    v1 = await _make_vendor(db, city)
    await _make_vendor(db, other_city)
    v1_slug = v1.slug

    resp = await client.get(f"/api/v1/vendors?city_id={city_id}")
    assert resp.status_code == 200
    slugs = [v["slug"] for v in resp.json()]
    assert v1_slug in slugs
    for v in resp.json():
        assert v["city_id"] == city_id


@pytest.mark.asyncio
async def test_create_vendor(
    client: AsyncClient, db: AsyncSession, vendor_user: User, city: City
) -> None:
    vendor_email = vendor_user.email
    vendor_user_id = str(vendor_user.id)
    city_id = str(city.id)
    token = await _login(client, vendor_email)
    slug = f"my-vendor-{uuid.uuid4().hex[:4]}"

    resp = await client.post(
        "/api/v1/vendors",
        json={"city_id": city_id, "name": "My Vendor", "slug": slug},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["slug"] == slug
    assert resp.json()["owner_user_id"] == vendor_user_id


@pytest.mark.asyncio
async def test_vendor_not_found(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/vendors/no-such-vendor")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_vendor_by_owner(
    client: AsyncClient, db: AsyncSession, vendor_user: User, city: City
) -> None:
    vendor_email = vendor_user.email
    v = await _make_vendor(db, city, owner=vendor_user)
    v_slug = v.slug
    token = await _login(client, vendor_email)
    resp = await client.patch(
        f"/api/v1/vendors/{v_slug}",
        json={"description": "Updated desc"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["description"] == "Updated desc"


@pytest.mark.asyncio
async def test_update_vendor_not_owner(
    client: AsyncClient, db: AsyncSession, vendor_user: User, city: City
) -> None:
    vendor_email = vendor_user.email
    other_vendor = await _make_vendor(db, city)
    other_slug = other_vendor.slug
    token = await _login(client, vendor_email)
    resp = await client.patch(
        f"/api/v1/vendors/{other_slug}",
        json={"description": "Nope"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


# ── Category endpoints ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_and_list_categories(
    client: AsyncClient, db: AsyncSession, staff_user: User
) -> None:
    staff_email = staff_user.email
    token = await _login(client, staff_email)
    slug = f"cakes-{uuid.uuid4().hex[:4]}"

    resp = await client.post(
        "/api/v1/categories",
        json={"name": "Cakes", "slug": slug},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["slug"] == slug

    list_resp = await client.get("/api/v1/categories")
    assert list_resp.status_code == 200
    slugs = [c["slug"] for c in list_resp.json()]
    assert slug in slugs


@pytest.mark.asyncio
async def test_create_category_duplicate(
    client: AsyncClient, db: AsyncSession, staff_user: User
) -> None:
    staff_email = staff_user.email
    repo = CategoryRepository(db)
    slug = f"flowers-{uuid.uuid4().hex[:4]}"
    await repo.create(name="Flowers", slug=slug)

    token = await _login(client, staff_email)
    resp = await client.post(
        "/api/v1/categories",
        json={"name": "Flowers2", "slug": slug},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 409


# ── Product endpoints ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_and_get_product(
    client: AsyncClient, db: AsyncSession, vendor_user: User, city: City
) -> None:
    vendor_email = vendor_user.email
    owned_vendor = await _make_vendor(db, city, owner=vendor_user)
    owned_vendor_id = str(owned_vendor.id)
    token = await _login(client, vendor_email)
    slug = f"choc-cake-{uuid.uuid4().hex[:4]}"

    with patch("app.services.catalog_service.meilisearch_client.index_product", new_callable=AsyncMock):
        resp = await client.post(
            "/api/v1/products",
            json={
                "vendor_id": owned_vendor_id,
                "name": "Chocolate Cake",
                "slug": slug,
                "base_price_pkr": 250000,
            },
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 201
    assert resp.json()["slug"] == slug
    assert resp.json()["base_price_pkr"] == 250000

    resp2 = await client.get(f"/api/v1/products/{slug}")
    assert resp2.status_code == 200


@pytest.mark.asyncio
async def test_create_product_not_vendor_owner(
    client: AsyncClient, db: AsyncSession, vendor_user: User, city: City, vendor: Vendor
) -> None:
    vendor_email = vendor_user.email
    vendor_id = str(vendor.id)
    token = await _login(client, vendor_email)

    resp = await client.post(
        "/api/v1/products",
        json={
            "vendor_id": vendor_id,
            "name": "Cake",
            "slug": f"cake-{uuid.uuid4().hex[:4]}",
            "base_price_pkr": 100000,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_list_products(
    client: AsyncClient, db: AsyncSession, city: City, vendor_user: User
) -> None:
    repo = ProductRepository(db)
    owned_vendor = await _make_vendor(db, city, owner=vendor_user)
    product = await repo.create(
        vendor_id=owned_vendor.id,
        name="Red Roses",
        slug=f"red-roses-{uuid.uuid4().hex[:4]}",
        base_price_pkr=150000,
    )
    product_slug = product.slug

    resp = await client.get("/api/v1/products")
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "total" in data
    slugs = [p["slug"] for p in data["items"]]
    assert product_slug in slugs


@pytest.mark.asyncio
async def test_update_product(
    client: AsyncClient, db: AsyncSession, vendor_user: User, city: City
) -> None:
    vendor_email = vendor_user.email
    owned_vendor = await _make_vendor(db, city, owner=vendor_user)
    repo = ProductRepository(db)
    slug = f"perfume-{uuid.uuid4().hex[:4]}"
    await repo.create(
        vendor_id=owned_vendor.id,
        name="Perfume",
        slug=slug,
        base_price_pkr=500000,
    )

    token = await _login(client, vendor_email)

    with patch("app.services.catalog_service.meilisearch_client.index_product", new_callable=AsyncMock):
        resp = await client.patch(
            f"/api/v1/products/{slug}",
            json={"base_price_pkr": 600000},
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 200
    assert resp.json()["base_price_pkr"] == 600000


@pytest.mark.asyncio
async def test_soft_delete_product(
    client: AsyncClient, db: AsyncSession, vendor_user: User, city: City
) -> None:
    vendor_email = vendor_user.email
    owned_vendor = await _make_vendor(db, city, owner=vendor_user)
    repo = ProductRepository(db)
    slug = f"candle-{uuid.uuid4().hex[:4]}"
    await repo.create(
        vendor_id=owned_vendor.id,
        name="Candle",
        slug=slug,
        base_price_pkr=50000,
    )

    token = await _login(client, vendor_email)

    with patch("app.services.catalog_service.meilisearch_client.delete_product", new_callable=AsyncMock):
        resp = await client.delete(
            f"/api/v1/products/{slug}",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 204

    list_resp = await client.get("/api/v1/products")
    slugs = [p["slug"] for p in list_resp.json()["items"]]
    assert slug not in slugs


@pytest.mark.asyncio
async def test_product_not_found(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/products/no-such-product")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_set_product_city_availability(
    client: AsyncClient, db: AsyncSession, vendor_user: User, city: City
) -> None:
    vendor_email = vendor_user.email
    city_id = str(city.id)
    owned_vendor = await _make_vendor(db, city, owner=vendor_user)
    repo = ProductRepository(db)
    slug = f"gift-box-{uuid.uuid4().hex[:4]}"
    await repo.create(
        vendor_id=owned_vendor.id,
        name="Gift Box",
        slug=slug,
        base_price_pkr=300000,
    )

    token = await _login(client, vendor_email)

    with patch("app.services.catalog_service.meilisearch_client.index_product", new_callable=AsyncMock):
        resp = await client.put(
            f"/api/v1/products/{slug}/cities",
            json=[{
                "city_id": city_id,
                "delivery_fee_pkr": 20000,
                "lead_time_hours": 48,
                "is_available": True,
            }],
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 200
    cities = resp.json()["product_cities"]
    assert len(cities) == 1
    assert cities[0]["city_id"] == city_id
    assert cities[0]["delivery_fee_pkr"] == 20000


@pytest.mark.asyncio
async def test_search_returns_empty_without_meilisearch(client: AsyncClient) -> None:
    """Search endpoint returns empty hits when Meilisearch is unavailable."""
    empty = {"hits": [], "query": "cake", "estimatedTotalHits": 0}
    with patch("app.services.catalog_service.meilisearch_client.search", new_callable=AsyncMock) as mock_search:
        mock_search.return_value = empty
        resp = await client.get("/api/v1/search?q=cake")
    assert resp.status_code == 200
    assert "hits" in resp.json()
