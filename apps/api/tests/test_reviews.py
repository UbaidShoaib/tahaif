"""Tests for product reviews endpoints."""

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.catalog import City, Vendor
from app.models.loyalty import Review
from app.models.user import User, UserRole
from app.repositories.catalog_repository import CityRepository, ProductRepository, VendorRepository
from app.repositories.user_repository import UserRepository


# ── Helpers ───────────────────────────────────────────────────────────────────


async def _make_user(db: AsyncSession) -> User:
    suffix = uuid.uuid4().hex[:8]
    return await UserRepository(db).create(
        email=f"rvw_{suffix}@example.com",
        password_hash=hash_password("Password1"),
        role=UserRole.customer,
    )


async def _make_city(db: AsyncSession) -> City:
    slug = f"rv-city-{uuid.uuid4().hex[:6]}"
    return await CityRepository(db).create(name=slug.title(), slug=slug, timezone="Asia/Karachi")


async def _make_vendor(db: AsyncSession, city: City) -> Vendor:
    suffix = uuid.uuid4().hex[:6]
    return await VendorRepository(db).create(
        city_id=city.id, name=f"Vendor {suffix}", slug=f"vendor-rv-{suffix}"
    )


async def _login(client: AsyncClient, email: str) -> str:
    resp = await client.post("/api/v1/auth/login", json={"email": email, "password": "Password1"})
    assert resp.status_code == 200
    return resp.json()["access_token"]


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def user(db: AsyncSession) -> User:
    return await _make_user(db)


@pytest_asyncio.fixture
async def city(db: AsyncSession) -> City:
    return await _make_city(db)


@pytest_asyncio.fixture
async def vendor(db: AsyncSession, city: City) -> Vendor:
    return await _make_vendor(db, city)


@pytest_asyncio.fixture
async def product(db: AsyncSession, vendor: Vendor):  # type: ignore[no-untyped-def]
    suffix = uuid.uuid4().hex[:6]
    return await ProductRepository(db).create(
        vendor_id=vendor.id,
        name=f"Product {suffix}",
        slug=f"product-rv-{suffix}",
        base_price_pkr=50000,
    )


# ── POST /reviews ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_submit_review(
    client: AsyncClient, db: AsyncSession, user: User, product
) -> None:
    email = user.email
    product_id = str(product.id)

    token = await _login(client, email)
    resp = await client.post(
        "/api/v1/reviews",
        json={"product_id": product_id, "rating": 5, "title": "Great!", "body": "Loved it."},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["rating"] == 5
    assert data["title"] == "Great!"
    assert data["is_published"] is False  # requires moderation


@pytest.mark.asyncio
async def test_submit_review_duplicate_rejected(
    client: AsyncClient, db: AsyncSession, user: User, product
) -> None:
    email = user.email
    product_id = str(product.id)

    token = await _login(client, email)
    # First review
    await client.post(
        "/api/v1/reviews",
        json={"product_id": product_id, "rating": 4},
        headers={"Authorization": f"Bearer {token}"},
    )
    # Duplicate
    resp = await client.post(
        "/api/v1/reviews",
        json={"product_id": product_id, "rating": 3},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_submit_review_requires_auth(
    client: AsyncClient, product
) -> None:
    resp = await client.post(
        "/api/v1/reviews",
        json={"product_id": str(product.id), "rating": 5},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_submit_review_invalid_rating(
    client: AsyncClient, db: AsyncSession, user: User, product
) -> None:
    email = user.email
    product_id = str(product.id)

    token = await _login(client, email)
    resp = await client.post(
        "/api/v1/reviews",
        json={"product_id": product_id, "rating": 6},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422


# ── GET /reviews ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_reviews_empty(client: AsyncClient, product) -> None:
    product_id = str(product.id)
    resp = await client.get(f"/api/v1/reviews?product_id={product_id}")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_list_reviews_shows_only_published(
    client: AsyncClient, db: AsyncSession, user: User, product
) -> None:
    """Submitted reviews (unpublished) should not appear in the public list."""
    email = user.email
    product_id = str(product.id)

    token = await _login(client, email)
    await client.post(
        "/api/v1/reviews",
        json={"product_id": product_id, "rating": 5, "title": "Secret"},
        headers={"Authorization": f"Bearer {token}"},
    )

    resp = await client.get(f"/api/v1/reviews?product_id={product_id}")
    assert resp.status_code == 200
    assert resp.json() == []  # not published yet


@pytest.mark.asyncio
async def test_list_reviews_shows_published(
    client: AsyncClient, db: AsyncSession, user: User, product
) -> None:
    """Directly insert a published review and confirm it appears in GET."""
    product_id = str(product.id)
    user_id = user.id

    # Insert published review directly via DB
    review = Review(
        user_id=user_id,
        product_id=product.id,
        rating=4,
        title="Good",
        body="Decent product.",
        is_published=True,
    )
    db.add(review)
    await db.flush()

    resp = await client.get(f"/api/v1/reviews?product_id={product_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["rating"] == 4
    assert data[0]["title"] == "Good"
