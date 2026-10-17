import builtins
import uuid
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.catalog import (
    Category,
    City,
    Occasion,
    Product,
    ProductCity,
    ProductImage,
    ProductVariant,
    Vendor,
    VendorDocument,
    product_occasions_table,
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

    async def get_by_owner(self, user_id: uuid.UUID) -> Vendor | None:
        result = await self._db.execute(
            select(Vendor).where(Vendor.owner_user_id == user_id, Vendor.is_active.is_(True))
        )
        return result.scalar_one_or_none()

    async def get_application_by_owner(self, user_id: uuid.UUID) -> Vendor | None:
        """The user's shop whatever its state (pending, approved or rejected)."""
        result = await self._db.execute(
            select(Vendor)
            .where(Vendor.owner_user_id == user_id)
            .options(selectinload(Vendor.city), selectinload(Vendor.owner), selectinload(Vendor.documents))
            .execution_options(populate_existing=True)
            .order_by(Vendor.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def get_application(self, vendor_id: uuid.UUID) -> Vendor | None:
        result = await self._db.execute(
            select(Vendor)
            .where(Vendor.id == vendor_id)
            .options(selectinload(Vendor.city), selectinload(Vendor.owner), selectinload(Vendor.documents))
            .execution_options(populate_existing=True)
        )
        return result.scalar_one_or_none()

    async def add_document(self, **kwargs: Any) -> VendorDocument:
        doc = VendorDocument(**kwargs)
        self._db.add(doc)
        await self._db.flush()
        return doc

    async def get_document(self, vendor_id: uuid.UUID, document_id: uuid.UUID) -> VendorDocument | None:
        result = await self._db.execute(
            select(VendorDocument).where(VendorDocument.id == document_id, VendorDocument.vendor_id == vendor_id)
        )
        return result.scalar_one_or_none()

    async def delete_document(self, doc: VendorDocument) -> None:
        await self._db.delete(doc)
        await self._db.flush()

    async def list_applications(self, approval_status: str | None = None) -> builtins.list[Vendor]:
        """Shops that came through an application (they have an owner), newest first."""
        q = (
            select(Vendor)
            .where(Vendor.owner_user_id.is_not(None))
            .options(selectinload(Vendor.city), selectinload(Vendor.owner), selectinload(Vendor.documents))
            .execution_options(populate_existing=True)
        )
        if approval_status:
            q = q.where(Vendor.approval_status == approval_status)
        result = await self._db.execute(q.order_by(Vendor.created_at.desc()))
        return list(result.scalars().all())

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


class OccasionRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def list_active(self) -> list[Occasion]:
        result = await self._db.execute(
            select(Occasion)
            .where(Occasion.is_active.is_(True))
            .order_by(Occasion.sort_order, Occasion.name)
        )
        return list(result.scalars().all())

    async def get_by_slug(self, slug: str) -> Occasion | None:
        result = await self._db.execute(select(Occasion).where(Occasion.slug == slug))
        return result.scalar_one_or_none()

    async def get_by_id(self, occasion_id: uuid.UUID) -> Occasion | None:
        result = await self._db.execute(select(Occasion).where(Occasion.id == occasion_id))
        return result.scalar_one_or_none()

    async def create(self, **kwargs: Any) -> Occasion:
        occasion = Occasion(**kwargs)
        self._db.add(occasion)
        await self._db.flush()
        await self._db.refresh(occasion)
        return occasion

    async def get_by_ids(self, occasion_ids: list[uuid.UUID]) -> list[Occasion]:
        if not occasion_ids:
            return []
        result = await self._db.execute(select(Occasion).where(Occasion.id.in_(occasion_ids)))
        return list(result.scalars().all())

    async def update(self, occasion: Occasion, **kwargs: Any) -> Occasion:
        for key, value in kwargs.items():
            setattr(occasion, key, value)
        await self._db.flush()
        await self._db.refresh(occasion)
        return occasion


class ProductRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def list_for_admin(
        self,
        is_active: bool | None = None,
        q_text: str | None = None,
        vendor_id: uuid.UUID | None = None,
        limit: int = 200,
    ) -> builtins.list[Product]:
        """Every product with its vendor and photos, hidden ones included, newest first."""
        q = select(Product).options(selectinload(Product.vendor), selectinload(Product.images))
        if is_active is not None:
            q = q.where(Product.is_active.is_(is_active))
        if vendor_id:
            q = q.where(Product.vendor_id == vendor_id)
        if q_text:
            pattern = f"%{q_text.strip()}%"
            q = q.where(or_(Product.name.ilike(pattern), Product.slug.ilike(pattern)))
        result = await self._db.execute(q.order_by(Product.created_at.desc()).limit(limit))
        return list(result.scalars().all())

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
        occasion_id: uuid.UUID | None = None,
        active_only: bool = True,
        page: int = 1,
        page_size: int = 20,
        sort: str = "recommended",
        min_price_pkr: int | None = None,
        max_price_pkr: int | None = None,
    ) -> tuple[list[Product], int]:
        """Paginated products.

        Price filters and price sorting use the city's price override when
        ``city_id`` is given (what the buyer will actually pay there), and the
        base price otherwise.
        """
        q = self._with_relations()
        if active_only:
            q = q.where(Product.is_active.is_(True))
        if vendor_id:
            q = q.where(Product.vendor_id == vendor_id)
        if category_id:
            q = q.where(Product.category_id == category_id)
        price: Any = Product.base_price_pkr
        if city_id:
            q = q.join(Product.product_cities).where(
                ProductCity.city_id == city_id,
                ProductCity.is_available.is_(True),
            )
            price = func.coalesce(ProductCity.price_override_pkr, Product.base_price_pkr)
        if occasion_id:
            q = q.join(
                product_occasions_table,
                Product.id == product_occasions_table.c.product_id,
            ).where(product_occasions_table.c.occasion_id == occasion_id)
        if min_price_pkr is not None:
            q = q.where(price >= min_price_pkr)
        if max_price_pkr is not None:
            q = q.where(price <= max_price_pkr)

        count_q = select(func.count()).select_from(q.subquery())
        total = (await self._db.execute(count_q)).scalar_one()

        # Product.id last keeps pages stable when the primary key ties.
        order: tuple[Any, ...] = {
            "price_asc": (price.asc(), Product.name, Product.id),
            "price_desc": (price.desc(), Product.name, Product.id),
            "newest": (Product.created_at.desc(), Product.id),
        }.get(sort, (Product.name, Product.id))
        q = q.order_by(*order).offset((page - 1) * page_size).limit(page_size)
        items = list((await self._db.execute(q)).scalars().unique().all())
        return items, total

    async def search_text(
        self, query: str, city_id: uuid.UUID | None = None, limit: int = 20
    ) -> builtins.list[Product]:
        """Case-insensitive match on product name, description or vendor name.

        Fallback for when Meilisearch is unavailable; active products only.
        """
        pattern = f"%{query.strip()}%"
        q = (
            self._with_relations()
            .join(Product.vendor)
            .where(
                Product.is_active.is_(True),
                or_(
                    Product.name.ilike(pattern),
                    Product.description.ilike(pattern),
                    Vendor.name.ilike(pattern),
                ),
            )
        )
        if city_id:
            q = q.join(Product.product_cities).where(
                ProductCity.city_id == city_id,
                ProductCity.is_available.is_(True),
            )
        q = q.order_by(Product.name).limit(limit)
        return builtins.list((await self._db.execute(q)).scalars().unique().all())

    async def get_active_by_ids(self, product_ids: builtins.list[uuid.UUID]) -> builtins.list[Product]:
        """Active products for the given ids, in the order the ids were given."""
        if not product_ids:
            return []
        q = self._with_relations().where(
            Product.id.in_(product_ids), Product.is_active.is_(True)
        )
        found = {p.id: p for p in (await self._db.execute(q)).scalars().unique().all()}
        return [found[pid] for pid in product_ids if pid in found]

    async def list_all_active(self) -> builtins.list[Product]:
        q = self._with_relations().where(Product.is_active.is_(True))
        return builtins.list((await self._db.execute(q)).scalars().unique().all())

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

    async def get_with_occasions(self, product_id: uuid.UUID) -> Product | None:
        result = await self._db.execute(
            self._with_relations().options(selectinload(Product.occasions)).where(Product.id == product_id)
        )
        return result.scalar_one_or_none()

    async def set_occasions(self, product: Product, occasions: builtins.list[Occasion]) -> None:
        """`product` must have been loaded with its occasions (get_with_occasions)."""
        product.occasions = occasions
        await self._db.flush()

    async def create(self, **kwargs: Any) -> Product:
        product = Product(**kwargs)
        self._db.add(product)
        await self._db.flush()
        result = await self._db.execute(
            self._with_relations().where(Product.id == product.id)
        )
        return result.scalar_one()  # type: ignore[no-any-return]

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

    async def add_variant(self, product_id: uuid.UUID, **kwargs: Any) -> ProductVariant:
        variant = ProductVariant(product_id=product_id, **kwargs)
        self._db.add(variant)
        await self._db.flush()
        await self._db.refresh(variant)
        return variant

    async def get_variant(self, variant_id: uuid.UUID) -> ProductVariant | None:
        result = await self._db.execute(select(ProductVariant).where(ProductVariant.id == variant_id))
        return result.scalar_one_or_none()

    async def update_variant(self, variant: ProductVariant, **kwargs: Any) -> ProductVariant:
        for key, value in kwargs.items():
            setattr(variant, key, value)
        await self._db.flush()
        return variant

    async def get_image(self, image_id: uuid.UUID) -> ProductImage | None:
        result = await self._db.execute(
            select(ProductImage).where(ProductImage.id == image_id)
        )
        return result.scalar_one_or_none()

    async def delete_image(self, image: ProductImage) -> None:
        await self._db.delete(image)
        await self._db.flush()

    async def reorder_images(self, product_id: uuid.UUID, image_ids: builtins.list[uuid.UUID]) -> None:
        result = await self._db.execute(select(ProductImage).where(ProductImage.product_id == product_id))
        position = {image_id: i for i, image_id in enumerate(image_ids)}
        for image in result.scalars().all():
            image.sort_order = position[image.id]
        await self._db.flush()

    async def set_primary_image(self, product_id: uuid.UUID, image_id: uuid.UUID) -> None:
        """Exactly one main photo per product."""
        result = await self._db.execute(select(ProductImage).where(ProductImage.product_id == product_id))
        for image in result.scalars().all():
            image.is_primary = image.id == image_id
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
