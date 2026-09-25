"""Checkout pricing: quote previews, loyalty value, and charge currency."""

import typing
import uuid
from collections.abc import AsyncIterator
from datetime import date, timedelta
from decimal import Decimal

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.catalog import FxRate, FxRateSource, ProductCity
from app.models.loyalty import CouponType
from app.models.user import UserRole
from app.repositories.catalog_repository import (
    CityRepository,
    ProductRepository,
    VendorRepository,
)
from app.repositories.loyalty_repository import CouponRepository, LoyaltyRepository
from app.repositories.user_repository import UserRepository
from app.schemas.user import CurrencyCode
from app.services import fx_service, loyalty_service

_PRICE = 75_000  # paisa
_DELIVERY = 20_000
_TOMORROW = (date.today() + timedelta(days=1)).isoformat()


class Shop(typing.NamedTuple):
    email: str
    user_id: uuid.UUID
    product_id: str
    city_id: str


async def _shop(db: AsyncSession, currency: str = "PKR") -> Shop:
    tag = uuid.uuid4().hex[:8]
    user = await UserRepository(db).create(
        email=f"price_{tag}@example.com", password_hash=hash_password("Password1"),
        role=UserRole.customer, currency_pref=currency,
    )
    city = await CityRepository(db).create(name=f"P City {tag}", slug=f"p-city-{tag}", timezone="Asia/Karachi")
    vendor = await VendorRepository(db).create(city_id=city.id, name=f"P Vendor {tag}", slug=f"p-vendor-{tag}")
    product = await ProductRepository(db).create(
        vendor_id=vendor.id, name=f"P Cake {tag}", slug=f"p-cake-{tag}", base_price_pkr=_PRICE
    )
    db.add(ProductCity(product_id=product.id, city_id=city.id, delivery_fee_pkr=_DELIVERY, lead_time_hours=24))
    shop = Shop(user.email, user.id, str(product.id), str(city.id))
    await db.commit()
    return shop


async def _login_with_cart(client: AsyncClient, shop: Shop) -> dict[str, str]:
    resp = await client.post("/api/v1/auth/login", json={"email": shop.email, "password": "Password1"})
    headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}
    added = await client.post("/api/v1/cart/items", json={"product_id": shop.product_id, "qty": 1}, headers=headers)
    assert added.status_code == 201
    return headers


def _place_body(city_id: str, **extra: object) -> dict[str, object]:
    return {
        "payment_method": "cod", "delivery_city_id": city_id, "delivery_date": _TOMORROW,
        "recipient_name": "Ammi", "recipient_phone": "+923001234567", "address_line1": "House 5 Street 10",
        **extra,
    }


# ── Coupon preview ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_quote_previews_coupon_and_matches_placed_order(client: AsyncClient, db: AsyncSession) -> None:
    shop = await _shop(db)
    coupon = await CouponRepository(db).create(
        code=f"TEN{uuid.uuid4().hex[:6].upper()}", coupon_type=CouponType.percent, value=Decimal("10")
    )
    code = coupon.code
    await db.commit()
    headers = await _login_with_cart(client, shop)

    quote = await client.post(
        f"/api/v1/checkout/quote?city_id={shop.city_id}&coupon_code={code.lower()}", headers=headers
    )
    assert quote.status_code == 200
    q = quote.json()
    assert q["coupon_code"] == code
    assert q["coupon_discount_pkr"] == _PRICE // 10
    assert q["discount_pkr"] == _PRICE // 10
    assert q["total_pkr"] == _PRICE + _DELIVERY - _PRICE // 10

    placed = await client.post(
        "/api/v1/checkout/place", json=_place_body(shop.city_id, coupon_code=code), headers=headers
    )
    assert placed.status_code == 201
    assert placed.json()["total_pkr"] == q["total_pkr"]
    assert placed.json()["discount_pkr"] == q["discount_pkr"]


@pytest.mark.asyncio
async def test_quote_rejects_invalid_coupon_with_message(client: AsyncClient, db: AsyncSession) -> None:
    shop = await _shop(db)
    headers = await _login_with_cart(client, shop)

    resp = await client.post(f"/api/v1/checkout/quote?city_id={shop.city_id}&coupon_code=NOPE", headers=headers)

    assert resp.status_code == 400
    assert resp.json()["detail"] == "Invalid coupon code"


# ── Loyalty value (docs/questions.md Q9: 1 point = PKR 1) ─────────────────────


@pytest.mark.asyncio
async def test_quote_values_each_point_at_one_rupee(client: AsyncClient, db: AsyncSession) -> None:
    shop = await _shop(db)
    wallet = await LoyaltyRepository(db).get_or_create_wallet(shop.user_id)
    wallet.balance_points = 30
    await db.commit()
    headers = await _login_with_cart(client, shop)

    q = (await client.post(
        f"/api/v1/checkout/quote?city_id={shop.city_id}&use_loyalty_points=true", headers=headers
    )).json()

    assert q["loyalty_points_used"] == 30
    assert q["loyalty_discount_pkr"] == 30 * loyalty_service.POINT_VALUE_PAISA == 3_000
    assert q["total_pkr"] == _PRICE + _DELIVERY - 3_000


@pytest.mark.asyncio
async def test_loyalty_is_capped_at_order_total_and_burns_only_what_is_used(
    client: AsyncClient, db: AsyncSession
) -> None:
    shop = await _shop(db)
    wallet = await LoyaltyRepository(db).get_or_create_wallet(shop.user_id)
    wallet.balance_points = 5_000
    await db.commit()
    headers = await _login_with_cart(client, shop)

    placed = await client.post(
        "/api/v1/checkout/place", json=_place_body(shop.city_id, use_loyalty_points=True), headers=headers
    )

    assert placed.status_code == 201
    assert placed.json()["total_pkr"] == 0
    after = await LoyaltyRepository(db).get_wallet(shop.user_id)
    assert after is not None
    assert after.balance_points == 5_000 - (_PRICE + _DELIVERY) // loyalty_service.POINT_VALUE_PAISA


def test_earn_and_burn_rates_match_documented_decision() -> None:
    # Earn 1 point per PKR 100; 100 points are worth PKR 100.
    assert loyalty_service.EARN_PAISA_PER_POINT == 100 * 100
    assert 100 * loyalty_service.POINT_VALUE_PAISA == 100 * 100


# ── Charge currency ───────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def sar_rate(db: AsyncSession) -> AsyncIterator[Decimal]:
    rate = Decimal("0.013500")
    db.add(FxRate(base_currency="PKR", quote_currency="SAR", rate=rate, source=FxRateSource.manual))
    await db.commit()
    yield rate
    await db.execute(delete(FxRate).where(FxRate.quote_currency == "SAR"))
    await db.commit()


@pytest.mark.asyncio
async def test_card_quote_with_missing_rate_charges_pkr_not_at_rate_one(
    client: AsyncClient, db: AsyncSession
) -> None:
    shop = await _shop(db, currency="CAD")  # no CAD rate exists
    headers = await _login_with_cart(client, shop)

    q = (await client.post(
        f"/api/v1/checkout/quote?city_id={shop.city_id}&payment_method=stripe", headers=headers
    )).json()

    assert q["currency"] == "PKR"
    assert q["total_charged"] == q["total_pkr"]


@pytest.mark.asyncio
async def test_card_quote_converts_charge_with_half_up_rounding(
    client: AsyncClient, db: AsyncSession, sar_rate: Decimal
) -> None:
    shop = await _shop(db, currency="SAR")
    headers = await _login_with_cart(client, shop)

    q = (await client.post(
        f"/api/v1/checkout/quote?city_id={shop.city_id}&payment_method=stripe", headers=headers
    )).json()

    # 95 000 paisa × 0.0135 = 1 282.5 halalas → 1 283
    assert q["currency"] == "SAR"
    assert Decimal(q["fx_rate"]) == sar_rate
    assert q["total_charged"] == 1_283
    assert q["total_pkr"] == _PRICE + _DELIVERY


@pytest.mark.asyncio
@pytest.mark.parametrize("method", ["cod", "bank_transfer"])
async def test_local_methods_always_charge_pkr(
    client: AsyncClient, db: AsyncSession, sar_rate: Decimal, method: str
) -> None:
    shop = await _shop(db, currency="SAR")  # a rate exists, but cash and transfers are in rupees
    headers = await _login_with_cart(client, shop)

    q = (await client.post(
        f"/api/v1/checkout/quote?city_id={shop.city_id}&payment_method={method}", headers=headers
    )).json()
    placed = (await client.post(
        "/api/v1/checkout/place", json=_place_body(shop.city_id, payment_method=method), headers=headers
    )).json()

    assert q["currency"] == "PKR" and q["total_charged"] == q["total_pkr"]
    assert placed["currency"] == "PKR" and placed["total_charged"] == placed["total_pkr"]


@pytest.mark.asyncio
async def test_fx_rates_endpoint_lists_only_chargeable_currencies(client: AsyncClient, sar_rate: Decimal) -> None:
    body = (await client.get("/api/v1/fx-rates")).json()
    assert body["base"] == "PKR"
    assert Decimal(body["rates"]["PKR"]) == 1
    assert Decimal(body["rates"]["SAR"]) == sar_rate
    assert set(body["rates"]) <= set(fx_service.SUPPORTED_CURRENCIES)


@pytest.mark.asyncio
async def test_currency_preference_is_validated(client: AsyncClient, db: AsyncSession) -> None:
    shop = await _shop(db)
    token = (await client.post("/api/v1/auth/login", json={"email": shop.email, "password": "Password1"})).json()
    headers = {"Authorization": f"Bearer {token['access_token']}"}

    assert (await client.patch("/api/v1/me", json={"currency_pref": "XYZ"}, headers=headers)).status_code == 422
    ok = await client.patch("/api/v1/me", json={"currency_pref": "GBP"}, headers=headers)
    assert ok.status_code == 200 and ok.json()["currency_pref"] == "GBP"


def test_schema_currency_list_matches_service() -> None:
    assert set(typing.get_args(CurrencyCode)) == set(fx_service.SUPPORTED_CURRENCIES)


def test_convert_from_pkr_rounds_half_up() -> None:
    assert fx_service.convert_from_pkr(95_000, Decimal("0.0135")) == 1_283
    assert fx_service.convert_from_pkr(100, Decimal("0.004")) == 0
    assert fx_service.convert_from_pkr(12_345, Decimal("1")) == 12_345


# ── Greeting-card messages ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_greeting_is_trimmed_cleared_by_blank_and_carried_to_order(
    client: AsyncClient, db: AsyncSession
) -> None:
    shop = await _shop(db)
    resp = await client.post("/api/v1/auth/login", json={"email": shop.email, "password": "Password1"})
    headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}

    cart = (await client.post(
        "/api/v1/cart/items",
        json={"product_id": shop.product_id, "qty": 1, "greeting_message": "  Happy birthday, Ammi!  "},
        headers=headers,
    )).json()
    item_id = cart["items"][0]["id"]
    assert cart["items"][0]["greeting_message"] == "Happy birthday, Ammi!"

    cleared = (await client.patch(
        f"/api/v1/cart/items/{item_id}", json={"qty": 1, "greeting_message": "   "}, headers=headers
    )).json()
    assert cleared["items"][0]["greeting_message"] is None

    await client.patch(
        f"/api/v1/cart/items/{item_id}", json={"qty": 1, "greeting_message": "Love, Ali"}, headers=headers
    )
    order = (await client.post("/api/v1/checkout/place", json=_place_body(shop.city_id), headers=headers)).json()
    assert order["items"][0]["greeting_message"] == "Love, Ali"
