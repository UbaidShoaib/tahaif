import uuid
from decimal import Decimal
from typing import Any

import pytest
import sqlalchemy as sa
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.catalog import FxRate, FxRateSource
from app.workers import fx_rate_worker, outbox_worker
from app.workers.notification_tasks import enqueue_order_confirmation

# ── Outbox drain ──────────────────────────────────────────────────────────────


async def _outbox_rows(db: AsyncSession, to_addresses: list[str]) -> dict[str, tuple[str, int]]:
    rows = (await db.execute(
        sa.text("SELECT to_address, status, attempts FROM notifications_outbox WHERE to_address = ANY(:a)"),
        {"a": to_addresses},
    )).all()
    return {r.to_address: (r.status, r.attempts) for r in rows}


@pytest.mark.asyncio
async def test_drain_marks_sent_and_retries_failures(db: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    ok_email = f"ok-{uuid.uuid4().hex[:8]}@example.com"
    bad_email = f"bad-{uuid.uuid4().hex[:8]}@example.com"
    phone = f"+92300{uuid.uuid4().int % 10_000_000:07d}"
    for email, ph in ((ok_email, phone), (bad_email, None)):
        await enqueue_order_confirmation(
            db, order_id=uuid.uuid4(), user_email=email, user_phone=ph,
            order_total_pkr=250_000, public_token=uuid.uuid4(),
        )
    await db.commit()

    sent: list[tuple[str, str]] = []

    async def _dispatch(channel: str, to_address: str, template: str, payload: dict[str, Any]) -> None:  # noqa: ARG001
        if to_address == bad_email:
            raise RuntimeError("provider down")
        sent.append((channel, to_address))

    monkeypatch.setattr(outbox_worker, "_dispatch", _dispatch)

    # Three passes: the failing row is retried until it hits _MAX_ATTEMPTS.
    for _ in range(3):
        await outbox_worker.drain_pending(db)

    rows = await _outbox_rows(db, [ok_email, bad_email, phone])
    assert rows[ok_email] == ("sent", 1)
    assert rows[phone] == ("sent", 1)
    assert rows[bad_email] == ("failed", 3)
    assert ("email", ok_email) in sent and ("sms", phone) in sent


def test_render_sms_formats_pkr() -> None:
    token = uuid.uuid4()
    text = outbox_worker._render_sms("order_confirmation_sms", {"public_token": str(token), "total_pkr": 250_000})
    assert "PKR 2,500" in text
    assert str(token) in text
    assert outbox_worker._render_sms("other", {}) == "Tahaif notification: other"


# ── FX refresh ────────────────────────────────────────────────────────────────


class _FakeResponse:
    def __init__(self, data: dict[str, Any]) -> None:
        self._data = data

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, Any]:
        return self._data


def _fake_client(rates: dict[str, float]) -> type:
    class _Client:
        def __init__(self, **_: Any) -> None:
            pass

        async def __aenter__(self) -> "_Client":
            return self

        async def __aexit__(self, *_: Any) -> None:
            return None

        async def get(self, *_: Any, **__: Any) -> _FakeResponse:
            return _FakeResponse({"rates": rates})

    return _Client


@pytest.mark.asyncio
async def test_fx_refresh_skipped_without_app_id(db: AsyncSession) -> None:
    assert get_settings().open_exchange_rates_app_id == ""
    assert await fx_rate_worker.refresh_fx_rates(db) == 0


@pytest.mark.asyncio
async def test_fx_refresh_inserts_then_updates(db: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "open_exchange_rates_app_id", "test-app-id")
    rates = {"PKR": 280.0, "USD": 1.0, "GBP": 0.8, "EUR": 0.9, "CAD": 1.35, "AUD": 1.5, "AED": 3.67}  # no SAR
    monkeypatch.setattr(fx_rate_worker, "AsyncClient", _fake_client(rates))

    assert await fx_rate_worker.refresh_fx_rates(db) == 6

    usd = (await db.execute(select(FxRate).where(
        FxRate.quote_currency == "USD", FxRate.source == FxRateSource.auto,
    ))).scalar_one()
    assert usd.rate == Decimal("0.003571")  # 1 PKR in USD

    rates["PKR"] = 300.0
    assert await fx_rate_worker.refresh_fx_rates(db) == 6
    await db.refresh(usd)
    assert usd.rate == Decimal("0.003333")


@pytest.mark.asyncio
async def test_fx_refresh_without_pkr_rate(db: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "open_exchange_rates_app_id", "test-app-id")
    monkeypatch.setattr(fx_rate_worker, "AsyncClient", _fake_client({"USD": 1.0}))
    assert await fx_rate_worker.refresh_fx_rates(db) == 0
