"""Back-office order search: by code, phone, name and date, with paging."""

import random
import uuid
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.admin_order_service import parse_query
from tests.test_social_orders import _body, _catalog, _place, _staff_headers

API = "/api/v1/admin/orders"


def _local_phone() -> tuple[str, str]:
    """A recipient number as staff might type it, and its last 10 digits."""
    tail = f"3{random.randint(100000000, 999999999)}"
    return f"0{tail[:3]} {tail[3:]}", tail


async def _order(client: AsyncClient, db: AsyncSession, headers: dict[str, str], **extra: object) -> dict:
    product_id, city_id = await _catalog(db)
    return (await _place(client, headers, _body(product_id, city_id, **extra)))["order"]


async def _search(client: AsyncClient, headers: dict[str, str], **params: object) -> dict:
    resp = await client.get(API, params=params, headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_query_is_split_into_code_phone_or_name() -> None:
    assert parse_query("+92 300 123-4567") == {"text": None, "digits": "3001234567", "token_prefix": None}
    assert parse_query("#3F9A2C1B") == {"text": "#3F9A2C1B", "digits": None, "token_prefix": "3f9a2c1b"}
    assert parse_query("Ammi") == {"text": "Ammi", "digits": None, "token_prefix": None}
    assert parse_query("  ") == {"text": None, "digits": None, "token_prefix": None}


@pytest.mark.asyncio
async def test_finds_order_by_recipient_phone_in_any_format(client: AsyncClient, db: AsyncSession) -> None:
    headers = await _staff_headers(client, db)
    typed, tail = _local_phone()
    order = await _order(client, db, headers, recipient_phone=typed)

    for q in (typed, f"+92{tail}", f"92 {tail[:3]} {tail[3:]}", tail[-7:]):
        page = await _search(client, headers, q=q)
        assert [o["id"] for o in page["items"]] == [order["id"]], q


@pytest.mark.asyncio
async def test_finds_order_by_code_and_recipient_name(client: AsyncClient, db: AsyncSession) -> None:
    headers = await _staff_headers(client, db)
    name = f"Nani {uuid.uuid4().hex[:8]}"
    order = await _order(client, db, headers, recipient_name=name)

    by_name = await _search(client, headers, q=name.lower())
    assert [o["id"] for o in by_name["items"]] == [order["id"]]
    row = by_name["items"][0]
    assert row["recipients"] == [name] and row["delivery_date"] is not None

    code = "#" + order["public_token"][:8].upper()
    assert order["id"] in [o["id"] for o in (await _search(client, headers, q=code))["items"]]


@pytest.mark.asyncio
async def test_date_range_uses_pakistan_days(client: AsyncClient, db: AsyncSession) -> None:
    headers = await _staff_headers(client, db)
    name = f"Khala {uuid.uuid4().hex[:8]}"
    await _order(client, db, headers, recipient_name=name)
    today = datetime.now(UTC).astimezone(ZoneInfo("Asia/Karachi")).date()
    yesterday = today - timedelta(days=1)

    assert (await _search(client, headers, q=name, placed_from=today, placed_to=today))["total"] == 1
    assert (await _search(client, headers, q=name, placed_to=yesterday))["total"] == 0
    assert (await _search(client, headers, q=name, placed_from=today + timedelta(days=1)))["total"] == 0


@pytest.mark.asyncio
async def test_pages_report_the_total(client: AsyncClient, db: AsyncSession) -> None:
    headers = await _staff_headers(client, db)
    name = f"Phupho {uuid.uuid4().hex[:8]}"
    ids = [(await _order(client, db, headers, recipient_name=name))["id"] for _ in range(3)]

    first = await _search(client, headers, q=name, limit=2)
    second = await _search(client, headers, q=name, limit=2, offset=2)

    assert (first["total"], len(first["items"]), len(second["items"])) == (3, 2, 1)
    assert sorted(o["id"] for o in first["items"] + second["items"]) == sorted(ids)
    # Newest first.
    assert first["items"][0]["id"] == ids[-1]


@pytest.mark.asyncio
async def test_status_filter_still_applies(client: AsyncClient, db: AsyncSession) -> None:
    headers = await _staff_headers(client, db)
    name = f"Chachi {uuid.uuid4().hex[:8]}"
    await _order(client, db, headers, recipient_name=name)

    assert (await _search(client, headers, q=name, status="pending_payment"))["total"] == 1
    assert (await _search(client, headers, q=name, status="delivered"))["total"] == 0


@pytest.mark.asyncio
async def test_rejects_bad_paging_and_guests(client: AsyncClient, db: AsyncSession) -> None:
    headers = await _staff_headers(client, db)
    assert (await client.get(API, params={"limit": 500}, headers=headers)).status_code == 422
    assert (await client.get(API)).status_code == 401
