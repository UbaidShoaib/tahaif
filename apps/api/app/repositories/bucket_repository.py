import uuid

from sqlalchemy import select
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
