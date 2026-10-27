"""Setting up build-your-own builders from the admin (ADR 0014).

A builder is an ordinary product with ``builder_kind`` set, plus the list of
products buyers may put in it. Items must come from the builder's own vendor, so
every bucket is one delivery. Every change is recorded in the audit log.
"""

import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bucket import BuilderComponent
from app.models.catalog import Product
from app.models.user import User
from app.repositories.bucket_repository import BuilderRepository
from app.schemas.bucket import (
    AdminBuilderComponentRead,
    AdminBuilderConfig,
    AdminBuilderSummary,
    BuilderComponentCreate,
    BuilderComponentUpdate,
    BuilderSettingsUpdate,
    BuilderSummary,
)
from app.services import audit_service


def _not_found(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


def _conflict(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


def _image(product: Product) -> str | None:
    primary = next((img for img in product.images if img.is_primary), None)
    chosen = primary or (product.images[0] if product.images else None)
    return chosen.url if chosen else None


def _component_read(c: BuilderComponent) -> AdminBuilderComponentRead:
    return AdminBuilderComponentRead(
        id=c.id,
        component_product_id=c.component_product_id,
        name=c.component.name,
        slug=c.component.slug,
        image=_image(c.component),
        price_pkr=c.component.base_price_pkr,
        product_is_active=c.component.is_active,
        role=c.role,
        max_qty=c.max_qty,
        sort_order=c.sort_order,
        is_active=c.is_active,
    )


async def _base(repo: BuilderRepository, product_id: uuid.UUID) -> Product:
    product = await repo.get_base(product_id)
    if not product:
        raise _not_found("Product")
    return product


async def get_config(db: AsyncSession, product_id: uuid.UUID) -> AdminBuilderConfig:
    repo = BuilderRepository(db)
    product = await _base(repo, product_id)
    components = await repo.list_components(product.id)
    return AdminBuilderConfig(
        product_id=product.id,
        vendor_id=product.vendor_id,
        builder_kind=product.builder_kind,
        min_items=product.builder_min_items or 1,
        max_items=product.builder_max_items,
        components=[_component_read(c) for c in components],
    )


async def update_settings(
    db: AsyncSession, actor: User, product_id: uuid.UUID, body: BuilderSettingsUpdate
) -> AdminBuilderConfig:
    """Make a product a builder (or stop it being one) and set how many items it holds."""
    repo = BuilderRepository(db)
    product = await _base(repo, product_id)
    if body.max_items is not None and body.max_items < body.min_items:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The most items can't be fewer than the least",
        )
    if body.builder_kind and await repo.is_component_anywhere(product.id):
        raise _conflict("This product is an item in another builder, so it can't be a builder itself")

    fields = ["builder_kind", "builder_min_items", "builder_max_items"]
    before = audit_service.snapshot(product, fields)
    product.builder_kind = body.builder_kind
    product.builder_min_items = body.min_items if body.builder_kind else None
    product.builder_max_items = body.max_items if body.builder_kind else None
    await db.flush()
    await audit_service.record(
        db, actor, "builder.updated", "product", product.id,
        before=before, after=audit_service.snapshot(product, fields),
    )
    return await get_config(db, product.id)


async def add_component(
    db: AsyncSession, actor: User, product_id: uuid.UUID, body: BuilderComponentCreate
) -> AdminBuilderConfig:
    repo = BuilderRepository(db)
    base = await _base(repo, product_id)
    if not base.builder_kind:
        raise _conflict("Make this product a builder first")
    item = await repo.get_base(body.component_product_id)
    if not item:
        raise _not_found("Item product")
    if item.id == base.id:
        raise _conflict("A builder can't contain itself")
    if item.builder_kind:
        raise _conflict("A builder can't go inside another builder")
    if item.vendor_id != base.vendor_id:
        raise _conflict("Items must come from the same shop as the builder, so it's one delivery")
    existing = await repo.list_components(base.id)
    if any(c.component_product_id == item.id for c in existing):
        raise _conflict(f"{item.name} is already in this builder")

    component = await repo.add_component(
        builder_product_id=base.id,
        component_product_id=item.id,
        role=body.role,
        max_qty=body.max_qty,
        sort_order=max((c.sort_order for c in existing), default=-1) + 1,
        is_active=True,
    )
    await audit_service.record(
        db, actor, "builder.item_added", "product", base.id,
        after={"item": item.name, "role": body.role, "max_qty": body.max_qty},
        context={"builder_component_id": component.id},
    )
    return await get_config(db, base.id)


async def update_component(
    db: AsyncSession, actor: User, product_id: uuid.UUID, component_id: uuid.UUID, body: BuilderComponentUpdate
) -> AdminBuilderConfig:
    repo = BuilderRepository(db)
    component = await repo.get_component(product_id, component_id)
    if not component:
        raise _not_found("Item")
    fields = ["role", "max_qty", "sort_order", "is_active"]
    before = audit_service.snapshot(component, fields)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(component, field, value)
    await db.flush()
    await audit_service.record(
        db, actor, "builder.item_updated", "product", product_id,
        before=before, after=audit_service.snapshot(component, fields),
        context={"item": component.component.name},
    )
    return await get_config(db, product_id)


async def remove_component(
    db: AsyncSession, actor: User, product_id: uuid.UUID, component_id: uuid.UUID
) -> AdminBuilderConfig:
    """Take an item out of the builder. Buckets already in carts keep their copy of it;
    open buckets just stop showing it."""
    repo = BuilderRepository(db)
    component = await repo.get_component(product_id, component_id)
    if not component:
        raise _not_found("Item")
    name = component.component.name
    await repo.delete_component(component)
    await audit_service.record(db, actor, "builder.item_removed", "product", product_id, before={"item": name})
    return await get_config(db, product_id)


async def list_for_admin(db: AsyncSession) -> list[AdminBuilderSummary]:
    repo = BuilderRepository(db)
    bases = await repo.list_bases(active_only=False)
    components = await repo.component_counts()
    buckets = await repo.bucket_counts()
    return [
        AdminBuilderSummary(
            product_id=p.id,
            name=p.name,
            slug=p.slug,
            vendor_name=p.vendor.name,
            builder_kind=p.builder_kind or "",
            is_active=p.is_active,
            base_price_pkr=p.base_price_pkr,
            min_items=p.builder_min_items or 1,
            max_items=p.builder_max_items,
            component_count=components.get(p.id, 0),
            bucket_count=buckets.get(p.id, 0),
        )
        for p in bases
    ]


async def list_public(db: AsyncSession) -> list[BuilderSummary]:
    """Live builders that have something to put in them."""
    repo = BuilderRepository(db)
    components = await repo.component_counts()
    return [
        BuilderSummary(
            slug=p.slug, name=p.name, kind=p.builder_kind or "", image=_image(p), base_price_pkr=p.base_price_pkr
        )
        for p in await repo.list_bases(active_only=True)
        if components.get(p.id, 0) > 0
    ]
