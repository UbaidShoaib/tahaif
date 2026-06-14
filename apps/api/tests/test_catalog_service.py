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
    OccasionCreate,
    OccasionUpdate,
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
async def test_get_city_success(db: AsyncSession) -> None:
    await _user(db, UserRole.staff)
    slug = f"khi-{uuid.uuid4().hex[:4]}"
    await CityRepository(db).create(name="KHI", slug=slug, timezone="Asia/Karachi")
    city = await catalog_service.get_city(db, slug)
    assert city.slug == slug


@pytest.mark.asyncio
async def test_update_city_with_changes(db: AsyncSession) -> None:
    staff = await _user(db, UserRole.staff)
    slug = f"lhe-{uuid.uuid4().hex[:4]}"
    await CityRepository(db).create(name="Lahore", slug=slug, timezone="Asia/Karachi")
    updated = await catalog_service.update_city(db, slug, CityUpdate(is_active=False), staff)
    assert updated.is_active is False


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
async def test_create_vendor_success(db: AsyncSession) -> None:
    user = await _user(db, UserRole.vendor)
    city = await CityRepository(db).create(name="C0", slug=f"c0-{uuid.uuid4().hex[:4]}", timezone="UTC")
    slug = f"v0-{uuid.uuid4().hex[:4]}"
    vendor = await catalog_service.create_vendor(
        db, VendorCreate(city_id=city.id, name="V0", slug=slug), user
    )
    assert vendor.slug == slug
    assert vendor.owner_user_id == user.id


@pytest.mark.asyncio
async def test_get_vendor_success(db: AsyncSession) -> None:
    city = await CityRepository(db).create(name="C1", slug=f"c1-{uuid.uuid4().hex[:4]}", timezone="UTC")
    slug = f"v1-{uuid.uuid4().hex[:4]}"
    await VendorRepository(db).create(city_id=city.id, name="V1", slug=slug)
    vendor = await catalog_service.get_vendor(db, slug)
    assert vendor.slug == slug


@pytest.mark.asyncio
async def test_update_vendor_with_changes(db: AsyncSession) -> None:
    user = await _user(db, UserRole.vendor)
    city = await CityRepository(db).create(name="C1b", slug=f"c1b-{uuid.uuid4().hex[:4]}", timezone="UTC")
    slug = f"v1b-{uuid.uuid4().hex[:4]}"
    await VendorRepository(db).create(city_id=city.id, owner_user_id=user.id, name="V1b", slug=slug)
    updated = await catalog_service.update_vendor(db, slug, VendorUpdate(name="Updated"), user)
    assert updated.name == "Updated"


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
async def test_create_category_success(db: AsyncSession) -> None:
    staff = await _user(db, UserRole.staff)
    slug = f"flowers-{uuid.uuid4().hex[:4]}"
    cat = await catalog_service.create_category(
        db, CategoryCreate(name="Flowers", slug=slug), staff
    )
    assert cat.slug == slug


@pytest.mark.asyncio
async def test_list_categories_returns_roots(db: AsyncSession) -> None:
    staff = await _user(db, UserRole.staff)
    slug = f"mithai-{uuid.uuid4().hex[:4]}"
    await catalog_service.create_category(db, CategoryCreate(name="Mithai", slug=slug), staff)
    cats = await catalog_service.list_categories(db)
    assert any(c.slug == slug for c in cats)


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
async def test_create_and_get_product_success(db: AsyncSession) -> None:
    user = await _user(db, UserRole.vendor)
    city = await CityRepository(db).create(name="H", slug=f"h-{uuid.uuid4().hex[:4]}", timezone="UTC")
    vendor = await VendorRepository(db).create(
        city_id=city.id, owner_user_id=user.id, name="VH", slug=f"vh-{uuid.uuid4().hex[:4]}"
    )
    slug = f"prh-{uuid.uuid4().hex[:4]}"
    with patch("app.services.catalog_service.meilisearch_client.index_product", new_callable=AsyncMock):
        product = await catalog_service.create_product(
            db,
            ProductCreate(vendor_id=vendor.id, name="H Product", slug=slug, base_price_pkr=100),
            user,
        )
    assert product.slug == slug

    fetched = await catalog_service.get_product(db, slug)
    assert fetched.id == product.id


@pytest.mark.asyncio
async def test_update_product_with_changes(db: AsyncSession) -> None:
    user = await _user(db, UserRole.vendor)
    city = await CityRepository(db).create(name="I", slug=f"i-{uuid.uuid4().hex[:4]}", timezone="UTC")
    vendor = await VendorRepository(db).create(
        city_id=city.id, owner_user_id=user.id, name="VI", slug=f"vi-{uuid.uuid4().hex[:4]}"
    )
    slug = f"pri-{uuid.uuid4().hex[:4]}"
    await ProductRepository(db).create(vendor_id=vendor.id, name="I Prod", slug=slug, base_price_pkr=100)
    with patch("app.services.catalog_service.meilisearch_client.index_product", new_callable=AsyncMock):
        updated = await catalog_service.update_product(db, slug, ProductUpdate(base_price_pkr=200), user)
    assert updated.base_price_pkr == 200


@pytest.mark.asyncio
async def test_soft_delete_product_success(db: AsyncSession) -> None:
    user = await _user(db, UserRole.vendor)
    city = await CityRepository(db).create(name="J", slug=f"j-{uuid.uuid4().hex[:4]}", timezone="UTC")
    vendor = await VendorRepository(db).create(
        city_id=city.id, owner_user_id=user.id, name="VJ", slug=f"vj-{uuid.uuid4().hex[:4]}"
    )
    slug = f"prj-{uuid.uuid4().hex[:4]}"
    await ProductRepository(db).create(vendor_id=vendor.id, name="J Prod", slug=slug, base_price_pkr=100)
    with patch("app.services.catalog_service.meilisearch_client.delete_product", new_callable=AsyncMock):
        await catalog_service.soft_delete_product(db, slug, user)
    result = await catalog_service.list_products(db)
    assert all(p.slug != slug for p in result.items)


@pytest.mark.asyncio
async def test_set_product_city_availability_success(db: AsyncSession) -> None:
    user = await _user(db, UserRole.vendor)
    city = await CityRepository(db).create(name="K", slug=f"k-{uuid.uuid4().hex[:4]}", timezone="UTC")
    vendor = await VendorRepository(db).create(
        city_id=city.id, owner_user_id=user.id, name="VK", slug=f"vk-{uuid.uuid4().hex[:4]}"
    )
    slug = f"prk-{uuid.uuid4().hex[:4]}"
    await ProductRepository(db).create(vendor_id=vendor.id, name="K Prod", slug=slug, base_price_pkr=100)
    with patch("app.services.catalog_service.meilisearch_client.index_product", new_callable=AsyncMock):
        product = await catalog_service.set_product_city_availability(
            db,
            slug,
            [ProductCityUpsert(city_id=city.id, delivery_fee_pkr=15000, lead_time_hours=6)],
            user,
        )
    assert len(product.product_cities) == 1
    assert product.product_cities[0].delivery_fee_pkr == 15000


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


# ── Occasion service ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_occasion_success(db: AsyncSession) -> None:
    staff = await _user(db, UserRole.staff)
    slug = f"eid-{uuid.uuid4().hex[:4]}"
    occasion = await catalog_service.create_occasion(
        db, OccasionCreate(name="Eid", slug=slug, sort_order=1), staff
    )
    assert occasion.slug == slug
    assert occasion.name == "Eid"


@pytest.mark.asyncio
async def test_create_occasion_conflict(db: AsyncSession) -> None:
    staff = await _user(db, UserRole.staff)
    slug = f"bday-{uuid.uuid4().hex[:4]}"
    await catalog_service.create_occasion(db, OccasionCreate(name="Birthday", slug=slug), staff)

    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        await catalog_service.create_occasion(db, OccasionCreate(name="Birthday2", slug=slug), staff)
    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
async def test_create_occasion_forbidden_for_customer(db: AsyncSession) -> None:
    customer = await _user(db, UserRole.customer)
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        await catalog_service.create_occasion(
            db, OccasionCreate(name="X", slug="x-slug"), customer
        )
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_get_occasion_not_found(db: AsyncSession) -> None:
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        await catalog_service.get_occasion(db, "nonexistent-slug")
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_update_occasion_no_changes(db: AsyncSession) -> None:
    staff = await _user(db, UserRole.staff)
    slug = f"anniv-{uuid.uuid4().hex[:4]}"
    await catalog_service.create_occasion(db, OccasionCreate(name="Anniversary", slug=slug), staff)
    updated = await catalog_service.update_occasion(db, slug, OccasionUpdate(), staff)
    assert updated.slug == slug


@pytest.mark.asyncio
async def test_update_occasion_not_found(db: AsyncSession) -> None:
    staff = await _user(db, UserRole.staff)
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        await catalog_service.update_occasion(db, "ghost-occasion", OccasionUpdate(), staff)
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_list_occasions(db: AsyncSession) -> None:
    staff = await _user(db, UserRole.staff)
    slug = f"wed-{uuid.uuid4().hex[:4]}"
    await catalog_service.create_occasion(db, OccasionCreate(name="Wedding", slug=slug), staff)
    occasions = await catalog_service.list_occasions(db)
    assert any(o.slug == slug for o in occasions)


@pytest.mark.asyncio
async def test_list_products_with_occasion_filter(db: AsyncSession) -> None:
    staff = await _user(db, UserRole.staff)
    vendor_user = await _user(db, UserRole.vendor)
    city = await CityRepository(db).create(name="Occ City", slug=f"occ-{uuid.uuid4().hex[:4]}", timezone="UTC")
    vendor = await VendorRepository(db).create(
        city_id=city.id, owner_user_id=vendor_user.id, name="OV", slug=f"ov-{uuid.uuid4().hex[:4]}"
    )

    occ_slug = f"occ-ev-{uuid.uuid4().hex[:4]}"
    occasion = await catalog_service.create_occasion(
        db, OccasionCreate(name="Occ Event", slug=occ_slug), staff
    )

    from sqlalchemy import insert

    from app.models.catalog import product_occasions_table

    p_slug = f"occ-prod-{uuid.uuid4().hex[:4]}"
    product = await ProductRepository(db).create(
        vendor_id=vendor.id, name="Occ Product", slug=p_slug, base_price_pkr=100
    )
    await db.execute(
        insert(product_occasions_table).values(product_id=product.id, occasion_id=occasion.id)
    )
    await db.flush()

    result = await catalog_service.list_products(db, occasion_id=occasion.id)
    slugs = [p.slug for p in result.items]
    assert p_slug in slugs
