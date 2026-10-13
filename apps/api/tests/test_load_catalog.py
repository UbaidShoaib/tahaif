"""scripts/load_catalog.py — validation rules and idempotent loading."""

import copy
import sys
import uuid
from datetime import time
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core import security
from app.models.catalog import City, Product, ProductCity, ProductVariant
from app.models.user import User, UserRole

sys.path.insert(0, str(Path(__file__).parents[1] / "scripts"))
from load_catalog import CatalogError, load_catalog, parse_catalog  # noqa: E402


def _catalog() -> dict[str, Any]:
    """A small valid catalog with slugs unique to this call (tests share one DB)."""
    tag = uuid.uuid4().hex[:8]
    return {
        "admin": {"full_name": "Owner", "email": f"owner-{tag}@example.com"},
        "vendors": [{"slug": f"shop-{tag}", "name": "Shop", "city": "lahore"}],
        "categories": [{"slug": f"flowers-{tag}", "name": "Flowers"}],
        "delivery_defaults": [
            {"city": "lahore", "fee": 250, "notice_hours": 3, "same_day_cutoff": "17:00"},
            {"city": "islamabad", "fee": 400, "notice_hours": 24, "same_day_cutoff": None},
        ],
        "products": [
            {
                "slug": f"roses-{tag}",
                "name": "Roses",
                "vendor": f"shop-{tag}",
                "category": f"flowers-{tag}",
                "base_price": 2500,
                "options": [
                    {"name": "12 stems", "extra_price": 0, "stock": 50},
                    {"name": "24 stems", "extra_price": 2000, "stock": 30},
                ],
                "images": [
                    {"url": "https://example.com/roses.jpg", "alt": "Roses"},
                    {"url": "roses-2.jpg"},
                ],
                "occasions": ["birthday"],
                "personalisation": [{"label": "Card message", "type": "text", "max_length": 200}],
                "delivery": "default",
            }
        ],
    }


async def _product(db: AsyncSession, slug: str) -> Product:
    db.expire_all()
    return (
        await db.execute(
            select(Product)
            .where(Product.slug == slug)
            .options(
                selectinload(Product.variants),
                selectinload(Product.images),
                selectinload(Product.product_cities).selectinload(ProductCity.city),
                selectinload(Product.customization_fields),
                selectinload(Product.occasions),
            )
        )
    ).scalar_one()


def test_parse_reports_every_problem_at_once() -> None:
    raw = _catalog()
    product = raw["products"][0]
    product["vendor"] = "nobody"
    product["occasions"] = ["halloween"]
    product["options"] = [{"name": "Big", "extra_price": 500, "stock": 1}]
    product["delivery"] = [{"city": "atlantis", "fee": 0, "notice_hours": 1}]
    raw["products"].append(copy.deepcopy(product))

    with pytest.raises(CatalogError) as exc:
        parse_catalog(raw)

    text = str(exc.value)
    assert "duplicate product slug" in text
    assert "unknown vendor 'nobody'" in text
    assert "unknown occasion 'halloween'" in text
    assert "no option with extra_price 0" in text
    assert "unknown city 'atlantis'" in text


@pytest.mark.parametrize(
    ("path", "value"),
    [
        (("products", 0, "base_price"), 2500.5),
        (("products", 0, "base_price"), "2,500"),
        (("products", 0, "slug"), "Red Roses"),
        (("delivery_defaults", 0, "same_day_cutoff"), "5pm"),
        (("products", 0, "price"), 1),  # unknown key
    ],
)
def test_parse_rejects_bad_values(path: tuple[Any, ...], value: Any) -> None:
    raw = _catalog()
    target = raw
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value

    with pytest.raises(CatalogError):
        parse_catalog(raw)


def test_default_delivery_needs_defaults() -> None:
    raw = _catalog()
    raw["delivery_defaults"] = []

    with pytest.raises(CatalogError, match="delivery_defaults is empty"):
        parse_catalog(raw)


async def test_load_stores_paisa_delivery_and_skips_file_name_images(db: AsyncSession) -> None:
    raw = _catalog()

    stats = await load_catalog(db, parse_catalog(raw))

    assert stats["products"] == 1
    assert stats["images"] == 1
    assert stats["images_skipped"] == 1
    product = await _product(db, raw["products"][0]["slug"])
    assert product.base_price_pkr == 250_000
    assert {v.name: v.price_delta_pkr for v in product.variants} == {
        "12 stems": 0,
        "24 stems": 200_000,
    }
    assert [(i.url, i.is_primary) for i in product.images] == [
        ("https://example.com/roses.jpg", True)
    ]
    by_city = {pc.city.slug: pc for pc in product.product_cities}
    assert by_city["lahore"].delivery_fee_pkr == 25_000
    assert by_city["lahore"].lead_time_hours == 3
    assert by_city["lahore"].same_day_cutoff == time(17, 0)
    assert by_city["islamabad"].same_day_cutoff is None
    assert [o.slug for o in product.occasions] == ["birthday"]
    assert [f.label for f in product.customization_fields] == ["Card message"]


async def test_reload_updates_in_place_and_keeps_option_ids(db: AsyncSession) -> None:
    raw = _catalog()
    slug = raw["products"][0]["slug"]
    await load_catalog(db, parse_catalog(raw))
    before = {v.name: v.id for v in (await _product(db, slug)).variants}

    raw["products"][0]["base_price"] = 3000
    raw["products"][0]["options"][1]["stock"] = 5
    raw["products"][0]["delivery"] = [{"city": "lahore", "fee": 0, "notice_hours": 2}]
    await load_catalog(db, parse_catalog(raw))

    product = await _product(db, slug)
    assert product.base_price_pkr == 300_000
    assert {v.name: v.id for v in product.variants} == before
    assert {v.name: v.stock_qty for v in product.variants}["24 stems"] == 5
    available = {pc.city.slug: pc.is_available for pc in product.product_cities}
    assert available == {"lahore": True, "islamabad": False}
    count = await db.scalar(
        select(func.count()).select_from(ProductVariant).where(ProductVariant.product_id == product.id)
    )
    assert count == 2
    assert await db.scalar(select(func.count()).select_from(City).where(City.slug == "lahore")) == 1


async def test_admin_needs_a_password_and_existing_accounts_keep_theirs(db: AsyncSession) -> None:
    raw = _catalog()
    email = raw["admin"]["email"]

    assert (await load_catalog(db, parse_catalog(raw)))["admin"] == 0
    assert await db.scalar(select(User).where(User.email == email)) is None

    assert (await load_catalog(db, parse_catalog(raw), "first-password"))["admin"] == 1
    await load_catalog(db, parse_catalog(raw), "another-password")

    db.expire_all()
    user = (await db.execute(select(User).where(User.email == email))).scalar_one()
    assert user.role == UserRole.admin
    assert security.verify_password("first-password", user.password_hash or "")
