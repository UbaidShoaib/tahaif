import uuid

import structlog
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations import meilisearch_client
from app.models.catalog import Category, City, Occasion, Product, ProductImage, Vendor
from app.models.user import User, UserRole
from app.repositories.catalog_repository import (
    CategoryRepository,
    CityRepository,
    OccasionRepository,
    ProductRepository,
    VendorRepository,
)
from app.schemas.catalog import (
    CategoryCreate,
    CategoryUpdate,
    CityCreate,
    CityUpdate,
    OccasionCreate,
    OccasionUpdate,
    PaginatedProducts,
    ProductCityUpsert,
    ProductCreate,
    ProductRead,
    ProductUpdate,
    VendorCreate,
    VendorUpdate,
)

logger = structlog.get_logger()

def _NOT_FOUND(entity: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{entity} not found")


def _CONFLICT(entity: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"{entity} slug already exists")
_FORBIDDEN = HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your vendor")


def _require_staff(user: User) -> None:
    if user.role not in (UserRole.staff, UserRole.admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Staff only")


def _owns_vendor(user: User, vendor: Vendor) -> bool:
    return user.role in (UserRole.staff, UserRole.admin) or vendor.owner_user_id == user.id


# ── Cities ────────────────────────────────────────────────────────────────────

async def list_cities(db: AsyncSession) -> list[City]:
    return await CityRepository(db).list_active()


async def get_city(db: AsyncSession, slug: str) -> City:
    city = await CityRepository(db).get_by_slug(slug)
    if not city:
        raise _NOT_FOUND("City")
    return city


async def create_city(db: AsyncSession, data: CityCreate, user: User) -> City:
    _require_staff(user)
    repo = CityRepository(db)
    if await repo.get_by_slug(data.slug):
        raise _CONFLICT("City")
    return await repo.create(**data.model_dump())


async def update_city(db: AsyncSession, slug: str, data: CityUpdate, user: User) -> City:
    _require_staff(user)
    repo = CityRepository(db)
    city = await repo.get_by_slug(slug)
    if not city:
        raise _NOT_FOUND("City")
    updates = data.model_dump(exclude_none=True)
    if not updates:
        return city
    return await repo.update(city, **updates)


# ── Vendors ───────────────────────────────────────────────────────────────────

async def list_vendors(
    db: AsyncSession, city_id: uuid.UUID | None = None
) -> list[Vendor]:
    return await VendorRepository(db).list(city_id=city_id)


async def get_vendor(db: AsyncSession, slug: str) -> Vendor:
    vendor = await VendorRepository(db).get_by_slug(slug)
    if not vendor:
        raise _NOT_FOUND("Vendor")
    return vendor


async def create_vendor(db: AsyncSession, data: VendorCreate, user: User) -> Vendor:
    repo = VendorRepository(db)
    city_repo = CityRepository(db)

    if not await city_repo.get_by_id(data.city_id):
        raise _NOT_FOUND("City")
    if await repo.get_by_slug(data.slug):
        raise _CONFLICT("Vendor")

    return await repo.create(owner_user_id=user.id, **data.model_dump())


async def update_vendor(
    db: AsyncSession, slug: str, data: VendorUpdate, user: User
) -> Vendor:
    repo = VendorRepository(db)
    vendor = await repo.get_by_slug(slug)
    if not vendor:
        raise _NOT_FOUND("Vendor")
    if not _owns_vendor(user, vendor):
        raise _FORBIDDEN

    updates = data.model_dump(exclude_none=True)
    if not updates:
        return vendor
    return await repo.update(vendor, **updates)


# ── Categories ────────────────────────────────────────────────────────────────

async def list_categories(db: AsyncSession) -> list[Category]:
    return await CategoryRepository(db).list_roots()


async def create_category(
    db: AsyncSession, data: CategoryCreate, user: User
) -> Category:
    _require_staff(user)
    repo = CategoryRepository(db)
    if await repo.get_by_slug(data.slug):
        raise _CONFLICT("Category")
    if data.parent_id and not await repo.get_by_id(data.parent_id):
        raise _NOT_FOUND("Parent category")
    return await repo.create(**data.model_dump())


async def update_category(
    db: AsyncSession, slug: str, data: CategoryUpdate, user: User
) -> Category:
    _require_staff(user)
    repo = CategoryRepository(db)
    category = await repo.get_by_slug(slug)
    if not category:
        raise _NOT_FOUND("Category")
    updates = data.model_dump(exclude_none=True)
    if not updates:
        return category
    return await repo.update(category, **updates)


# ── Products ──────────────────────────────────────────────────────────────────

def _to_meili_doc(product: Product) -> dict[str, object]:
    return {
        "id": str(product.id),
        "name": product.name,
        "slug": product.slug,
        "description": product.description or "",
        "vendor_id": str(product.vendor_id),
        "category_id": str(product.category_id) if product.category_id else None,
        "base_price_pkr": product.base_price_pkr,
        "city_ids": [str(pc.city_id) for pc in product.product_cities if pc.is_available],
        "is_active": product.is_active,
    }


async def list_products(
    db: AsyncSession,
    city_id: uuid.UUID | None = None,
    vendor_id: uuid.UUID | None = None,
    category_id: uuid.UUID | None = None,
    occasion_id: uuid.UUID | None = None,
    page: int = 1,
    page_size: int = 20,
) -> PaginatedProducts:
    repo = ProductRepository(db)
    items, total = await repo.list(
        city_id=city_id,
        vendor_id=vendor_id,
        category_id=category_id,
        occasion_id=occasion_id,
        page=page,
        page_size=page_size,
    )
    return PaginatedProducts(
        items=[ProductRead.model_validate(p) for p in items],
        total=total,
        page=page,
        page_size=page_size,
    )


async def get_product(db: AsyncSession, slug: str) -> Product:
    product = await ProductRepository(db).get_by_slug(slug)
    if not product:
        raise _NOT_FOUND("Product")
    return product


async def create_product(db: AsyncSession, data: ProductCreate, user: User) -> Product:
    vendor_repo = VendorRepository(db)
    product_repo = ProductRepository(db)

    vendor = await vendor_repo.get_by_id(data.vendor_id)
    if not vendor:
        raise _NOT_FOUND("Vendor")
    if not _owns_vendor(user, vendor):
        raise _FORBIDDEN
    if await product_repo.get_by_slug(data.slug):
        raise _CONFLICT("Product")

    product = await product_repo.create(**data.model_dump())
    await meilisearch_client.index_product(_to_meili_doc(product))
    return product


async def update_product(
    db: AsyncSession, slug: str, data: ProductUpdate, user: User
) -> Product:
    repo = ProductRepository(db)
    product = await repo.get_by_slug(slug)
    if not product:
        raise _NOT_FOUND("Product")

    vendor = await VendorRepository(db).get_by_id(product.vendor_id)
    if not vendor or not _owns_vendor(user, vendor):
        raise _FORBIDDEN

    updates = data.model_dump(exclude_none=True)
    if updates:
        product = await repo.update(product, **updates)
    await meilisearch_client.index_product(_to_meili_doc(product))
    return product


async def soft_delete_product(db: AsyncSession, slug: str, user: User) -> None:
    repo = ProductRepository(db)
    product = await repo.get_by_slug(slug)
    if not product:
        raise _NOT_FOUND("Product")

    vendor = await VendorRepository(db).get_by_id(product.vendor_id)
    if not vendor or not _owns_vendor(user, vendor):
        raise _FORBIDDEN

    await repo.update(product, is_active=False)
    await meilisearch_client.delete_product(str(product.id))


async def add_product_image(
    db: AsyncSession,
    slug: str,
    url: str,
    alt_text: str | None,
    is_primary: bool,
    user: User,
) -> ProductImage:
    repo = ProductRepository(db)
    product = await repo.get_by_slug(slug)
    if not product:
        raise _NOT_FOUND("Product")

    vendor = await VendorRepository(db).get_by_id(product.vendor_id)
    if not vendor or not _owns_vendor(user, vendor):
        raise _FORBIDDEN

    sort_order = len(product.images)
    return await repo.add_image(
        product.id,
        url=url,
        alt_text=alt_text,
        sort_order=sort_order,
        is_primary=is_primary or sort_order == 0,
    )


async def remove_product_image(
    db: AsyncSession, slug: str, image_id: uuid.UUID, user: User
) -> None:
    repo = ProductRepository(db)
    product = await repo.get_by_slug(slug)
    if not product:
        raise _NOT_FOUND("Product")

    vendor = await VendorRepository(db).get_by_id(product.vendor_id)
    if not vendor or not _owns_vendor(user, vendor):
        raise _FORBIDDEN

    image = await repo.get_image(image_id)
    if not image or image.product_id != product.id:
        raise _NOT_FOUND("Image")
    await repo.delete_image(image)


async def set_product_city_availability(
    db: AsyncSession, slug: str, entries: list[ProductCityUpsert], user: User
) -> Product:
    repo = ProductRepository(db)
    product = await repo.get_by_slug(slug)
    if not product:
        raise _NOT_FOUND("Product")

    vendor = await VendorRepository(db).get_by_id(product.vendor_id)
    if not vendor or not _owns_vendor(user, vendor):
        raise _FORBIDDEN

    city_repo = CityRepository(db)
    for entry in entries:
        if not await city_repo.get_by_id(entry.city_id):
            raise _NOT_FOUND(f"City {entry.city_id}")
        kwargs = entry.model_dump(exclude={"city_id"})
        await repo.upsert_city_availability(product.id, entry.city_id, **kwargs)

    # Expire only the relationship so selectinload re-fetches the new city rows
    db.expire(product, ["product_cities"])
    updated = await repo.get_by_id(product.id)
    assert updated is not None
    await meilisearch_client.index_product(_to_meili_doc(updated))
    return updated


# ── Occasions ─────────────────────────────────────────────────────────────────

async def list_occasions(db: AsyncSession) -> list[Occasion]:
    return await OccasionRepository(db).list_active()


async def get_occasion(db: AsyncSession, slug: str) -> Occasion:
    occasion = await OccasionRepository(db).get_by_slug(slug)
    if not occasion:
        raise _NOT_FOUND("Occasion")
    return occasion


async def create_occasion(db: AsyncSession, data: OccasionCreate, user: User) -> Occasion:
    _require_staff(user)
    repo = OccasionRepository(db)
    if await repo.get_by_slug(data.slug):
        raise _CONFLICT("Occasion")
    return await repo.create(**data.model_dump())


async def update_occasion(
    db: AsyncSession, slug: str, data: OccasionUpdate, user: User
) -> Occasion:
    _require_staff(user)
    repo = OccasionRepository(db)
    occasion = await repo.get_by_slug(slug)
    if not occasion:
        raise _NOT_FOUND("Occasion")
    updates = data.model_dump(exclude_none=True)
    if not updates:
        return occasion
    return await repo.update(occasion, **updates)
