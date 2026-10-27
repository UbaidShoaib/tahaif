import uuid
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import structlog
from fastapi import HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations import meilisearch_client, s3_client
from app.models.catalog import (
    Category,
    City,
    Occasion,
    Product,
    ProductImage,
    Vendor,
    VendorApprovalStatus,
)
from app.models.user import BACK_OFFICE_ROLES, User
from app.repositories.catalog_repository import (
    CategoryRepository,
    CityRepository,
    OccasionRepository,
    ProductRepository,
    VendorRepository,
)
from app.schemas.catalog import (
    AdminCategoryRead,
    AdminCityRead,
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
    ProductSort,
    ProductUpdate,
    ProductVariantUpdate,
    ProductVariantWrite,
    VendorCreate,
    VendorUpdate,
)
from app.services import audit_service

logger = structlog.get_logger()

def _NOT_FOUND(entity: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{entity} not found")


def _CONFLICT(entity: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"{entity} slug already exists")
_FORBIDDEN = HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your vendor")


def _is_staff(user: User) -> bool:
    return user.role in BACK_OFFICE_ROLES


def _STAFF_ONLY(detail: str = "Staff only") -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


def _require_staff(user: User) -> None:
    if not _is_staff(user):
        raise _STAFF_ONLY()


def _owns_vendor(user: User, vendor: Vendor) -> bool:
    return user.role in BACK_OFFICE_ROLES or vendor.owner_user_id == user.id


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
    city = await repo.create(**data.model_dump())
    await audit_service.record(db, user, "city.created", "city", city.id, after=data.model_dump())
    return city


async def update_city(db: AsyncSession, slug: str, data: CityUpdate, user: User) -> City:
    _require_staff(user)
    repo = CityRepository(db)
    city = await repo.get_by_slug(slug)
    if not city:
        raise _NOT_FOUND("City")
    updates = data.model_dump(exclude_none=True)
    if not updates:
        return city
    before = audit_service.snapshot(city, list(updates))
    city = await repo.update(city, **updates)
    await audit_service.record(db, user, "city.updated", "city", city.id, before=before, after=updates)
    return city


async def list_admin_cities(db: AsyncSession) -> list[AdminCityRead]:
    return [
        AdminCityRead(
            id=c.id, name=c.name, slug=c.slug, timezone=c.timezone, is_active=c.is_active,
            vendor_count=vendors, product_count=products, delivery_count=deliveries,
        )
        for c, vendors, products, deliveries in await CityRepository(db).list_with_usage()
    ]


async def delete_city(db: AsyncSession, city_id: uuid.UUID, user: User) -> None:
    """Only a city nothing uses can go; one with shops or deliveries is switched off instead,
    so past orders keep their address."""
    _require_staff(user)
    repo = CityRepository(db)
    city = await repo.get_by_id(city_id)
    if not city:
        raise _NOT_FOUND("City")
    [(_, vendors, products, deliveries)] = await repo.list_with_usage(city_id)
    if vendors or products or deliveries:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"{city.name} is still used by {vendors} shop(s), {products} product(s) and {deliveries} "
                "delivery(ies). Switch it off instead."
            ),
        )
    before = audit_service.snapshot(city, ["name", "slug", "timezone", "is_active"])
    await repo.delete(city)
    await audit_service.record(db, user, "city.deleted", "city", city_id, before=before)


# ── Vendors ───────────────────────────────────────────────────────────────────

async def list_vendors(
    db: AsyncSession, city_id: uuid.UUID | None = None
) -> list[Vendor]:
    return await VendorRepository(db).list(city_id=city_id)


async def get_vendor(db: AsyncSession, slug: str) -> Vendor:
    vendor = await VendorRepository(db).get_by_slug(slug)
    # A shop still under review (or turned down) has no public page.
    if not vendor or vendor.approval_status != VendorApprovalStatus.approved.value:
        raise _NOT_FOUND("Vendor")
    return vendor


async def create_vendor(db: AsyncSession, data: VendorCreate, user: User) -> Vendor:
    # Staff only: a shop opened by anyone else goes through the application
    # flow (vendor_application_service), where an admin approves it first.
    _require_staff(user)
    repo = VendorRepository(db)
    city_repo = CityRepository(db)

    if not await city_repo.get_by_id(data.city_id):
        raise _NOT_FOUND("City")
    if await repo.get_by_slug(data.slug):
        raise _CONFLICT("Vendor")

    return await repo.create(**data.model_dump())


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
    if "is_active" in updates and not _is_staff(user):
        # Opening or closing a shop is the approval decision; owners can't make it.
        raise _STAFF_ONLY("Only staff can open or close a shop")
    if not updates:
        return vendor
    return await repo.update(vendor, **updates)


# ── Categories ────────────────────────────────────────────────────────────────

async def list_categories(db: AsyncSession) -> list[Category]:
    return await CategoryRepository(db).list_roots()


async def _check_parent(
    repo: CategoryRepository, parent_id: uuid.UUID, category: Category | None = None
) -> None:
    """Categories go two levels deep, as the store menu shows them: a parent must be top-level."""
    parent = await repo.get_by_id(parent_id)
    if not parent:
        raise _NOT_FOUND("Parent category")
    if category and parent.id == category.id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="A category can't be its own parent")
    if parent.parent_id is not None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Pick a top-level category as the parent")
    if category and await repo.has_children(category.id):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="This category has subcategories, so it must stay top-level",
        )


async def create_category(
    db: AsyncSession, data: CategoryCreate, user: User
) -> Category:
    _require_staff(user)
    repo = CategoryRepository(db)
    if await repo.get_by_slug(data.slug):
        raise _CONFLICT("Category")
    if data.parent_id:
        await _check_parent(repo, data.parent_id)
    category = await repo.create(**data.model_dump())
    await audit_service.record(db, user, "category.created", "category", category.id, after=data.model_dump())
    return category


async def update_category(
    db: AsyncSession, slug: str, data: CategoryUpdate, user: User
) -> Category:
    _require_staff(user)
    repo = CategoryRepository(db)
    category = await repo.get_by_slug(slug)
    if not category:
        raise _NOT_FOUND("Category")
    updates = data.model_dump(exclude_none=True)
    # parent_id: null is meaningful (move to the top level), so honour it when sent.
    if "parent_id" in data.model_fields_set:
        updates["parent_id"] = data.parent_id
        if data.parent_id:
            await _check_parent(repo, data.parent_id, category)
    if not updates:
        return category
    before = audit_service.snapshot(category, list(updates))
    category = await repo.update(category, **updates)
    await audit_service.record(db, user, "category.updated", "category", category.id, before=before, after=updates)
    return category


async def list_admin_categories(db: AsyncSession) -> list[AdminCategoryRead]:
    return [
        AdminCategoryRead(
            id=c.id, parent_id=c.parent_id, name=c.name, slug=c.slug, sort_order=c.sort_order,
            is_active=c.is_active, product_count=products, child_count=children,
        )
        for c, products, children in await CategoryRepository(db).list_with_usage()
    ]


async def delete_category(db: AsyncSession, category_id: uuid.UUID, user: User) -> None:
    """Only an empty category can go; one with products or subcategories is switched off instead."""
    _require_staff(user)
    repo = CategoryRepository(db)
    category = await repo.get_by_id(category_id)
    if not category:
        raise _NOT_FOUND("Category")
    [(_, products, children)] = await repo.list_with_usage(category_id)
    if products or children:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"{category.name} still has {products} product(s) and {children} subcategory(ies). "
                "Move them or switch it off instead."
            ),
        )
    before = audit_service.snapshot(category, ["name", "slug", "parent_id", "is_active"])
    await repo.delete(category)
    await audit_service.record(db, user, "category.deleted", "category", category_id, before=before)


# ── Products ──────────────────────────────────────────────────────────────────

def _to_meili_doc(product: Product, vendor_name: str | None = None) -> dict[str, object]:
    return {
        "id": str(product.id),
        "name": product.name,
        "vendor_name": vendor_name or "",
        "slug": product.slug,
        "description": product.description or "",
        "vendor_id": str(product.vendor_id),
        "category_id": str(product.category_id) if product.category_id else None,
        "base_price_pkr": product.base_price_pkr,
        "city_ids": [str(pc.city_id) for pc in product.product_cities if pc.is_available],
        "is_active": product.is_active,
    }


# What a product edit can change, for the audit log.
_PRODUCT_FIELDS = ["name", "description", "base_price_pkr", "category_id", "is_active"]


async def list_products(
    db: AsyncSession,
    city_id: uuid.UUID | None = None,
    vendor_id: uuid.UUID | None = None,
    category_id: uuid.UUID | None = None,
    occasion_id: uuid.UUID | None = None,
    page: int = 1,
    page_size: int = 20,
    sort: ProductSort = "recommended",
    min_price_pkr: int | None = None,
    max_price_pkr: int | None = None,
    deliver_on: date | None = None,
    now: datetime | None = None,
) -> PaginatedProducts:
    if min_price_pkr is not None and max_price_pkr is not None and min_price_pkr > max_price_pkr:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="min_price_pkr must not be greater than max_price_pkr",
        )
    deliverable = None
    if deliver_on is not None:
        if city_id is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="deliver_on needs city_id",
            )
        city = await CityRepository(db).get_by_id(city_id)
        if city is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="City not found")
        deliverable = _deliverable_window(deliver_on, ZoneInfo(city.timezone), now or datetime.now(UTC))
    repo = ProductRepository(db)
    items, total = await repo.list(
        deliverable=deliverable,
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
    return PaginatedProducts(
        items=[ProductRead.model_validate(p) for p in items],
        total=total,
        page=page,
        page_size=page_size,
    )


def _deliverable_window(day: date, tz: ZoneInfo, now: datetime) -> tuple[time | None, float]:
    """Bounds for "can arrive on ``day``", mirroring the web's earliestDelivery.

    Same-day counts only when ``day`` is today in the city: the cutoff must be
    after the local time now. Otherwise a gift is ready ``lead_time_hours``
    from now and never before tomorrow, so it can arrive on ``day`` when the
    lead time ends before ``day`` is over.
    """
    local = now.astimezone(tz)
    today = local.date()
    same_day_before = local.time().replace(tzinfo=None) if day == today else None
    if day <= today:
        return same_day_before, -1.0
    end_of_day = datetime.combine(day + timedelta(days=1), time(), tzinfo=tz)
    return same_day_before, (end_of_day - now).total_seconds() / 3600


async def get_product(db: AsyncSession, slug: str) -> Product:
    """Public product lookup. Deactivated products, and those of a closed shop, are hidden like missing ones."""
    product = await ProductRepository(db).get_by_slug(slug)
    if not product or not product.is_active or not product.vendor.is_active:
        raise _NOT_FOUND("Product")
    return product


async def list_admin_products(
    db: AsyncSession,
    is_active: bool | None = None,
    q: str | None = None,
    vendor_id: uuid.UUID | None = None,
) -> list[Product]:
    """Admin list, hidden products included (vendor listings wait here to be published)."""
    return await ProductRepository(db).list_for_admin(is_active, q_text=q, vendor_id=vendor_id)


async def get_admin_product(db: AsyncSession, product_id: uuid.UUID) -> Product:
    """Admin lookup by id, occasions loaded. Unlike the public one, hidden products are returned so they can be edited."""
    product = await ProductRepository(db).get_with_occasions(product_id)
    if not product:
        raise _NOT_FOUND("Product")
    return product


async def set_product_active(db: AsyncSession, product_id: uuid.UUID, is_active: bool, actor: User) -> Product:
    """Admin toggle. Keeps the search index in step with the storefront."""
    repo = ProductRepository(db)
    product = await repo.get_by_id(product_id)
    if not product:
        raise _NOT_FOUND("Product")
    before = audit_service.snapshot(product, ["is_active"])
    product = await repo.update(product, is_active=is_active)
    await audit_service.record(
        db, actor, "product.published" if is_active else "product.hidden", "product", product_id,
        before=before, after={"is_active": is_active},
    )
    if is_active:
        refreshed = await repo.get_by_id(product_id)
        assert refreshed is not None
        await meilisearch_client.index_product(_to_meili_doc(refreshed, refreshed.vendor.name))
        return refreshed
    await meilisearch_client.delete_product(str(product_id))
    return product


async def search_products(
    db: AsyncSession, query: str, city_id: uuid.UUID | None = None, limit: int = 20
) -> PaginatedProducts:
    """Full-text search via Meilisearch, falling back to a database match.

    Results are always loaded from the database, so inactive products or stale
    index entries never reach the storefront.
    """
    repo = ProductRepository(db)
    try:
        ids, _estimate = await meilisearch_client.search_ids(query, city_id=city_id, limit=limit)
        products = await repo.get_active_by_ids(ids)
    except meilisearch_client.SearchUnavailable as exc:
        await logger.awarning("search_fallback_to_db", query=query, reason=str(exc))
        products = await repo.search_text(query, city_id=city_id, limit=limit)
    return PaginatedProducts(
        items=[ProductRead.model_validate(p) for p in products],
        total=len(products),
        page=1,
        page_size=limit,
    )


async def reindex_all_products(db: AsyncSession) -> int:
    """Configure the index and push every active product. Returns the count indexed."""
    products = await ProductRepository(db).list_all_active()
    settings_task = await meilisearch_client.configure_index()
    if settings_task is not None:
        await meilisearch_client.wait_for_task(settings_task)
    task = await meilisearch_client.index_products([_to_meili_doc(p, p.vendor.name) for p in products])
    if task is not None:
        await meilisearch_client.wait_for_task(task)
    return len(products)


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

    if _is_staff(user):
        product = await product_repo.create(**data.model_dump())
        await meilisearch_client.index_product(_to_meili_doc(product, vendor.name))
    else:
        # A vendor's own listing starts hidden; staff publish it from the admin panel
        # (docs/questions.md, "Vendor product approval").
        if not vendor.is_active:
            raise _STAFF_ONLY("Your shop has not been approved yet")
        product = await product_repo.create(**data.model_dump(), is_active=False)
    await audit_service.record(
        db, user, "product.created", "product", product.id,
        after={"slug": product.slug, **audit_service.snapshot(product, _PRODUCT_FIELDS)},
    )
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

    # An explicit null clears the category or description; required fields ignore it.
    updates = {
        k: v for k, v in data.model_dump(exclude_unset=True).items()
        if v is not None or k in ("category_id", "description")
    }
    if updates.get("is_active") and not product.is_active and not _is_staff(user):
        # Vendors may hide their own product, but publishing one is staff's call.
        raise _STAFF_ONLY("Only staff can publish a product")
    before = audit_service.snapshot(product, _PRODUCT_FIELDS)
    if updates:
        product = await repo.update(product, **updates)
    await audit_service.record(
        db, user, "product.updated", "product", product.id,
        before=before, after=audit_service.snapshot(product, _PRODUCT_FIELDS),
    )
    if product.is_active:
        await meilisearch_client.index_product(_to_meili_doc(product, vendor.name))
    else:
        await meilisearch_client.delete_product(str(product.id))
    return product


async def soft_delete_product(db: AsyncSession, slug: str, user: User) -> None:
    repo = ProductRepository(db)
    product = await repo.get_by_slug(slug)
    if not product:
        raise _NOT_FOUND("Product")

    vendor = await VendorRepository(db).get_by_id(product.vendor_id)
    if not vendor or not _owns_vendor(user, vendor):
        raise _FORBIDDEN

    before = audit_service.snapshot(product, ["is_active"])
    await repo.update(product, is_active=False)
    await audit_service.record(db, user, "product.hidden", "product", product.id, before=before, after={"is_active": False})
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

    image = await _attach_image(repo, product, url, alt_text, is_primary)
    await audit_service.record(db, user, "product.photo_added", "product", product.id, after={"url": image.url})
    return image


async def upload_product_image(
    db: AsyncSession,
    slug: str,
    file: UploadFile,
    alt_text: str | None,
    is_primary: bool,
    user: User,
) -> ProductImage:
    """Store an uploaded photo in object storage and attach it to the product."""
    repo = ProductRepository(db)
    product = await repo.get_by_slug(slug)
    if not product:
        raise _NOT_FOUND("Product")

    vendor = await VendorRepository(db).get_by_id(product.vendor_id)
    if not vendor or not _owns_vendor(user, vendor):
        raise _FORBIDDEN

    url = await s3_client.upload_product_image(str(product.id), await file.read(), file.content_type or "")
    image = await _attach_image(repo, product, url, alt_text, is_primary)
    await audit_service.record(db, user, "product.photo_added", "product", product.id, after={"url": image.url})
    return image


async def _attach_image(
    repo: ProductRepository, product: Product, url: str, alt_text: str | None, is_primary: bool
) -> ProductImage:
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
    was_primary = image.is_primary
    await audit_service.record(db, user, "product.photo_removed", "product", product.id, before={"url": image.url})
    await repo.delete_image(image)
    if was_primary:
        # Promote the next photo so the product never loses its main image.
        db.expire(product, ["images"])
        refreshed = await repo.get_by_id(product.id)
        if refreshed and refreshed.images:
            await repo.set_primary_image(product.id, refreshed.images[0].id)


async def set_primary_product_image(
    db: AsyncSession, slug: str, image_id: uuid.UUID, user: User
) -> Product:
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
    if not image.is_primary:
        await audit_service.record(db, user, "product.main_photo_changed", "product", product.id, after={"url": image.url})
    await repo.set_primary_image(product.id, image_id)
    db.expire(product, ["images"])
    updated = await repo.get_by_id(product.id)
    assert updated is not None
    if updated.is_active:
        await meilisearch_client.index_product(_to_meili_doc(updated, vendor.name))
    return updated


async def set_product_occasions(db: AsyncSession, slug: str, occasion_ids: list[uuid.UUID], user: User) -> Product:
    """Which occasion pages ("Mother's Day", "Eid") list this product. Replaces the whole set."""
    product, _vendor = await _owned_product(db, slug, user)
    wanted = list(dict.fromkeys(occasion_ids))
    occasions = await OccasionRepository(db).get_by_ids(wanted)
    if len(occasions) != len(wanted):
        raise _NOT_FOUND("Occasion")
    repo = ProductRepository(db)
    loaded = await repo.get_with_occasions(product.id)
    assert loaded is not None
    before = sorted(o.name for o in loaded.occasions)
    await repo.set_occasions(loaded, occasions)
    await audit_service.record(
        db, user, "product.occasions_changed", "product", product.id,
        before={"occasions": before}, after={"occasions": sorted(o.name for o in occasions)},
    )
    return loaded


_VARIANT_FIELDS = ["name", "price_delta_pkr", "stock_qty", "is_active"]


async def _owned_product(db: AsyncSession, slug: str, user: User) -> tuple[Product, Vendor]:
    product = await ProductRepository(db).get_by_slug(slug)
    if not product:
        raise _NOT_FOUND("Product")
    vendor = await VendorRepository(db).get_by_id(product.vendor_id)
    if not vendor or not _owns_vendor(user, vendor):
        raise _FORBIDDEN
    return product, vendor


def _check_variant_name(product: Product, name: str, skip: uuid.UUID | None = None) -> None:
    if any(v.name.strip().lower() == name.strip().lower() and v.id != skip for v in product.variants):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"This product already has a size called '{name}'")


async def add_product_variant(db: AsyncSession, slug: str, data: ProductVariantWrite, user: User) -> Product:
    """A size or option (e.g. "2 lb"). Its price is the base price plus `price_delta_pkr`."""
    product, _vendor = await _owned_product(db, slug, user)
    _check_variant_name(product, data.name)
    repo = ProductRepository(db)
    variant = await repo.add_variant(product.id, **data.model_dump() | {"name": data.name.strip()})
    await audit_service.record(
        db, user, "product.variant_added", "product", product.id,
        after=audit_service.snapshot(variant, _VARIANT_FIELDS),
    )
    db.expire(product, ["variants"])
    updated = await repo.get_by_id(product.id)
    assert updated is not None
    return updated


async def update_product_variant(
    db: AsyncSession, slug: str, variant_id: uuid.UUID, data: ProductVariantUpdate, user: User
) -> Product:
    """Change a size: rename, reprice, set or clear the stock count, switch on/off.
    An explicit `stock_qty: null` stops counting; leaving it out keeps the count."""
    product, _vendor = await _owned_product(db, slug, user)
    repo = ProductRepository(db)
    variant = await repo.get_variant(variant_id)
    if not variant or variant.product_id != product.id:
        raise _NOT_FOUND("Variant")
    updates = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None or k == "stock_qty"}
    if "name" in updates:
        updates["name"] = updates["name"].strip()
        _check_variant_name(product, updates["name"], skip=variant.id)
    before = audit_service.snapshot(variant, _VARIANT_FIELDS)
    await repo.update_variant(variant, **updates)
    await audit_service.record(
        db, user, "product.variant_updated", "product", product.id,
        before=before, after=audit_service.snapshot(variant, _VARIANT_FIELDS), context={"variant": variant.name},
    )
    db.expire(product, ["variants"])
    updated = await repo.get_by_id(product.id)
    assert updated is not None
    return updated


async def reorder_product_images(db: AsyncSession, slug: str, image_ids: list[uuid.UUID], user: User) -> Product:
    """Put the photos in this order on the product page. The main photo is chosen separately."""
    product, vendor = await _owned_product(db, slug, user)
    current = [i.id for i in product.images]  # already in sort order
    if sorted(map(str, image_ids)) != sorted(map(str, current)) or len(set(image_ids)) != len(image_ids):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Send every photo of this product exactly once",
        )
    repo = ProductRepository(db)
    await repo.reorder_images(product.id, image_ids)
    await audit_service.record(
        db, user, "product.photos_reordered", "product", product.id,
        before={"order": [str(i) for i in current]}, after={"order": [str(i) for i in image_ids]},
    )
    db.expire(product, ["images"])
    updated = await repo.get_by_id(product.id)
    assert updated is not None
    if updated.is_active:
        await meilisearch_client.index_product(_to_meili_doc(updated, vendor.name))
    return updated


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

    def cities_snapshot(p: Product) -> dict[str, object]:
        return {
            str(pc.city_id): audit_service.snapshot(
                pc, ["is_available", "price_override_pkr", "delivery_fee_pkr", "lead_time_hours", "same_day_cutoff"]
            )
            for pc in p.product_cities
        }

    before = cities_snapshot(product)
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
    await audit_service.record(
        db, user, "product.cities_changed", "product", product.id, before=before, after=cities_snapshot(updated)
    )
    await meilisearch_client.index_product(_to_meili_doc(updated, vendor.name))
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
