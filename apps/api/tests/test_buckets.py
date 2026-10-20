"""Custom buckets (ADR 0014): building, limits, pricing and checkout into the cart."""

import uuid
from dataclasses import dataclass
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bucket import BuilderComponent, BuilderKind, ComponentRole
from app.models.catalog import Product, ProductCity
from tests.test_cart import _login, _make_city, _make_user, _make_vendor
from tests.test_guest_checkout import _place_body


@dataclass(frozen=True)
class _Ref:
    """Plain ids/slugs: the client fixture expires ORM objects after each request."""

    id: uuid.UUID
    slug: str
    city_id: uuid.UUID | None = None


async def _make_builder(db: AsyncSession, max_items: int = 5) -> tuple[_Ref, _Ref, _Ref]:
    """A bouquet base (PKR 500) with roses (PKR 250, max 3) and lilies (PKR 350)."""
    city = await _make_city(db)
    vendor = await _make_vendor(db, city)
    s = uuid.uuid4().hex[:6]
    base = Product(
        vendor_id=vendor.id, name="Build a Bouquet", slug=f"byo-{s}", base_price_pkr=50000,
        builder_kind=BuilderKind.BOUQUET, builder_min_items=2, builder_max_items=max_items,
    )
    rose = Product(vendor_id=vendor.id, name="Rose", slug=f"rose-{s}", base_price_pkr=25000)
    lily = Product(vendor_id=vendor.id, name="Lily", slug=f"lily-{s}", base_price_pkr=35000)
    db.add_all([base, rose, lily])
    await db.flush()
    db.add_all([
        BuilderComponent(builder_product_id=base.id, component_product_id=rose.id, role=ComponentRole.STEM, max_qty=3),
        BuilderComponent(builder_product_id=base.id, component_product_id=lily.id, role=ComponentRole.STEM, max_qty=5),
    ])
    db.add(ProductCity(product_id=base.id, city_id=city.id, delivery_fee_pkr=25000))
    await db.commit()
    base_ref = _Ref(base.id, base.slug, city.id)
    rose_ref, lily_ref = (_Ref(p.id, p.slug) for p in (rose, lily))
    return base_ref, rose_ref, lily_ref


async def _start(client: AsyncClient, base: _Ref, headers: dict[str, str] | None = None) -> tuple[str, str]:
    resp = await client.post("/api/v1/buckets", json={"builder_slug": base.slug}, headers=headers or {})
    assert resp.status_code == 201, resp.text
    body = resp.json()
    return body["id"], body["share_token"]


async def _edit(client: AsyncClient, bucket_id: str, token: str, edit: dict[str, object]):  # type: ignore[no-untyped-def]
    return await client.post(f"/api/v1/buckets/{bucket_id}/edits?t={token}", json={"edit": edit})


@pytest.mark.asyncio
async def test_builder_lists_components(client: AsyncClient, db: AsyncSession) -> None:
    base, rose, lily = await _make_builder(db)
    resp = await client.get(f"/api/v1/builders/{base.slug}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["kind"] == "bouquet"
    assert {c["product_id"] for c in body["components"]} == {str(rose.id), str(lily.id)}


@pytest.mark.asyncio
async def test_edits_update_pieces_and_server_side_total(client: AsyncClient, db: AsyncSession) -> None:
    base, rose, lily = await _make_builder(db)
    bucket_id, token = await _start(client, base)

    resp = await _edit(client, bucket_id, token, {"op": "add", "component_id": str(rose.id), "qty": 2, "x": 0.3, "y": 0.4})
    assert resp.status_code == 200, resp.text
    resp = await _edit(client, bucket_id, token, {"op": "add", "component_id": str(lily.id)})
    body = resp.json()
    assert body["version"] == 2
    assert body["item_count"] == 3
    assert body["total_pkr"] == 50000 + 2 * 25000 + 35000

    key = body["pieces"][0]["key"]
    body = (await _edit(client, bucket_id, token, {"op": "move", "key": key, "x": 0.9, "y": 0.1, "rotation": 15})).json()
    assert (body["pieces"][0]["x"], body["pieces"][0]["rotation"]) == (0.9, 15)

    body = (await _edit(client, bucket_id, token, {"op": "remove", "key": key})).json()
    assert body["item_count"] == 1 and body["version"] == 4
    # The token is never echoed after creation.
    assert body["share_token"] is None


@pytest.mark.asyncio
async def test_limits_are_enforced(client: AsyncClient, db: AsyncSession) -> None:
    base, rose, lily = await _make_builder(db, max_items=4)
    bucket_id, token = await _start(client, base)

    resp = await _edit(client, bucket_id, token, {"op": "add", "component_id": str(rose.id), "qty": 4})
    assert resp.status_code == 409  # rose max_qty is 3

    await _edit(client, bucket_id, token, {"op": "add", "component_id": str(lily.id), "qty": 3})
    resp = await _edit(client, bucket_id, token, {"op": "add", "component_id": str(rose.id), "qty": 2})
    assert resp.status_code == 409  # bucket holds at most 4

    stranger = await _make_vendor(db, await _make_city(db))
    other = Product(vendor_id=stranger.id, name="Other", slug=f"o-{uuid.uuid4().hex[:6]}", base_price_pkr=1)
    db.add(other)
    await db.commit()
    other_id = other.id
    resp = await _edit(client, bucket_id, token, {"op": "add", "component_id": str(other_id)})
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_edit_on_removed_piece_conflicts(client: AsyncClient, db: AsyncSession) -> None:
    base, rose, _ = await _make_builder(db)
    bucket_id, token = await _start(client, base)
    key = (await _edit(client, bucket_id, token, {"op": "add", "component_id": str(rose.id)})).json()["pieces"][0]["key"]
    await _edit(client, bucket_id, token, {"op": "remove", "key": key})
    resp = await _edit(client, bucket_id, token, {"op": "move", "key": key, "x": 0.1, "y": 0.1})
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_wrong_token_is_not_found(client: AsyncClient, db: AsyncSession) -> None:
    base, _, _ = await _make_builder(db)
    bucket_id, _ = await _start(client, base)
    resp = await client.get(f"/api/v1/buckets/{bucket_id}?t={'x' * 32}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_add_to_cart_prices_line_and_locks_bucket(client: AsyncClient, db: AsyncSession) -> None:
    base, rose, lily = await _make_builder(db)
    bucket_id, token = await _start(client, base)

    resp = await client.post(f"/api/v1/buckets/{bucket_id}/cart?t={token}")
    assert resp.status_code == 409  # min 2 items

    await _edit(client, bucket_id, token, {"op": "add", "component_id": str(rose.id), "qty": 2})
    await _edit(client, bucket_id, token, {"op": "add", "component_id": str(lily.id)})
    resp = await client.post(f"/api/v1/buckets/{bucket_id}/cart?t={token}")
    assert resp.status_code == 201, resp.text
    cart = resp.json()
    assert cart["guest_token"]
    [line] = cart["items"]
    assert line["product_id"] == str(base.id)
    assert line["line_total_pkr"] == 50000 + 2 * 25000 + 35000

    # Locked once it's in a cart.
    resp = await _edit(client, bucket_id, token, {"op": "clear"})
    assert resp.status_code == 409

    # A second bucket from the same base is its own cart line, not merged.
    second_id, second_token = await _start(client, base)
    await _edit(client, second_id, second_token, {"op": "add", "component_id": str(lily.id), "qty": 2})
    resp = await client.post(
        f"/api/v1/buckets/{second_id}/cart?t={second_token}", headers={"X-Cart-Token": cart["guest_token"]}
    )
    assert len(resp.json()["items"]) == 2


@pytest.mark.asyncio
async def test_only_signed_in_owner_can_check_out(client: AsyncClient, db: AsyncSession) -> None:
    base, rose, _ = await _make_builder(db)
    owner = await _make_user(db)
    await db.commit()
    email = owner.email
    auth = {"Authorization": f"Bearer {await _login(client, email)}"}
    bucket_id, token = await _start(client, base, headers=auth)
    await _edit(client, bucket_id, token, {"op": "add", "component_id": str(rose.id), "qty": 2})

    resp = await client.post(f"/api/v1/buckets/{bucket_id}/cart?t={token}")
    assert resp.status_code == 403
    resp = await client.post(f"/api/v1/buckets/{bucket_id}/cart?t={token}", headers=auth)
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_checkout_keeps_bucket_price_and_contents(client: AsyncClient, db: AsyncSession) -> None:
    base, rose, lily = await _make_builder(db)
    bucket_id, token = await _start(client, base)
    await _edit(client, bucket_id, token, {"op": "add", "component_id": str(rose.id), "qty": 3})
    await _edit(client, bucket_id, token, {"op": "add", "component_id": str(lily.id)})
    cart = (await client.post(f"/api/v1/buckets/{bucket_id}/cart?t={token}")).json()

    with patch("app.workers.notification_tasks.enqueue_order_confirmation", new_callable=AsyncMock):
        resp = await client.post(
            "/api/v1/checkout/place",
            json=_place_body(str(base.city_id), contact_email="b@example.com", contact_phone="+447700900123"),
            headers={"X-Cart-Token": cart["guest_token"], "Idempotency-Key": str(uuid.uuid4())},
        )
    assert resp.status_code == 201, resp.text
    order = resp.json()
    assert order["subtotal_pkr"] == 50000 + 3 * 25000 + 35000
    [item] = order["items"]
    assert item["bucket_contents"] == ["3 × Rose", "1 × Lily"]
