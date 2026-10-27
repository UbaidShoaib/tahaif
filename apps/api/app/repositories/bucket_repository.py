import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.sql import Select

from app.models.bucket import BuilderComponent, CustomBucket
from app.models.catalog import Product


class BuilderRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_base_by_slug(self, slug: str) -> Product | None:
        result = await self._db.execute(
            select(Product)
            .where(Product.slug == slug, Product.builder_kind.is_not(None))
            .options(selectinload(Product.images))
        )
        return result.scalar_one_or_none()

    async def list_components(self, builder_product_id: uuid.UUID) -> list[BuilderComponent]:
        result = await self._db.execute(
            select(BuilderComponent)
            .where(BuilderComponent.builder_product_id == builder_product_id)
            .options(selectinload(BuilderComponent.component).selectinload(Product.images))
            .order_by(BuilderComponent.sort_order)
        )
        return list(result.scalars())


    async def get_base(self, product_id: uuid.UUID) -> Product | None:
        result = await self._db.execute(
            select(Product).where(Product.id == product_id).options(selectinload(Product.images))
        )
        return result.scalar_one_or_none()

    async def list_bases(self, *, active_only: bool) -> list[Product]:
        query = (
            select(Product)
            .where(Product.builder_kind.is_not(None))
            .options(selectinload(Product.images), selectinload(Product.vendor))
            .order_by(Product.name)
        )
        if active_only:
            query = query.where(Product.is_active.is_(True))
        return list((await self._db.execute(query)).scalars())

    async def component_counts(self) -> dict[uuid.UUID, int]:
        result = await self._db.execute(
            select(BuilderComponent.builder_product_id, func.count())
            .where(BuilderComponent.is_active.is_(True))
            .group_by(BuilderComponent.builder_product_id)
        )
        return {row[0]: row[1] for row in result.all()}

    async def bucket_counts(self) -> dict[uuid.UUID, int]:
        result = await self._db.execute(
            select(CustomBucket.builder_product_id, func.count()).group_by(CustomBucket.builder_product_id)
        )
        return {row[0]: row[1] for row in result.all()}

    async def is_component_anywhere(self, product_id: uuid.UUID) -> bool:
        result = await self._db.execute(
            select(BuilderComponent.id).where(BuilderComponent.component_product_id == product_id).limit(1)
        )
        return result.first() is not None

    async def get_component(self, builder_product_id: uuid.UUID, component_id: uuid.UUID) -> BuilderComponent | None:
        result = await self._db.execute(
            select(BuilderComponent)
            .where(BuilderComponent.id == component_id, BuilderComponent.builder_product_id == builder_product_id)
            .options(selectinload(BuilderComponent.component).selectinload(Product.images))
        )
        return result.scalar_one_or_none()

    async def add_component(self, **kwargs: object) -> BuilderComponent:
        component = BuilderComponent(**kwargs)
        self._db.add(component)
        await self._db.flush()
        return component

    async def delete_component(self, component: BuilderComponent) -> None:
        await self._db.delete(component)
        await self._db.flush()


class BucketRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    def _query(self) -> Select[tuple[CustomBucket]]:
        return select(CustomBucket).options(
            selectinload(CustomBucket.builder_product).selectinload(Product.images)
        )

    async def create(self, **kwargs: object) -> CustomBucket:
        bucket = CustomBucket(**kwargs)
        self._db.add(bucket)
        await self._db.flush()
        result = await self._db.execute(self._query().where(CustomBucket.id == bucket.id))
        return result.scalar_one()

    async def get(self, bucket_id: uuid.UUID, *, for_update: bool = False) -> CustomBucket | None:
        query = self._query().where(CustomBucket.id == bucket_id)
        if for_update:
            # Edits to one bucket are applied one at a time, in arrival order.
            query = query.with_for_update(of=CustomBucket)
        result = await self._db.execute(query)
        return result.scalar_one_or_none()
