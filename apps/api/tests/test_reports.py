"""Sales by channel and reel/campaign (ADR 0009, Phase 8 P1)."""
import uuid
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import UserRole
from app.services.checkout_service import normalize_campaign
from tests.test_checkout import _login, _make_user
from tests.test_guest_checkout import _catalog, _guest_add, _place_body
from tests.test_social_orders import _body, _place


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("Eid Reel ", "eid-reel"), ("eid-reel", "eid-reel"), ("  ", None), (None, None)],
)
def test_normalize_campaign(raw: str | None, expected: str | None) -> None:
    assert normalize_campaign(raw) == expected


def _row(report: dict[str, Any], source: str, campaign: str) -> dict[str, Any] | None:
    return next((r for r in report["rows"] if r["source"] == source and r["campaign"] == campaign), None)


@pytest.mark.asyncio
async def test_campaign_report_groups_counts_and_sums(client: AsyncClient, db: AsyncSession) -> None:
    staff = await _make_user(db, role=UserRole.staff)
    headers = {"Authorization": f"Bearer {await _login(client, staff.email)}"}
    product_id, city_id = await _catalog(db)
    tag = f"reel-{uuid.uuid4().hex[:6]}"

    # Two Instagram orders from the reel (typed differently), one paid; one cancelled.
    paid = (await _place(client, headers, _body(product_id, city_id, campaign=tag.upper())))["order"]
    await _place(client, headers, _body(product_id, city_id, campaign=f" {tag} "))
    cancelled = (await _place(client, headers, _body(product_id, city_id, campaign=tag)))["order"]
    await client.post(f"/api/v1/admin/orders/{paid['id']}/verify-payment", json={"verified": True}, headers=headers)
    await client.patch(f"/api/v1/admin/orders/{cancelled['id']}/status", json={"status": "cancelled"}, headers=headers)

    # A website order from the same reel's link.
    token = (await _guest_add(client, product_id))["guest_token"]
    resp = await client.post(
        "/api/v1/checkout/place",
        json=_place_body(city_id, contact_email="g@example.com", contact_phone="+923001112233", campaign=tag),
        headers={"X-Cart-Token": token},
    )
    assert resp.status_code == 201, resp.text

    report = (await client.get("/api/v1/admin/reports/campaigns?days=7", headers=headers)).json()
    assert report["days"] == 7

    ig = _row(report, "instagram", tag)
    assert ig == {
        "source": "instagram",
        "campaign": tag,
        "orders": 2,
        "paid_orders": 1,
        "revenue_pkr": paid["total_pkr"],
        "avg_order_pkr": paid["total_pkr"],
    }
    web = _row(report, "web", tag)
    assert web is not None and web["orders"] == 1 and web["paid_orders"] == 0 and web["avg_order_pkr"] == 0

    revenues = [r["revenue_pkr"] for r in report["rows"]]
    assert revenues == sorted(revenues, reverse=True)
    assert report["total_orders"] == sum(r["orders"] for r in report["rows"])


@pytest.mark.asyncio
async def test_campaign_report_is_staff_only(client: AsyncClient, db: AsyncSession) -> None:
    customer = await _make_user(db)
    headers = {"Authorization": f"Bearer {await _login(client, customer.email)}"}
    assert (await client.get("/api/v1/admin/reports/campaigns", headers=headers)).status_code == 403


@pytest.mark.asyncio
async def test_campaign_report_rejects_bad_range(client: AsyncClient, db: AsyncSession) -> None:
    staff = await _make_user(db, role=UserRole.staff)
    headers = {"Authorization": f"Bearer {await _login(client, staff.email)}"}
    assert (await client.get("/api/v1/admin/reports/campaigns?days=0", headers=headers)).status_code == 422
