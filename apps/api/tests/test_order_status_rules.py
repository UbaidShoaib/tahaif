"""Order status rules: forward only, cancel before dispatch, refund once paid, cancelled/refunded final."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import OrderStatus as S
from app.services import order_status
from tests.test_audit_log import _order
from tests.test_social_orders import _staff_headers


def test_forward_moves_and_skips_allowed() -> None:
    assert order_status.can_move(S.paid, S.preparing)
    assert order_status.can_move(S.preparing, S.delivered)
    assert order_status.can_move(S.delivered, S.completed)


def test_no_going_backward_except_from_hold() -> None:
    assert not order_status.can_move(S.delivered, S.preparing)
    assert not order_status.can_move(S.paid, S.pending_payment)
    assert order_status.can_move(S.dispatched, S.on_hold)
    assert order_status.can_move(S.on_hold, S.pending_payment)


def test_cancel_only_before_dispatch_and_refund_only_once_paid() -> None:
    assert order_status.can_move(S.preparing, S.cancelled)
    assert not order_status.can_move(S.dispatched, S.cancelled)
    assert not order_status.can_move(S.pending_payment, S.refunded)
    assert order_status.can_move(S.completed, S.refunded)


def test_final_statuses_and_every_status_covered() -> None:
    assert order_status.next_statuses(S.cancelled) == []
    assert order_status.next_statuses(S.refunded) == []
    assert set(order_status.TRANSITIONS) == set(S)
    for s, nxt in order_status.TRANSITIONS.items():
        assert s not in nxt


@pytest.mark.asyncio
async def test_api_rejects_disallowed_change_and_lists_next(client: AsyncClient, db: AsyncSession) -> None:
    staff = await _staff_headers(client, db)
    order = await _order(client, db, staff)
    url = f"/api/v1/admin/orders/{order['id']}"

    detail = (await client.get(url, headers=staff)).json()
    assert detail["status"] == "pending_payment"
    assert "delivered" in detail["next_statuses"] and "refunded" not in detail["next_statuses"]

    resp = await client.patch(f"{url}/status", json={"status": "refunded"}, headers=staff)
    assert resp.status_code == 409
    assert "pending payment" in resp.json()["detail"]

    assert (await client.patch(f"{url}/status", json={"status": "cancelled"}, headers=staff)).status_code == 200
    resp = await client.patch(f"{url}/status", json={"status": "paid"}, headers=staff)
    assert resp.status_code == 409

    # Setting the same status again is a harmless no-op.
    assert (await client.patch(f"{url}/status", json={"status": "cancelled"}, headers=staff)).status_code == 200
    listed = (await client.get("/api/v1/admin/orders", headers=staff)).json()["items"]
    assert next(o for o in listed if o["id"] == order["id"])["next_statuses"] == []
