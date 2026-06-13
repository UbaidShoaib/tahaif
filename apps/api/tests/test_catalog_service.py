"""Service-level tests for catalog_service — target 80%+ coverage."""

import uuid
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User, UserRole
from app.repositories.catalog_repository import (
    CategoryRepository,
    CityRepository,
    ProductRepository,
    VendorRepository,
)
from app.repositories.user_repository import UserRepository
from app.schemas.catalog import (
    CategoryCreate,
    CategoryUpdate,
    CityCreate,
    CityUpdate,
    ProductCityUpsert,
    ProductCreate,
    ProductUpdate,
    VendorCreate,
    VendorUpdate,
)
from app.services import catalog_service

# ── Fixtures ──────────────────────────────────────────────────────────────────

async def _user(db: AsyncSession, role: UserRole = UserRole.customer) -> User:
    from app.core.security import hash_password
    suffix = uuid.uuid4().hex[:8]
    return await UserRepository(db).create(
        email=f"svc_{suffix}@example.com",
        password_hash=hash_password("Password1"),
        role=role,
    )


# ── City service ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_city_success(db: AsyncSession) -> None:
    staff = await _user(db, UserRole.staff)
    slug = f"karachi-{uuid.uuid4().hex[:4]}"
    city = await catalog_service.create_city(
        db, CityCreate(name="Karachi", slug=slug, timezone="Asia/Karachi"), staff
    )
    assert city.slug == slug


@pytest.mark.asyncio
async def test_create_city_conflict(db: AsyncSession) -> None:
    staff = await _user(db, UserRole.staff)
    slug = f"isl-{uuid.uuid4().hex[:4]}"
    await CityRepository(db).create(name="Islamabad", slug=slug, timezone="Asia/Karachi")

    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        await catalog_service.create_city(
            db, CityCreate(name="Islamabad2", slug=slug, timezone="Asia/Karachi"), staff
        )
    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
async def test_create_city_forbidden_for_customer(db: AsyncSession) -> None:
    customer = await _user(db, UserRole.customer)
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        await catalog_service.create_city(
            db, CityCreate(name="X", slug="x-slug", timezone="UTC"), customer
        )
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_get_city_not_found(db: AsyncSession) -> None:
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        await catalog_service.get_city(db, "nonexistent-slug")
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_update_city_no_changes(db: AsyncSession) -> None:
    staff = await _user(db, UserRole.staff)
    slug = f"noop-{uuid.uuid4().hex[:4]}"
    city = await CityRepository(db).create(name="Noop", slug=slug, timezone="UTC")
    updated = await catalog_service.update_city(db, slug, CityUpdate(), staff)
    assert updated.id == city.id


@pytest.mark.asyncio
async def test_list_cities(db: AsyncSession) -> None:
    slug = f"mul-{uuid.uuid4().hex[:4]}"
    await CityRepository(db).create(name="Multan", slug=slug, timezone="Asia/Karachi")
    cities = await catalog_service.list_cities(db)
    assert any(c.slug == slug for c in cities)


# ── Vendor service ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_vendor_city_not_found(db: AsyncSession) -> None:
    user = await _user(db, UserRole.vendor)
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        await catalog_service.create_vendor(
            db,
            VendorCreate(
                city_id=uuid.uuid4(), name="Ghost", slug="ghost-vendor"
            ),
            user,
        )
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_create_vendor_slug_conflict(db: AsyncSession) -> None:
    user = await _user(db, UserRole.vendor)
    city = await CityRepository(db).create(name="C", slug=f"c-{uuid.uuid4().hex[:4]}", timezone="UTC")
    slug = f"dup-{uuid.uuid4().hex[:4]}"
    await VendorRepository(db).create(city_id=city.id, name="First", slug=slug)

    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        await catalog_service.create_vendor(
            db, VendorCreate(city_id=city.id, name="Second", slug=slug), user
        )
    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
async def test_update_vendor_not_found(db: AsyncSession) -> None:
    user = await _user(db, UserRole.staff)
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        await catalog_service.update_vendor(
            db, "no-such-slug", VendorUpdate(name="X"), user
        )
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_update_vendor_no_changes(db: AsyncSession) -> None:
    user = await _user(db, UserRole.vendor)
    city = await CityRepository(db).create(name="C2", slug=f"c2-{uuid.uuid4().hex[:4]}", timezone="UTC")
    slug = f"vndr-{uuid.uuid4().hex[:4]}"
    vendor = await VendorRepository(db).create(
        city_id=city.id, owner_user_id=user.id, name="V", slug=slug
    )
    updated = await catalog_service.update_vendor(db, slug, VendorUpdate(), user)
    assert updated.id == vendor.id


# ── Category service ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_category_parent_not_found(db: AsyncSession) -> None:
    staff = await _user(db, UserRole.staff)
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        await catalog_service.create_category(
            db,
            CategoryCreate(name="X", slug=f"x-{uuid.uuid4().hex[:4]}", parent_id=uuid.uuid4()),
            staff,
        )
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_update_category_not_found(db: AsyncSession) -> None:
    staff = await _user(db, UserRole.staff)
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        await catalog_service.update_category(db, "ghost", CategoryUpdate(), staff)
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_update_category_no_changes(db: AsyncSession) -> None:
    staff = await _user(db, UserRole.staff)
    slug = f"cat-{uuid.uuid4().hex[:4]}"
    await CategoryRepository(db).create(name="Cat", slug=slug)
    updated = await catalog_service.update_category(db, slug, CategoryUpdate(), staff)
    assert updated.slug == slug


# ── Product service ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_product_vendor_not_found(db: AsyncSession) -> None:
    user = await _user(db, UserRole.vendor)
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        await catalog_service.create_product(
            db,
            ProductCreate(
                vendor_id=uuid.uuid4(),
                name="Ghost",
                slug="ghost-prod",
                base_price_pkr=100,
            ),
            user,
        )
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_create_product_slug_conflict(db: AsyncSession) -> None:
    user = await _user(db, UserRole.vendor)
    city = await CityRepository(db).create(name="D", slug=f"d-{uuid.uuid4().hex[:4]}", timezone="UTC")
    vendor = await VendorRepository(db).create(
        city_id=city.id, owner_user_id=user.id, name="V", slug=f"v-{uuid.uuid4().hex[:4]}"
    )
    slug = f"prod-{uuid.uuid4().hex[:4]}"
    await ProductRepository(db).create(
        vendor_id=vendor.id, name="First", slug=slug, base_price_pkr=1000
    )

    from fastapi import HTTPException
    with (
        patch("app.services.catalog_service.meilisearch_client.index_product", new_callable=AsyncMock),
        pytest.raises(HTTPException) as exc_info,
    ):
        await catalog_service.create_product(
            db,
            ProductCreate(vendor_id=vendor.id, name="Second", slug=slug, base_price_pkr=2000),
            user,
        )
    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
async def test_update_product_no_changes(db: AsyncSession) -> None:
    user = await _user(db, UserRole.vendor)
    city = await CityRepository(db).create(name="E", slug=f"e-{uuid.uuid4().hex[:4]}", timezone="UTC")
    vendor = await VendorRepository(db).create(
        city_id=city.id, owner_user_id=user.id, name="V2", slug=f"v2-{uuid.uuid4().hex[:4]}"
    )
    slug = f"pr2-{uuid.uuid4().hex[:4]}"
    await ProductRepository(db).create(
        vendor_id=vendor.id, name="P2", slug=slug, base_price_pkr=100
    )

    with patch("app.services.catalog_service.meilisearch_client.index_product", new_callable=AsyncMock):
        updated = await catalog_service.update_product(db, slug, ProductUpdate(), user)
    assert updated.slug == slug


@pytest.mark.asyncio
async def test_get_product_not_found(db: AsyncSession) -> None:
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        await catalog_service.get_product(db, "nonexistent")
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_list_products_pagination(db: AsyncSession) -> None:
    result = await catalog_service.list_products(db, page=1, page_size=5)
    assert result.page == 1
    assert result.page_size == 5
    assert isinstance(result.total, int)


@pytest.mark.asyncio
async def test_set_product_city_invalid_city(db: AsyncSession) -> None:
    user = await _user(db, UserRole.vendor)
    city = await CityRepository(db).create(name="F", slug=f"f-{uuid.uuid4().hex[:4]}", timezone="UTC")
    vendor = await VendorRepository(db).create(
        city_id=city.id, owner_user_id=user.id, name="V3", slug=f"v3-{uuid.uuid4().hex[:4]}"
    )
    slug = f"pr3-{uuid.uuid4().hex[:4]}"
    await ProductRepository(db).create(
        vendor_id=vendor.id, name="P3", slug=slug, base_price_pkr=100
    )

    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        await catalog_service.set_product_city_availability(
            db,
            slug,
            [ProductCityUpsert(city_id=uuid.uuid4(), delivery_fee_pkr=0, lead_time_hours=24)],
            user,
        )
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_add_and_remove_product_image(db: AsyncSession) -> None:
    user = await _user(db, UserRole.vendor)
    city = await CityRepository(db).create(name="G", slug=f"g-{uuid.uuid4().hex[:4]}", timezone="UTC")
    vendor = await VendorRepository(db).create(
        city_id=city.id, owner_user_id=user.id, name="V4", slug=f"v4-{uuid.uuid4().hex[:4]}"
    )
    slug = f"pr4-{uuid.uuid4().hex[:4]}"
    await ProductRepository(db).create(
        vendor_id=vendor.id, name="P4", slug=slug, base_price_pkr=100
    )

    image = await catalog_service.add_product_image(
        db, slug, "https://cdn.example.com/img.jpg", "A cake", False, user
    )
    assert image.url == "https://cdn.example.com/img.jpg"
    assert image.is_primary is True  # first image auto-set to primary

    await catalog_service.remove_product_image(db, slug, image.id, user)

    # Image gone — remove again raises 404
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        await catalog_service.remove_product_image(db, slug, image.id, user)
    assert exc_info.value.status_code == 404
