"""
Catalog loader — fills the shop from a catalog.json (format: docs/catalog-template.md).
Run from apps/api/:
    uv run python scripts/load_catalog.py catalog.json            # load
    uv run python scripts/load_catalog.py catalog.json --check    # validate only

Safe to re-run: everything is matched by slug and updated in place. Options
(variants) are matched by name and never deleted, because orders point at them.
Prices in the file are whole rupees; they are stored in paisa.

The admin in the file is created only when ADMIN_PASSWORD is set in the
environment. An existing account with that email is promoted to admin and its
password is left alone.
"""

import argparse
import asyncio
import json
import os
import re
import sys
from datetime import time
from pathlib import Path
from typing import Annotated, Any, Literal

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from pydantic import BaseModel, ConfigDict, EmailStr, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import selectinload

from app.core import security
from app.core.config import get_settings
from app.models.catalog import (
    Category,
    City,
    CustomizationField,
    CustomizationFieldType,
    Occasion,
    Product,
    ProductCity,
    ProductImage,
    ProductVariant,
    Vendor,
)
from app.models.user import User, UserRole

sys.path.insert(0, os.path.dirname(__file__))
from seed import CITIES, OCCASIONS  # noqa: E402

PAISA = 100
Slug = Annotated[str, Field(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$", max_length=100)]
Rupees = Annotated[int, Field(ge=0, strict=True)]
HHMM = Annotated[str, Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AdminIn(_Strict):
    full_name: str = Field(min_length=1, max_length=255)
    email: EmailStr


class CityIn(_Strict):
    slug: Slug
    name: str = Field(min_length=1, max_length=100)
    timezone: str = "Asia/Karachi"


class OccasionIn(_Strict):
    slug: Slug
    name: str = Field(min_length=1, max_length=100)
    name_ur: str | None = Field(default=None, max_length=100)


class VendorIn(_Strict):
    slug: Slug
    name: str = Field(min_length=1, max_length=255)
    city: Slug
    description: str | None = None
    logo: str | None = None


class CategoryIn(_Strict):
    slug: Slug
    name: str = Field(min_length=1, max_length=100)


class DeliveryIn(_Strict):
    city: Slug
    fee: Rupees
    notice_hours: int = Field(ge=0, le=24 * 30, strict=True)
    same_day_cutoff: HHMM | None = None
    city_price: Rupees | None = None


class OptionIn(_Strict):
    name: str = Field(min_length=1, max_length=255)
    extra_price: Rupees
    stock: int = Field(ge=0, strict=True)
    details: dict[str, Any] | None = None


class ImageIn(_Strict):
    url: str = Field(min_length=1)
    alt: str | None = Field(default=None, max_length=255)


class PersonalisationIn(_Strict):
    label: str = Field(min_length=1, max_length=255)
    type: CustomizationFieldType
    required: bool = False
    max_length: int | None = Field(default=None, ge=1)
    choices: list[str] | None = None


class ProductIn(_Strict):
    slug: Annotated[str, Field(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$", max_length=255)]
    name: str = Field(min_length=1, max_length=255)
    vendor: Slug
    category: Slug
    description: str | None = None
    base_price: Rupees
    options: list[OptionIn] = Field(min_length=1)
    images: list[ImageIn] = []
    occasions: list[Slug] = []
    personalisation: list[PersonalisationIn] = []
    delivery: Literal["default"] | list[DeliveryIn]


class CatalogIn(_Strict):
    admin: AdminIn | None = None
    new_cities: list[CityIn] = []
    new_occasions: list[OccasionIn] = []
    vendors: list[VendorIn] = Field(min_length=1)
    categories: list[CategoryIn] = Field(min_length=1)
    delivery_defaults: list[DeliveryIn] = []
    products: list[ProductIn] = []


class CatalogError(ValueError):
    """The file is well-formed JSON but breaks a catalog rule."""

    def __init__(self, problems: list[str]) -> None:
        super().__init__("\n".join(problems))
        self.problems = problems


def _duplicates(values: list[str]) -> list[str]:
    return sorted({v for v in values if values.count(v) > 1})


def parse_catalog(raw: dict[str, Any]) -> CatalogIn:
    """Validate shape and cross-references; raise CatalogError listing every problem."""
    try:
        cat = CatalogIn.model_validate(raw)
    except ValidationError as exc:
        raise CatalogError(
            [f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in exc.errors()]
        ) from exc

    problems: list[str] = []
    cities = {c["slug"] for c in CITIES} | {c.slug for c in cat.new_cities}
    occasions = {o["slug"] for o in OCCASIONS} | {o.slug for o in cat.new_occasions}
    vendors = {v.slug for v in cat.vendors}
    categories = {c.slug for c in cat.categories}

    for label, slugs in (
        ("vendor", [v.slug for v in cat.vendors]),
        ("category", [c.slug for c in cat.categories]),
        ("product", [p.slug for p in cat.products]),
    ):
        problems += [f"duplicate {label} slug: {s}" for s in _duplicates(slugs)]

    def check_delivery(where: str, rows: list[DeliveryIn]) -> None:
        for s in _duplicates([d.city for d in rows]):
            problems.append(f"{where}: city listed twice: {s}")
        for d in rows:
            if d.city not in cities:
                problems.append(f"{where}: unknown city '{d.city}'")

    check_delivery("delivery_defaults", cat.delivery_defaults)
    for v in cat.vendors:
        if v.city not in cities:
            problems.append(f"vendor {v.slug}: unknown city '{v.city}'")

    for p in cat.products:
        where = f"product {p.slug}"
        if p.vendor not in vendors:
            problems.append(f"{where}: unknown vendor '{p.vendor}'")
        if p.category not in categories:
            problems.append(f"{where}: unknown category '{p.category}'")
        problems += [
            f"{where}: unknown occasion '{o}'" for o in p.occasions if o not in occasions
        ]
        problems += [
            f"{where}: option named twice: {n}"
            for n in _duplicates([o.name for o in p.options])
        ]
        if not any(o.extra_price == 0 for o in p.options):
            problems.append(f"{where}: no option with extra_price 0")
        if p.delivery == "default":
            if not cat.delivery_defaults:
                problems.append(f"{where}: delivery is 'default' but delivery_defaults is empty")
        elif not p.delivery:
            problems.append(f"{where}: ships to no city")
        else:
            check_delivery(where, p.delivery)
        for f in p.personalisation:
            if f.type == CustomizationFieldType.select and not f.choices:
                problems.append(f"{where}: '{f.label}' is a select with no choices")

    if problems:
        raise CatalogError(problems)
    return cat


def _is_link(url: str) -> bool:
    return re.match(r"^https://\S+$", url) is not None


async def _by_slug(db: AsyncSession, model: Any, slug: str) -> Any:
    return (await db.execute(select(model).where(model.slug == slug))).scalar_one_or_none()


async def _upsert(db: AsyncSession, model: Any, slug: str, **fields: Any) -> Any:
    row = await _by_slug(db, model, slug)
    if row is None:
        row = model(slug=slug, **fields)
        db.add(row)
    else:
        for key, value in fields.items():
            setattr(row, key, value)
    await db.flush()
    return row


async def load_catalog(
    db: AsyncSession, cat: CatalogIn, admin_password: str | None = None
) -> dict[str, int]:
    """Write the catalog. Returns counts; `images_skipped` are file names awaiting upload."""
    stats = {"products": 0, "options": 0, "images": 0, "images_skipped": 0, "admin": 0}

    cities: dict[str, City] = {}
    for c in [CityIn(**c) for c in CITIES] + cat.new_cities:
        cities[c.slug] = await _upsert(db, City, c.slug, name=c.name, timezone=c.timezone)

    occasions: dict[str, Occasion] = {}
    seeded = [OccasionIn(slug=o["slug"], name=o["name"], name_ur=o["name_ur"]) for o in OCCASIONS]
    for order, o in enumerate(seeded + cat.new_occasions, start=1):
        occasions[o.slug] = await _upsert(
            db, Occasion, o.slug, name=o.name, name_ur=o.name_ur, sort_order=order
        )

    vendors: dict[str, Vendor] = {}
    for v in cat.vendors:
        vendors[v.slug] = await _upsert(
            db, Vendor, v.slug, name=v.name, city_id=cities[v.city].id,
            description=v.description, logo_url=v.logo,
        )

    categories: dict[str, Category] = {}
    for order, c in enumerate(cat.categories, start=1):
        categories[c.slug] = await _upsert(db, Category, c.slug, name=c.name, sort_order=order)

    for p in cat.products:
        product = (
            await db.execute(
                select(Product)
                .where(Product.slug == p.slug)
                .options(
                    selectinload(Product.variants),
                    selectinload(Product.images),
                    selectinload(Product.product_cities),
                    selectinload(Product.customization_fields),
                    selectinload(Product.occasions),
                )
            )
        ).scalar_one_or_none()
        if product is None:
            product = Product(
                slug=p.slug, variants=[], images=[], product_cities=[],
                customization_fields=[], occasions=[],
            )
            db.add(product)
        product.name = p.name
        product.vendor_id = vendors[p.vendor].id
        product.category_id = categories[p.category].id
        product.description = p.description
        product.base_price_pkr = p.base_price * PAISA
        product.occasions = [occasions[s] for s in p.occasions]

        existing_variants = {v.name: v for v in product.variants}
        for o in p.options:
            variant = existing_variants.get(o.name)
            if variant is None:
                variant = ProductVariant(name=o.name)
                product.variants.append(variant)
            variant.price_delta_pkr = o.extra_price * PAISA
            variant.stock_qty = o.stock
            variant.attrs = o.details
            variant.is_active = True
            stats["options"] += 1

        links = [i for i in p.images if _is_link(i.url)]
        stats["images_skipped"] += len(p.images) - len(links)
        product.images = [
            ProductImage(url=i.url, alt_text=i.alt or p.name, sort_order=n, is_primary=n == 0)
            for n, i in enumerate(links)
        ]
        stats["images"] += len(links)

        rows = cat.delivery_defaults if p.delivery == "default" else p.delivery
        existing_cities = {pc.city_id: pc for pc in product.product_cities}
        wanted = set()
        for d in rows:
            city_id = cities[d.city].id
            wanted.add(city_id)
            pc = existing_cities.get(city_id)
            if pc is None:
                pc = ProductCity(city_id=city_id)
                product.product_cities.append(pc)
            pc.delivery_fee_pkr = d.fee * PAISA
            pc.lead_time_hours = d.notice_hours
            pc.same_day_cutoff = time.fromisoformat(d.same_day_cutoff) if d.same_day_cutoff else None
            pc.price_override_pkr = d.city_price * PAISA if d.city_price is not None else None
            pc.is_available = True
        for city_id, pc in existing_cities.items():
            if city_id not in wanted:
                pc.is_available = False

        product.customization_fields = [
            CustomizationField(
                label=f.label, field_type=f.type, required=f.required,
                max_len=f.max_length, options=f.choices, sort_order=n,
            )
            for n, f in enumerate(p.personalisation)
        ]
        await db.flush()
        stats["products"] += 1

    if cat.admin:
        email = cat.admin.email.lower()
        user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if user is not None:
            user.role = UserRole.admin
            stats["admin"] = 1
        elif admin_password:
            db.add(User(
                email=email, full_name=cat.admin.full_name, role=UserRole.admin,
                password_hash=security.hash_password(admin_password),
                is_verified=True, currency_pref="PKR",
            ))
            stats["admin"] = 1

    await db.commit()
    return stats


async def main() -> int:
    parser = argparse.ArgumentParser(description="Load a catalog.json into the shop.")
    parser.add_argument("file", type=Path)
    parser.add_argument("--check", action="store_true", help="validate only, write nothing")
    args = parser.parse_args()

    try:
        cat = parse_catalog(json.loads(args.file.read_text(encoding="utf-8")))
    except json.JSONDecodeError as exc:
        print(f"Not valid JSON: {exc}", file=sys.stderr)
        return 1
    except CatalogError as exc:
        print(f"{len(exc.problems)} problem(s) in {args.file}:", file=sys.stderr)
        for problem in exc.problems:
            print(f"  - {problem}", file=sys.stderr)
        return 1

    print(
        f"OK: {len(cat.vendors)} vendors, {len(cat.categories)} categories, "
        f"{len(cat.products)} products"
    )
    if args.check:
        return 0

    engine = create_async_engine(str(get_settings().database_url), echo=False)
    async with async_sessionmaker(engine, expire_on_commit=False)() as db:
        stats = await load_catalog(db, cat, os.environ.get("ADMIN_PASSWORD") or None)
    await engine.dispose()

    print(
        f"Loaded {stats['products']} products, {stats['options']} options, "
        f"{stats['images']} images"
    )
    if stats["images_skipped"]:
        print(f"  {stats['images_skipped']} image(s) are file names, not links: skipped")
    if cat.admin and not stats["admin"]:
        print(f"  Admin {cat.admin.email} not created: set ADMIN_PASSWORD to create it")
    print("Now rebuild search: python scripts/reindex_search.py")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
