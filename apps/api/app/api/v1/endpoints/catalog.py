import uuid
from typing import Annotated

from fastapi import APIRouter, Form, Query, Response, UploadFile, status

from app.core.deps import DB, CurrentUser
from app.schemas.catalog import (
    CategoryCreate,
    CategoryRead,
    CategoryUpdate,
    CityCreate,
    CityRead,
    CityUpdate,
    FxRatesRead,
    OccasionCreate,
    OccasionRead,
    OccasionUpdate,
    PaginatedProducts,
    ProductCityUpsert,
    ProductCreate,
    ProductImageOrder,
    ProductImageRead,
    ProductOccasionsSet,
    ProductRead,
    ProductSort,
    ProductUpdate,
    ProductVariantUpdate,
    ProductVariantWrite,
    VendorCreate,
    VendorRead,
    VendorUpdate,
)
from app.services import catalog_service, fx_service

router = APIRouter(tags=["catalog"])

_CACHE_STATIC = "public, max-age=300, stale-while-revalidate=60"
_CACHE_PRODUCTS = "public, max-age=60, stale-while-revalidate=30"


# ── Cities ────────────────────────────────────────────────────────────────────

@router.get("/cities", response_model=list[CityRead])
async def list_cities(db: DB, response: Response) -> list[CityRead]:
    response.headers["Cache-Control"] = _CACHE_STATIC
    cities = await catalog_service.list_cities(db)
    return [CityRead.model_validate(c) for c in cities]


@router.get("/cities/{slug}", response_model=CityRead)
async def get_city(slug: str, db: DB, response: Response) -> CityRead:
    response.headers["Cache-Control"] = _CACHE_STATIC
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
    response: Response,
    city_id: uuid.UUID | None = Query(default=None),  # noqa: B008
) -> list[VendorRead]:
    response.headers["Cache-Control"] = _CACHE_STATIC
    vendors = await catalog_service.list_vendors(db, city_id=city_id)
    return [VendorRead.model_validate(v) for v in vendors]


@router.get("/vendors/{slug}", response_model=VendorRead)
async def get_vendor(slug: str, db: DB, response: Response) -> VendorRead:
    response.headers["Cache-Control"] = _CACHE_STATIC
    return VendorRead.model_validate(await catalog_service.get_vendor(db, slug))


@router.post("/vendors", response_model=VendorRead, status_code=status.HTTP_201_CREATED)
async def create_vendor(body: VendorCreate, db: DB, user: CurrentUser) -> VendorRead:
    return VendorRead.model_validate(await catalog_service.create_vendor(db, body, user))


@router.patch("/vendors/{slug}", response_model=VendorRead)
async def update_vendor(slug: str, body: VendorUpdate, db: DB, user: CurrentUser) -> VendorRead:
    return VendorRead.model_validate(await catalog_service.update_vendor(db, slug, body, user))


# ── Categories ────────────────────────────────────────────────────────────────

@router.get("/categories", response_model=list[CategoryRead])
async def list_categories(db: DB, response: Response) -> list[CategoryRead]:
    response.headers["Cache-Control"] = _CACHE_STATIC
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
    response: Response,
    city_id: uuid.UUID | None = Query(default=None),  # noqa: B008
    vendor_id: uuid.UUID | None = Query(default=None),  # noqa: B008
    category_id: uuid.UUID | None = Query(default=None),  # noqa: B008
    occasion_id: uuid.UUID | None = Query(default=None),  # noqa: B008
    page: int = Query(default=1, ge=1),  # noqa: B008
    page_size: int = Query(default=20, ge=1, le=100),  # noqa: B008
    sort: ProductSort = Query(  # noqa: B008
        default="recommended",
        description="recommended (A–Z), price_asc, price_desc or newest. "
        "Price uses the city's price when city_id is given.",
    ),
    min_price_pkr: int | None = Query(default=None, ge=0, description="Minimum price in paisa"),  # noqa: B008
    max_price_pkr: int | None = Query(default=None, ge=0, description="Maximum price in paisa"),  # noqa: B008
) -> PaginatedProducts:
    response.headers["Cache-Control"] = _CACHE_PRODUCTS
    return await catalog_service.list_products(
        db,
        city_id=city_id,
        vendor_id=vendor_id,
        category_id=category_id,
        occasion_id=occasion_id,
        page=page,
        page_size=page_size,
        sort=sort,
        min_price_pkr=min_price_pkr,
        max_price_pkr=max_price_pkr,
    )


@router.get("/products/{slug}", response_model=ProductRead)
async def get_product(slug: str, db: DB, response: Response) -> ProductRead:
    response.headers["Cache-Control"] = _CACHE_PRODUCTS
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


@router.post(
    "/products/{slug}/images/upload",
    response_model=ProductImageRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_product_image(
    slug: str,
    file: UploadFile,
    db: DB,
    user: CurrentUser,
    alt_text: Annotated[str | None, Form(max_length=255, examples=["Red roses bouquet"])] = None,
    is_primary: Annotated[bool, Form()] = False,
) -> ProductImageRead:
    """Upload a product photo (JPEG/PNG/WebP, max 10 MB). It is stored publicly and
    added to the product; the first photo becomes the main one."""
    image = await catalog_service.upload_product_image(db, slug, file, alt_text, is_primary, user)
    return ProductImageRead.model_validate(image)


@router.delete(
    "/products/{slug}/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def remove_product_image(
    slug: str, image_id: uuid.UUID, db: DB, user: CurrentUser
) -> None:
    await catalog_service.remove_product_image(db, slug, image_id, user)


@router.put(
    "/products/{slug}/images/order", response_model=ProductRead,
    responses={422: {"description": "The list must hold every photo of the product exactly once"}},
)
async def reorder_product_images(slug: str, body: ProductImageOrder, db: DB, user: CurrentUser) -> ProductRead:
    """Set the order photos appear in on the product page, first to last."""
    return ProductRead.model_validate(await catalog_service.reorder_product_images(db, slug, body.image_ids, user))


@router.post("/products/{slug}/images/{image_id}/primary", response_model=ProductRead)
async def set_primary_product_image(
    slug: str, image_id: uuid.UUID, db: DB, user: CurrentUser
) -> ProductRead:
    """Make this photo the main one shown on listings; the others stay as extra photos."""
    product = await catalog_service.set_primary_product_image(db, slug, image_id, user)
    return ProductRead.model_validate(product)


@router.put("/products/{slug}/occasions", response_model=ProductRead)
async def set_product_occasions(slug: str, body: ProductOccasionsSet, db: DB, user: CurrentUser) -> ProductRead:
    """Choose the occasion pages this product appears on. Send the full list; an empty list removes it from all."""
    return ProductRead.model_validate(await catalog_service.set_product_occasions(db, slug, body.occasion_ids, user))


@router.post(
    "/products/{slug}/variants", response_model=ProductRead, status_code=status.HTTP_201_CREATED,
    responses={409: {"description": "The product already has a size with that name"}},
)
async def add_product_variant(slug: str, body: ProductVariantWrite, db: DB, user: CurrentUser) -> ProductRead:
    """Add a size or option. Leave `stock_qty` out for made-to-order items; give a number to count stock."""
    return ProductRead.model_validate(await catalog_service.add_product_variant(db, slug, body, user))


@router.patch(
    "/products/{slug}/variants/{variant_id}", response_model=ProductRead,
    responses={409: {"description": "The product already has a size with that name"}},
)
async def update_product_variant(
    slug: str, variant_id: uuid.UUID, body: ProductVariantUpdate, db: DB, user: CurrentUser
) -> ProductRead:
    """Rename, reprice, restock or switch off a size. Sizes are never deleted: past orders point at them.
    Send `stock_qty: null` to stop counting stock."""
    return ProductRead.model_validate(await catalog_service.update_product_variant(db, slug, variant_id, body, user))


@router.put("/products/{slug}/cities", response_model=ProductRead)
async def set_product_cities(
    slug: str,
    body: list[ProductCityUpsert],
    db: DB,
    user: CurrentUser,
) -> ProductRead:
    product = await catalog_service.set_product_city_availability(db, slug, body, user)
    return ProductRead.model_validate(product)


# ── Occasions ─────────────────────────────────────────────────────────────────

@router.get("/occasions", response_model=list[OccasionRead])
async def list_occasions(db: DB, response: Response) -> list[OccasionRead]:
    response.headers["Cache-Control"] = _CACHE_STATIC
    occasions = await catalog_service.list_occasions(db)
    return [OccasionRead.model_validate(o) for o in occasions]


@router.get("/occasions/{slug}", response_model=OccasionRead)
async def get_occasion(slug: str, db: DB, response: Response) -> OccasionRead:
    response.headers["Cache-Control"] = _CACHE_STATIC
    return OccasionRead.model_validate(await catalog_service.get_occasion(db, slug))


@router.post("/occasions", response_model=OccasionRead, status_code=status.HTTP_201_CREATED)
async def create_occasion(body: OccasionCreate, db: DB, user: CurrentUser) -> OccasionRead:
    return OccasionRead.model_validate(await catalog_service.create_occasion(db, body, user))


@router.patch("/occasions/{slug}", response_model=OccasionRead)
async def update_occasion(slug: str, body: OccasionUpdate, db: DB, user: CurrentUser) -> OccasionRead:
    return OccasionRead.model_validate(await catalog_service.update_occasion(db, slug, body, user))


# ── Search ────────────────────────────────────────────────────────────────────

@router.get("/search", response_model=PaginatedProducts)
async def search(
    db: DB,
    q: str = Query(min_length=1, max_length=100),  # noqa: B008
    city_id: uuid.UUID | None = Query(default=None),  # noqa: B008
    limit: int = Query(default=20, ge=1, le=100),  # noqa: B008
) -> PaginatedProducts:
    """Full-text product search. Falls back to a database match if Meilisearch is down."""
    return await catalog_service.search_products(db, q, city_id=city_id, limit=limit)


@router.get("/fx-rates", response_model=FxRatesRead)
async def fx_rates(db: DB, response: Response) -> FxRatesRead:
    """Rates for display conversion. Only currencies with a known rate are listed."""
    response.headers["Cache-Control"] = "public, max-age=300"
    return FxRatesRead(rates=await fx_service.available_rates(db))
