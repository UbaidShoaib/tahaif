"""Client IPs behind trusted proxies, and the background worker's jobs."""

from typing import Any

import pytest
from starlette.requests import Request

from app.core import client_ip as cip
from app.core.config import get_settings
from app.workers import main as worker


def _req(peer: str, xff: str | None = None) -> Request:
    headers = [(b"x-forwarded-for", xff.encode())] if xff is not None else []
    return Request({"type": "http", "headers": headers, "client": (peer, 1234)})


@pytest.fixture
def hops(monkeypatch: pytest.MonkeyPatch) -> Any:
    def _set(n: int) -> None:
        monkeypatch.setattr(get_settings(), "trusted_proxy_hops", n)
    return _set


def test_no_trusted_proxy_uses_socket_peer_and_ignores_header(hops: Any) -> None:
    hops(0)
    assert cip.client_ip(_req("10.0.0.5", "6.6.6.6")) == "10.0.0.5"


def test_one_hop_takes_the_address_the_proxy_appended(hops: Any) -> None:
    hops(1)
    assert cip.client_ip(_req("10.0.0.5", "203.0.113.9")) == "203.0.113.9"
    # A client-supplied spoof sits to the left and is ignored.
    assert cip.client_ip(_req("10.0.0.5", "1.2.3.4, 203.0.113.9")) == "203.0.113.9"


def test_two_hops_for_cloudflare_in_front(hops: Any) -> None:
    hops(2)
    assert cip.client_ip(_req("10.0.0.5", "1.2.3.4, 203.0.113.9, 172.64.0.1")) == "203.0.113.9"


def test_missing_header_falls_back_to_peer(hops: Any) -> None:
    hops(1)
    assert cip.client_ip(_req("10.0.0.5")) == "10.0.0.5"


def test_rate_limiter_keys_on_real_client_ip() -> None:
    from app.core.rate_limit import limiter
    assert limiter._key_func is cip.client_ip  # noqa: SLF001


def test_worker_schedules_outbox_and_fx() -> None:
    names = {job.name for job in worker.WorkerSettings.cron_jobs}
    assert names == {"cron:drain_outbox", "cron:refresh_fx"}


@pytest.mark.asyncio
async def test_worker_jobs_run_with_a_session(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    async def fake_drain(db: Any) -> int:
        calls.append("drain")
        return 2

    async def fake_fx(db: Any) -> int:
        calls.append("fx")
        return 7

    monkeypatch.setattr(worker, "drain_pending", fake_drain)
    monkeypatch.setattr(worker, "refresh_fx_rates", fake_fx)
    assert await worker.drain_outbox({}) == 2
    assert await worker.refresh_fx({}) == 7
    assert calls == ["drain", "fx"]


# ── Outbox draining ───────────────────────────────────────────────────────────

import asyncio  # noqa: E402
import json  # noqa: E402
import uuid  # noqa: E402

import sqlalchemy as sa  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession  # noqa: E402

from app.workers import outbox_worker  # noqa: E402


async def _add_rows(db: AsyncSession, n: int) -> list[str]:
    ids = []
    for i in range(n):
        rid = uuid.uuid4()
        await db.execute(sa.text(
            "INSERT INTO notifications_outbox (id, channel, to_address, template, payload, created_at) "
            "VALUES (:id, 'email', :to, 'order_confirmation', CAST(:p AS jsonb), NOW() + make_interval(secs => :i))"
        ), {"id": rid, "to": f"b{i}@example.com", "p": json.dumps({"public_token": "t", "total_pkr": 1}), "i": i})
        ids.append(str(rid))
    await db.commit()
    return ids


async def _states(db: AsyncSession, ids: list[str]) -> list[tuple[str, int]]:
    rows = (await db.execute(sa.text(
        "SELECT id::text, status::text, attempts FROM notifications_outbox WHERE id::text = ANY(:ids)"
    ), {"ids": ids})).all()
    by_id = {r[0]: (r[1], r[2]) for r in rows}
    return [by_id[i] for i in ids]


@pytest.mark.asyncio
async def test_drain_records_each_row_outcome(outbox: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:  # noqa: F811
    ids = await _add_rows(outbox, 3)
    seen: list[str] = []

    async def dispatch(_c: str, to: str, _t: str, _p: dict[str, Any]) -> None:
        seen.append(to)
        if to == "b1@example.com":
            raise RuntimeError("provider down")

    monkeypatch.setattr(outbox_worker, "_dispatch", dispatch)
    assert await outbox_worker.drain_pending(outbox) == 3
    assert await _states(outbox, ids) == [("sent", 1), ("pending", 1), ("sent", 1)]


@pytest.mark.asyncio
async def test_crash_mid_batch_keeps_sent_rows_marked(outbox: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:  # noqa: F811
    ids = await _add_rows(outbox, 3)

    async def dispatch(_c: str, to: str, _t: str, _p: dict[str, Any]) -> None:
        if to == "b1@example.com":
            raise asyncio.CancelledError  # worker killed while sending the second message

    monkeypatch.setattr(outbox_worker, "_dispatch", dispatch)
    with pytest.raises(asyncio.CancelledError):
        await outbox_worker.drain_pending(outbox)
    await outbox.rollback()
    # The first message is recorded as sent, so a restart will not send it again.
    assert await _states(outbox, ids) == [("sent", 1), ("pending", 0), ("pending", 0)]


@pytest.mark.asyncio
async def test_unconfigured_twilio_fails_instead_of_pretending_to_send(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.integrations import twilio_client

    monkeypatch.setattr(get_settings(), "twilio_account_sid", "")
    with pytest.raises(twilio_client.TwilioNotConfiguredError):
        await twilio_client.send_sms("+923001234567", "hi")
    with pytest.raises(twilio_client.TwilioNotConfiguredError):
        await twilio_client.send_whatsapp("+923001234567", "hi")
