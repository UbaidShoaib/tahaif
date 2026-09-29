import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.workers import run
from app.workers.jobs import JOBS

_URL = "/api/v1/internal/jobs/outbox"


@pytest.fixture
def fake_outbox(monkeypatch: pytest.MonkeyPatch) -> list[AsyncSession]:
    calls: list[AsyncSession] = []

    async def _job(db: AsyncSession) -> int:
        calls.append(db)
        return 3

    monkeypatch.setitem(JOBS, "outbox", _job)
    return calls


@pytest.mark.asyncio
async def test_jobs_endpoint_disabled_without_token(client: AsyncClient, fake_outbox: list[AsyncSession]) -> None:
    response = await client.post(_URL, headers={"Authorization": "Bearer anything"})
    assert response.status_code == 404
    assert fake_outbox == []


@pytest.mark.asyncio
async def test_jobs_endpoint_rejects_wrong_token(
    client: AsyncClient, fake_outbox: list[AsyncSession], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "jobs_token", "s3cret")
    response = await client.post(_URL, headers={"Authorization": "Bearer wrong"})
    assert response.status_code == 401
    missing = await client.post(_URL)
    assert missing.status_code == 401
    assert fake_outbox == []


@pytest.mark.asyncio
async def test_jobs_endpoint_runs_job(
    client: AsyncClient, fake_outbox: list[AsyncSession], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "jobs_token", "s3cret")
    response = await client.post(_URL, headers={"Authorization": "Bearer s3cret"})
    assert response.status_code == 200
    assert response.json() == {"job": "outbox", "processed": 3}
    assert len(fake_outbox) == 1


@pytest.mark.asyncio
async def test_jobs_endpoint_unknown_job(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "jobs_token", "s3cret")
    response = await client.post("/api/v1/internal/jobs/nope", headers={"Authorization": "Bearer s3cret"})
    assert response.status_code == 404


def test_run_cli_rejects_unknown_job(capsys: pytest.CaptureFixture[str]) -> None:
    assert run.main(["nope"]) == 2
    assert run.main([]) == 2
    assert "usage" in capsys.readouterr().err


def test_run_cli_runs_job(fake_outbox: list[AsyncSession]) -> None:
    assert run.main(["outbox"]) == 0
    assert len(fake_outbox) == 1
