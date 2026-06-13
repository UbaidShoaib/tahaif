import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.catalog import (
    Category,
    City,
    Product,
    ProductCity,
    ProductImage,
    Vendor,
)


class CityRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def list_active(self) -> list[City]:
        result = await self._db.execute(
            select(City).where(City.is_active.is_(True)).order_by(City.name)
        )
        return list(result.scalars().all())

    async def get_by_slug(self, slug: str) -> City | None:
        result = await self._db.execute(select(City).where(City.slug == slug))
        return result.scalar_one_or_none()

    async def get_by_id(self, city_id: uuid.UUID) -> City | None:
        result = await self._db.execute(select(City).where(City.id == city_id))
        return result.scalar_one_or_none()

    async def create(self, **kwargs: Any) -> City:
        city = City(**kwargs)
        self._db.add(city)
        await self._db.flush()
        await self._db.refresh(city)
        return city

    async def update(self, city: City, **kwargs: Any) -> City:
        for key, value in kwargs.items():
            setattr(city, key, value)
        await self._db.flush()
        await self._db.refresh(city)
        return city


class VendorRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def list(
        self, city_id: uuid.UUID | None = None, active_only: bool = True
    ) -> list[Vendor]:
        q = select(Vendor)
        if active_only:
            q = q.where(Vendor.is_active.is_(True))
        if city_id:
            q = q.where(Vendor.city_id == city_id)
        result = await self._db.execute(q.order_by(Vendor.name))
        return list(result.scalars().all())

    async def get_by_slug(self, slug: str) -> Vendor | None:
        result = await self._db.execute(select(Vendor).where(Vendor.slug == slug))
        return result.scalar_one_or_none()

    async def get_by_id(self, vendor_id: uuid.UUID) -> Vendor | None:
        result = await self._db.execute(select(Vendor).where(Vendor.id == vendor_id))
        return result.scalar_one_or_none()

    async def create(self, **kwargs: Any) -> Vendor:
        vendor = Vendor(**kwargs)
        self._db.add(vendor)
        await self._db.flush()
        await self._db.refresh(vendor)
        return vendor

    async def update(self, vendor: Vendor, **kwargs: Any) -> Vendor:
        for key, value in kwargs.items():
            setattr(vendor, key, value)
        await self._db.flush()
        await self._db.refresh(vendor)
        return vendor


class CategoryRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def list_roots(self) -> list[Category]:
        """Return top-level categories with children eagerly loaded (2 levels)."""
        result = await self._db.execute(
            select(Category)
            .where(Category.parent_id.is_(None), Category.is_active.is_(True))
            .options(selectinload(Category.children))
            .order_by(Category.sort_order, Category.name)
        )
        return list(result.scalars().all())

    async def get_by_slug(self, slug: str) -> Category | None:
        result = await self._db.execute(select(Category).where(Category.slug == slug))
        return result.scalar_one_or_none()

    async def get_by_id(self, category_id: uuid.UUID) -> Category | None:
        result = await self._db.execute(select(Category).where(Category.id == category_id))
        return result.scalar_one_or_none()

    async def create(self, **kwargs: Any) -> Category:
        category = Category(**kwargs)
        self._db.add(category)
        await self._db.flush()
        # Reload with children relationship so serialisation doesn't lazy-load
        result = await self._db.execute(
            select(Category)
            .options(selectinload(Category.children))
            .where(Category.id == category.id)
        )
        return result.scalar_one()

    async def update(self, category: Category, **kwargs: Any) -> Category:
        for key, value in kwargs.items():
            setattr(category, key, value)
        await self._db.flush()
        await self._db.refresh(category)
        return category


class ProductRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    def _with_relations(self) -> Any:
        return select(Product).options(
            selectinload(Product.images),
            selectinload(Product.product_cities),
            selectinload(Product.variants),
            selectinload(Product.vendor),
        )

    async def list(
        self,
        city_id: uuid.UUID | None = None,
        vendor_id: uuid.UUID | None = None,
        category_id: uuid.UUID | None = None,
        active_only: bool = True,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[Product], int]:
        q = self._with_relations()
        if active_only:
            q = q.where(Product.is_active.is_(True))
        if vendor_id:
            q = q.where(Product.vendor_id == vendor_id)
        if category_id:
            q = q.where(Product.category_id == category_id)
        if city_id:
            q = q.join(Product.product_cities).where(
                ProductCity.city_id == city_id,
                ProductCity.is_available.is_(True),
            )

        count_q = select(func.count()).select_from(q.subquery())
        total = (await self._db.execute(count_q)).scalar_one()

        q = q.order_by(Product.name).offset((page - 1) * page_size).limit(page_size)
        items = list((await self._db.execute(q)).scalars().unique().all())
        return items, total

    async def get_by_slug(self, slug: str) -> Product | None:
        result = await self._db.execute(
            self._with_relations().where(Product.slug == slug)
        )
        return result.scalar_one_or_none()

    async def get_by_id(self, product_id: uuid.UUID) -> Product | None:
        result = await self._db.execute(
            self._with_relations().where(Product.id == product_id)
        )
        return result.scalar_one_or_none()

    async def create(self, **kwargs: Any) -> Product:
        product = Product(**kwargs)
        self._db.add(product)
        await self._db.flush()
        await self._db.refresh(product, ["images", "product_cities"])
        return product

    async def update(self, product: Product, **kwargs: Any) -> Product:
        for key, value in kwargs.items():
            setattr(product, key, value)
        await self._db.flush()
        await self._db.refresh(product)
        return product

    async def add_image(self, product_id: uuid.UUID, **kwargs: Any) -> ProductImage:
        image = ProductImage(product_id=product_id, **kwargs)
        self._db.add(image)
        await self._db.flush()
        await self._db.refresh(image)
        return image

    async def get_image(self, image_id: uuid.UUID) -> ProductImage | None:
        result = await self._db.execute(
            select(ProductImage).where(ProductImage.id == image_id)
        )
        return result.scalar_one_or_none()

    async def delete_image(self, image: ProductImage) -> None:
        await self._db.delete(image)
        await self._db.flush()

    async def upsert_city_availability(
        self, product_id: uuid.UUID, city_id: uuid.UUID, **kwargs: Any
    ) -> ProductCity:
        result = await self._db.execute(
            select(ProductCity).where(
                ProductCity.product_id == product_id,
                ProductCity.city_id == city_id,
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            for key, value in kwargs.items():
                setattr(existing, key, value)
            await self._db.flush()
            return existing

        pc = ProductCity(product_id=product_id, city_id=city_id, **kwargs)
        self._db.add(pc)
        await self._db.flush()
        await self._db.refresh(pc)
        return pc

    async def delete_city_availability(
        self, product_id: uuid.UUID, city_id: uuid.UUID
    ) -> bool:
        result = await self._db.execute(
            select(ProductCity).where(
                ProductCity.product_id == product_id,
                ProductCity.city_id == city_id,
            )
        )
        pc = result.scalar_one_or_none()
        if not pc:
            return False
        await self._db.delete(pc)
        await self._db.flush()
        return True
