"""Login keeps working when Redis is down; admin receipt links are signed."""

import uuid
from typing import Any

import pytest
from httpx import AsyncClient
from redis.exceptions import ConnectionError as RedisConnectionError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.user import UserRole
from app.repositories.user_repository import UserRepository


class _DownRedis:
    """Every call fails the way redis-py does when the server is unreachable."""

    def __getattr__(self, _name: str) -> Any:
        async def _fail(*_a: object, **_k: object) -> None:
            raise RedisConnectionError("Error 111 connecting to localhost:6380. Connection refused.")
        return _fail


@pytest.mark.asyncio
async def test_login_works_while_redis_is_down(
    client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    email = f"redisdown_{uuid.uuid4().hex[:8]}@example.com"
    await UserRepository(db).create(email=email, password_hash=hash_password("Password1"), role=UserRole.customer)
    await db.commit()
    monkeypatch.setattr("app.api.v1.endpoints.auth.get_redis", lambda: _DownRedis())

    wrong = await client.post("/api/v1/auth/login", json={"email": email, "password": "nope-nope"})
    right = await client.post("/api/v1/auth/login", json={"email": email, "password": "Password1"})

    assert wrong.status_code == 401  # not 500: the failed attempt just isn't counted
    assert right.status_code == 200
    assert right.json()["access_token"]


# ── Signed receipt links ──────────────────────────────────────────────────────

from urllib.parse import parse_qs, urlparse  # noqa: E402

from app.integrations import s3_client  # noqa: E402
from app.services import proof_service  # noqa: E402


@pytest.mark.parametrize(("url", "key"), [
    ("http://localhost:9000/tahaif-media/proofs/o1/receipt.png", "proofs/o1/receipt.png"),
    ("https://tahaif-media.s3.amazonaws.com/proofs/o2/receipt.pdf", "proofs/o2/receipt.pdf"),
    ("https://cdn.example.com/proofs/o3/receipt.jpg?v=1", "proofs/o3/receipt.jpg"),
    ("https://cdn.example.com/other/file.png", None),
    (None, None),
])
def test_object_key_from_stored_url(url: str | None, key: str | None) -> None:
    assert s3_client.object_key_from_url(url) == key


def test_signed_proof_url_is_short_lived_and_signed() -> None:
    signed = proof_service.signed_proof_url("http://localhost:9000/tahaif-media/proofs/o1/receipt.png")
    assert signed is not None
    parsed = urlparse(signed)
    params = parse_qs(parsed.query)
    assert parsed.path.endswith("/proofs/o1/receipt.png")
    assert params["X-Amz-Expires"] == [str(s3_client.SIGNED_URL_TTL_SECS)]
    assert "X-Amz-Signature" in params


def test_signed_proof_url_degrades_to_none(monkeypatch: pytest.MonkeyPatch) -> None:
    def _broken(_key: str, expires_in: int = 0) -> str:  # noqa: ARG001
        raise RuntimeError("no credentials")

    monkeypatch.setattr(s3_client, "presign_get", _broken)
    assert proof_service.signed_proof_url("http://x/tahaif-media/proofs/o1/receipt.png") is None
    assert proof_service.signed_proof_url("http://x/not-a-receipt.png") is None


@pytest.mark.asyncio
async def test_admin_order_list_serves_signed_receipt_links(client: AsyncClient, db: AsyncSession) -> None:
    from datetime import date, timedelta

    from app.models.catalog import ProductCity
    from app.models.order import Payment
    from app.repositories.catalog_repository import (
        CityRepository,
        ProductRepository,
        VendorRepository,
    )

    tag = uuid.uuid4().hex[:8]
    buyer = await UserRepository(db).create(email=f"pb_{tag}@example.com", password_hash=hash_password("Password1"), role=UserRole.customer)
    await UserRepository(db).create(email=f"pa_{tag}@example.com", password_hash=hash_password("Password1"), role=UserRole.admin)
    city = await CityRepository(db).create(name=f"R City {tag}", slug=f"r-city-{tag}", timezone="Asia/Karachi")
    vendor = await VendorRepository(db).create(city_id=city.id, name=f"R Vendor {tag}", slug=f"r-vendor-{tag}")
    product = await ProductRepository(db).create(vendor_id=vendor.id, name=f"R Cake {tag}", slug=f"r-cake-{tag}", base_price_pkr=50_000)
    db.add(ProductCity(product_id=product.id, city_id=city.id, delivery_fee_pkr=10_000, lead_time_hours=24))
    buyer_email, product_id, city_id = buyer.email, str(product.id), str(city.id)
    await db.commit()

    async def login(email: str) -> dict[str, str]:
        r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Password1"})
        return {"Authorization": f"Bearer {r.json()['access_token']}"}

    bh = await login(buyer_email)
    await client.post("/api/v1/cart/items", json={"product_id": product_id, "qty": 1}, headers=bh)
    order = (await client.post("/api/v1/checkout/place", headers=bh, json={
        "payment_method": "bank_transfer", "delivery_city_id": city_id,
        "delivery_date": (date.today() + timedelta(days=2)).isoformat(),
        "recipient_name": "Ammi", "recipient_phone": "+923001234567", "address_line1": "House 5 Street 10",
    })).json()
    stored = f"http://localhost:9000/tahaif-media/proofs/{order['id']}/receipt.png"
    from sqlalchemy import update
    await db.execute(update(Payment).where(Payment.order_id == uuid.UUID(order["id"])).values(proof_url=stored))
    await db.commit()

    rows = (await client.get("/api/v1/admin/orders?status=pending_payment&limit=100", headers=await login(f"pa_{tag}@example.com"))).json()["items"]
    row = next(r for r in rows if r["id"] == order["id"])

    assert row["proof_url"] != stored
    assert f"/proofs/{order['id']}/receipt.png" in row["proof_url"]
    assert "X-Amz-Signature" in row["proof_url"]
