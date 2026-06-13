"""
Seed script — populates cities, occasions, categories, vendors, and products.
Run from apps/api/: uv run python scripts/seed.py
Requires DB to be running and migrations applied (alembic upgrade head).
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.models.catalog import (
    Category,
    City,
    Occasion,
    Product,
    ProductCity,
    ProductImage,
    ProductVariant,
    Vendor,
)

PLACEHOLDER_IMAGE = "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800"

CITIES = [
    {"name": "Karachi", "slug": "karachi", "timezone": "Asia/Karachi"},
    {"name": "Lahore", "slug": "lahore", "timezone": "Asia/Karachi"},
    {"name": "Islamabad", "slug": "islamabad", "timezone": "Asia/Karachi"},
    {"name": "Faisalabad", "slug": "faisalabad", "timezone": "Asia/Karachi"},
    {"name": "Multan", "slug": "multan", "timezone": "Asia/Karachi"},
    {"name": "Peshawar", "slug": "peshawar", "timezone": "Asia/Karachi"},
    {"name": "Sialkot", "slug": "sialkot", "timezone": "Asia/Karachi"},
    {"name": "Gujranwala", "slug": "gujranwala", "timezone": "Asia/Karachi"},
    {"name": "Hyderabad", "slug": "hyderabad", "timezone": "Asia/Karachi"},
]

OCCASIONS = [
    {"name": "Birthday", "slug": "birthday", "name_ur": "سالگرہ", "sort_order": 1},
    {"name": "Eid-ul-Fitr", "slug": "eid-ul-fitr", "name_ur": "عید الفطر", "sort_order": 2},
    {"name": "Eid-ul-Azha", "slug": "eid-ul-azha", "name_ur": "عید الاضحیٰ", "sort_order": 3},
    {"name": "Anniversary", "slug": "anniversary", "name_ur": "سالگرہ شادی", "sort_order": 4},
    {"name": "Mother's Day", "slug": "mothers-day", "name_ur": "یومِ مادر", "sort_order": 5},
    {"name": "Wedding", "slug": "wedding", "name_ur": "شادی", "sort_order": 6},
    {"name": "Aqiqa", "slug": "aqiqa", "name_ur": "عقیقہ", "sort_order": 7},
    {"name": "Ramadan", "slug": "ramadan", "name_ur": "رمضان", "sort_order": 8},
]

CATEGORIES = [
    {"name": "Cakes", "slug": "cakes", "sort_order": 1},
    {"name": "Flowers", "slug": "flowers", "sort_order": 2},
    {"name": "Chocolates", "slug": "chocolates", "sort_order": 3},
    {"name": "Perfumes", "slug": "perfumes", "sort_order": 4},
    {"name": "Mithai", "slug": "mithai", "sort_order": 5},
    {"name": "Fruit Baskets", "slug": "fruit-baskets", "sort_order": 6},
    {"name": "Dry Fruits", "slug": "dry-fruits", "sort_order": 7},
    {"name": "Combo Gifts", "slug": "combo-gifts", "sort_order": 8},
    {"name": "Customized Gifts", "slug": "customized-gifts", "sort_order": 9},
    {"name": "Kids Corner", "slug": "kids-corner", "sort_order": 10},
    {"name": "Meal Deals", "slug": "meal-deals", "sort_order": 11},
    {"name": "Sadqa & Aqiqa", "slug": "sadqa-aqiqa", "sort_order": 12},
    {"name": "Gift Cards", "slug": "gift-cards", "sort_order": 13},
]

# Vendors per city (city_slug, vendor_name, vendor_slug, description)
VENDORS = [
    ("lahore", "Layers Bakeshop", "layers-bakeshop", "Lahore's finest custom cakes since 2015"),
    ("lahore", "Tehzeeb Bakers", "tehzeeb-bakers", "Classic Pakistani bakers with 50+ years of heritage"),
    ("lahore", "Bread & Beyond", "bread-beyond-lahore", "Artisanal breads and celebration cakes"),
    ("karachi", "United King", "united-king", "Karachi's iconic bakery chain"),
    ("karachi", "Delizia", "delizia-karachi", "Gourmet cakes and desserts"),
    ("karachi", "Premium Florist Karachi", "premium-florist-karachi", "Fresh flowers delivered same day"),
    ("islamabad", "Pie in the Sky", "pie-in-the-sky", "Islamabad's premium bakery and cafe"),
    ("islamabad", "Premium Florist Islamabad", "premium-florist-islamabad", "Beautiful bouquets for every occasion"),
    ("lahore", "J. Collection", "j-collection-lahore", "Pakistan's finest perfumes and fragrances"),
    ("karachi", "Hobnob", "hobnob-karachi", "Karachi's beloved bakery since 1985"),
]

# Products: (vendor_slug, category_slug, name, slug, description, base_price_pkr, variants)
# base_price_pkr is in paisa (PKR × 100)
PRODUCTS = [
    (
        "layers-bakeshop", "cakes",
        "Chocolate Truffle Cake", "chocolate-truffle-cake-layers",
        "Rich dark chocolate with truffle ganache frosting. A Lahore favourite.",
        350000,  # PKR 3500
        [
            {"name": "1 lb", "price_delta_pkr": 0, "stock_qty": 20, "attrs": {"weight_lbs": 1}},
            {"name": "2 lb", "price_delta_pkr": 280000, "stock_qty": 15, "attrs": {"weight_lbs": 2}},
            {"name": "3 lb", "price_delta_pkr": 560000, "stock_qty": 10, "attrs": {"weight_lbs": 3}},
        ],
    ),
    (
        "layers-bakeshop", "cakes",
        "Red Velvet Cake", "red-velvet-cake-layers",
        "Classic red velvet with cream cheese frosting and beautiful red layers.",
        320000,
        [
            {"name": "1 lb", "price_delta_pkr": 0, "stock_qty": 20, "attrs": {"weight_lbs": 1}},
            {"name": "2 lb", "price_delta_pkr": 250000, "stock_qty": 15, "attrs": {"weight_lbs": 2}},
        ],
    ),
    (
        "tehzeeb-bakers", "cakes",
        "Black Forest Cake", "black-forest-cake-tehzeeb",
        "Traditional Black Forest with fresh cream, cherries, and chocolate shavings.",
        280000,
        [
            {"name": "1 lb", "price_delta_pkr": 0, "stock_qty": 25, "attrs": {"weight_lbs": 1}},
            {"name": "2 lb", "price_delta_pkr": 230000, "stock_qty": 20, "attrs": {"weight_lbs": 2}},
            {"name": "3 lb", "price_delta_pkr": 460000, "stock_qty": 12, "attrs": {"weight_lbs": 3}},
        ],
    ),
    (
        "united-king", "cakes",
        "Pineapple Cake", "pineapple-cake-united-king",
        "Light and fresh pineapple sponge cake — Karachi's classic.",
        260000,
        [
            {"name": "1 lb", "price_delta_pkr": 0, "stock_qty": 30, "attrs": {"weight_lbs": 1}},
            {"name": "2 lb", "price_delta_pkr": 210000, "stock_qty": 20, "attrs": {"weight_lbs": 2}},
        ],
    ),
    (
        "premium-florist-karachi", "flowers",
        "Red Roses Bouquet", "red-roses-bouquet-karachi",
        "Fresh red roses, hand-tied with premium ribbon. Perfect for any occasion.",
        250000,
        [
            {"name": "12 stems", "price_delta_pkr": 0, "stock_qty": 50, "attrs": {"stem_count": 12}},
            {"name": "24 stems", "price_delta_pkr": 200000, "stock_qty": 30, "attrs": {"stem_count": 24}},
            {"name": "50 stems", "price_delta_pkr": 500000, "stock_qty": 15, "attrs": {"stem_count": 50}},
        ],
    ),
    (
        "premium-florist-karachi", "flowers",
        "Mixed Seasonal Bouquet", "mixed-seasonal-bouquet-karachi",
        "Vibrant mix of seasonal flowers — lilies, carnations, and roses.",
        200000,
        [
            {"name": "Small (8 stems)", "price_delta_pkr": 0, "stock_qty": 40, "attrs": {"stem_count": 8}},
            {"name": "Medium (15 stems)", "price_delta_pkr": 150000, "stock_qty": 25, "attrs": {"stem_count": 15}},
        ],
    ),
    (
        "premium-florist-islamabad", "flowers",
        "White Lily Arrangement", "white-lily-arrangement-islamabad",
        "Elegant white lilies arranged in a premium vase.",
        350000,
        [
            {"name": "Standard", "price_delta_pkr": 0, "stock_qty": 20, "attrs": {"stem_count": 10}},
            {"name": "Deluxe", "price_delta_pkr": 250000, "stock_qty": 10, "attrs": {"stem_count": 20}},
        ],
    ),
    (
        "j-collection-lahore", "perfumes",
        "J. Classic Oud", "j-classic-oud",
        "Rich and woody oud fragrance — a timeless signature scent from J. Collection.",
        800000,
        [
            {"name": "50ml", "price_delta_pkr": 0, "stock_qty": 30, "attrs": {"volume_ml": 50}},
            {"name": "100ml", "price_delta_pkr": 600000, "stock_qty": 20, "attrs": {"volume_ml": 100}},
        ],
    ),
    (
        "j-collection-lahore", "perfumes",
        "J. Rose & Musk", "j-rose-musk",
        "Floral and musky — perfect everyday fragrance for her.",
        650000,
        [
            {"name": "50ml", "price_delta_pkr": 0, "stock_qty": 35, "attrs": {"volume_ml": 50}},
            {"name": "100ml", "price_delta_pkr": 500000, "stock_qty": 20, "attrs": {"volume_ml": 100}},
        ],
    ),
    (
        "pie-in-the-sky", "cakes",
        "Lemon Drizzle Cake", "lemon-drizzle-cake-pits",
        "Zesty lemon sponge with lemon curd and cream frosting. Islamabad's favourite.",
        380000,
        [
            {"name": "1 lb", "price_delta_pkr": 0, "stock_qty": 15, "attrs": {"weight_lbs": 1}},
            {"name": "2 lb", "price_delta_pkr": 300000, "stock_qty": 10, "attrs": {"weight_lbs": 2}},
        ],
    ),
    (
        "delizia-karachi", "cakes",
        "Ferrero Rocher Cake", "ferrero-rocher-cake-delizia",
        "Indulgent Ferrero Rocher studded chocolate hazelnut cake.",
        480000,
        [
            {"name": "1 lb", "price_delta_pkr": 0, "stock_qty": 12, "attrs": {"weight_lbs": 1}},
            {"name": "2 lb", "price_delta_pkr": 380000, "stock_qty": 8, "attrs": {"weight_lbs": 2}},
        ],
    ),
    (
        "hobnob-karachi", "cakes",
        "Carrot Walnut Cake", "carrot-walnut-cake-hobnob",
        "Moist carrot cake with walnuts and cream cheese frosting.",
        300000,
        [
            {"name": "1 lb", "price_delta_pkr": 0, "stock_qty": 18, "attrs": {"weight_lbs": 1}},
            {"name": "2 lb", "price_delta_pkr": 240000, "stock_qty": 12, "attrs": {"weight_lbs": 2}},
        ],
    ),
]


async def seed(db: AsyncSession) -> None:
    from sqlalchemy import select

    print("Seeding cities...")
    city_map: dict[str, City] = {}
    for c in CITIES:
        result = await db.execute(select(City).where(City.slug == c["slug"]))
        city = result.scalar_one_or_none()
        if not city:
            city = City(**c)
            db.add(city)
            await db.flush()
        city_map[c["slug"]] = city
    print(f"  {len(city_map)} cities")

    print("Seeding occasions...")
    for o in OCCASIONS:
        result = await db.execute(select(Occasion).where(Occasion.slug == o["slug"]))
        if not result.scalar_one_or_none():
            db.add(Occasion(**o))
    await db.flush()

    print("Seeding categories...")
    cat_map: dict[str, Category] = {}
    for c in CATEGORIES:
        result = await db.execute(select(Category).where(Category.slug == c["slug"]))
        cat = result.scalar_one_or_none()
        if not cat:
            cat = Category(**c)
            db.add(cat)
            await db.flush()
        cat_map[c["slug"]] = cat
    print(f"  {len(cat_map)} categories")

    print("Seeding vendors...")
    vendor_map: dict[str, Vendor] = {}
    for city_slug, name, slug, description in VENDORS:
        result = await db.execute(select(Vendor).where(Vendor.slug == slug))
        vendor = result.scalar_one_or_none()
        if not vendor:
            vendor = Vendor(
                city_id=city_map[city_slug].id,
                name=name,
                slug=slug,
                description=description,
            )
            db.add(vendor)
            await db.flush()
        vendor_map[slug] = vendor
    print(f"  {len(vendor_map)} vendors")

    print("Seeding products...")
    count = 0
    for vendor_slug, cat_slug, name, slug, description, base_price, variants in PRODUCTS:
        result = await db.execute(select(Product).where(Product.slug == slug))
        if result.scalar_one_or_none():
            continue

        product = Product(
            vendor_id=vendor_map[vendor_slug].id,
            category_id=cat_map[cat_slug].id,
            name=name,
            slug=slug,
            description=description,
            base_price_pkr=base_price,
        )
        db.add(product)
        await db.flush()

        # Primary image placeholder
        db.add(ProductImage(
            product_id=product.id,
            url=PLACEHOLDER_IMAGE,
            alt_text=name,
            sort_order=0,
            is_primary=True,
        ))

        # Variants
        for _i, v in enumerate(variants):
            db.add(ProductVariant(
                product_id=product.id,
                name=v["name"],
                price_delta_pkr=v["price_delta_pkr"],
                stock_qty=v["stock_qty"],
                attrs=v.get("attrs"),
            ))

        # Make product available in relevant cities
        relevant_cities = list(city_map.values())[:3]  # KHI, LHE, ISB for starters
        vendor_city_slug = [row[0] for row in VENDORS if row[2] == vendor_slug][0]
        vendor_city = city_map[vendor_city_slug]
        if vendor_city not in relevant_cities:
            relevant_cities.append(vendor_city)

        for city in relevant_cities:
            db.add(ProductCity(
                product_id=product.id,
                city_id=city.id,
                delivery_fee_pkr=25000,  # PKR 250
                lead_time_hours=24,
            ))

        await db.flush()
        count += 1

    print(f"  {count} products seeded")
    await db.commit()
    print("✓ Seed complete")


async def main() -> None:
    settings = get_settings()
    engine = create_async_engine(str(settings.database_url), echo=False)
    async_session = async_sessionmaker(engine, expire_on_commit=False)
    async with async_session() as db:
        await seed(db)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
