import uuid

from fastapi import APIRouter, Query, status

from app.core.deps import DB, CurrentUser
from app.integrations import meilisearch_client
from app.schemas.catalog import (
    CategoryCreate,
    CategoryRead,
    CategoryUpdate,
    CityCreate,
    CityRead,
    CityUpdate,
    PaginatedProducts,
    ProductCityUpsert,
    ProductCreate,
    ProductImageRead,
    ProductRead,
    ProductUpdate,
    VendorCreate,
    VendorRead,
    VendorUpdate,
)
from app.services import catalog_service

router = APIRouter(tags=["catalog"])


# ── Cities ────────────────────────────────────────────────────────────────────

@router.get("/cities", response_model=list[CityRead])
async def list_cities(db: DB) -> list[CityRead]:
    cities = await catalog_service.list_cities(db)
    return [CityRead.model_validate(c) for c in cities]


@router.get("/cities/{slug}", response_model=CityRead)
async def get_city(slug: str, db: DB) -> CityRead:
    return CityRead.model_validate(await catalog_service.get_city(db, slug))


@router.post("/cities", response_model=CityRead, status_code=status.HTTP_201_CREATED)
async def create_city(body: CityCreate, db: DB, user: CurrentUser) -> CityRead:
    return CityRead.model_validate(await catalog_service.create_city(db, body, user))


@router.patch("/cities/{slug}", response_model=CityRead)
async def update_city(slug: str, body: CityUpdate, db: DB, user: CurrentUser) -> CityRead:
    return CityRead.model_validate(await catalog_service.update_city(db, slug, body, user))


# ── Vendors ───────────────────────────────────────────────────────────────────

@router.get("/vendors", response_model=list[VendorRead])
async def list_vendors(
    db: DB,
    city_id: uuid.UUID | None = Query(default=None),  # noqa: B008
) -> list[VendorRead]:
    vendors = await catalog_service.list_vendors(db, city_id=city_id)
    return [VendorRead.model_validate(v) for v in vendors]


@router.get("/vendors/{slug}", response_model=VendorRead)
async def get_vendor(slug: str, db: DB) -> VendorRead:
    return VendorRead.model_validate(await catalog_service.get_vendor(db, slug))


@router.post("/vendors", response_model=VendorRead, status_code=status.HTTP_201_CREATED)
async def create_vendor(body: VendorCreate, db: DB, user: CurrentUser) -> VendorRead:
    return VendorRead.model_validate(await catalog_service.create_vendor(db, body, user))


@router.patch("/vendors/{slug}", response_model=VendorRead)
async def update_vendor(slug: str, body: VendorUpdate, db: DB, user: CurrentUser) -> VendorRead:
    return VendorRead.model_validate(await catalog_service.update_vendor(db, slug, body, user))


# ── Categories ────────────────────────────────────────────────────────────────

@router.get("/categories", response_model=list[CategoryRead])
async def list_categories(db: DB) -> list[CategoryRead]:
    cats = await catalog_service.list_categories(db)
    return [CategoryRead.model_validate(c) for c in cats]


@router.post("/categories", response_model=CategoryRead, status_code=status.HTTP_201_CREATED)
async def create_category(body: CategoryCreate, db: DB, user: CurrentUser) -> CategoryRead:
    return CategoryRead.model_validate(await catalog_service.create_category(db, body, user))


@router.patch("/categories/{slug}", response_model=CategoryRead)
async def update_category(
    slug: str, body: CategoryUpdate, db: DB, user: CurrentUser
) -> CategoryRead:
    return CategoryRead.model_validate(
        await catalog_service.update_category(db, slug, body, user)
    )


# ── Products ──────────────────────────────────────────────────────────────────

@router.get("/products", response_model=PaginatedProducts)
async def list_products(
    db: DB,
    city_id: uuid.UUID | None = Query(default=None),  # noqa: B008
    vendor_id: uuid.UUID | None = Query(default=None),  # noqa: B008
    category_id: uuid.UUID | None = Query(default=None),  # noqa: B008
    page: int = Query(default=1, ge=1),  # noqa: B008
    page_size: int = Query(default=20, ge=1, le=100),  # noqa: B008
) -> PaginatedProducts:
    return await catalog_service.list_products(
        db,
        city_id=city_id,
        vendor_id=vendor_id,
        category_id=category_id,
        page=page,
        page_size=page_size,
    )


@router.get("/products/{slug}", response_model=ProductRead)
async def get_product(slug: str, db: DB) -> ProductRead:
    return ProductRead.model_validate(await catalog_service.get_product(db, slug))


@router.post("/products", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
async def create_product(body: ProductCreate, db: DB, user: CurrentUser) -> ProductRead:
    return ProductRead.model_validate(await catalog_service.create_product(db, body, user))


@router.patch("/products/{slug}", response_model=ProductRead)
async def update_product(slug: str, body: ProductUpdate, db: DB, user: CurrentUser) -> ProductRead:
    return ProductRead.model_validate(await catalog_service.update_product(db, slug, body, user))


@router.delete("/products/{slug}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(slug: str, db: DB, user: CurrentUser) -> None:
    await catalog_service.soft_delete_product(db, slug, user)


@router.post(
    "/products/{slug}/images",
    response_model=ProductImageRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_product_image(
    slug: str,
    db: DB,
    user: CurrentUser,
    url: str = Query(),  # noqa: B008
    alt_text: str | None = Query(default=None),  # noqa: B008
    is_primary: bool = Query(default=False),  # noqa: B008
) -> ProductImageRead:
    image = await catalog_service.add_product_image(db, slug, url, alt_text, is_primary, user)
    return ProductImageRead.model_validate(image)


@router.delete(
    "/products/{slug}/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def remove_product_image(
    slug: str, image_id: uuid.UUID, db: DB, user: CurrentUser
) -> None:
    await catalog_service.remove_product_image(db, slug, image_id, user)


@router.put("/products/{slug}/cities", response_model=ProductRead)
async def set_product_cities(
    slug: str,
    body: list[ProductCityUpsert],
    db: DB,
    user: CurrentUser,
) -> ProductRead:
    product = await catalog_service.set_product_city_availability(db, slug, body, user)
    return ProductRead.model_validate(product)


# ── Search ────────────────────────────────────────────────────────────────────

@router.get("/search")
async def search(
    q: str = Query(min_length=1),  # noqa: B008
    city_id: uuid.UUID | None = Query(default=None),  # noqa: B008
    limit: int = Query(default=20, ge=1, le=100),  # noqa: B008
) -> dict[str, object]:
    filters = f"city_ids = {city_id}" if city_id else None
    return await meilisearch_client.search(q, filters=filters, limit=limit)
