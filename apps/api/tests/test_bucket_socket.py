"""Live bucket editing over the WebSocket, fanned out through Redis (ADR 0014)."""

import asyncio
from collections.abc import AsyncIterator, Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import NullPool
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from starlette.testclient import WebSocketTestSession

from app.core import realtime
from app.core.db import get_db, get_session_factory
from app.main import app as fastapi_app
from tests.conftest import TEST_DB_URL
from tests.test_buckets import _make_builder, _Ref


@pytest.fixture
def builder() -> tuple[_Ref, _Ref, _Ref]:
    async def make() -> tuple[_Ref, _Ref, _Ref]:
        engine = create_async_engine(TEST_DB_URL, poolclass=NullPool)
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            refs = await _make_builder(db)
        await engine.dispose()
        return refs

    return asyncio.run(make())


@pytest.fixture
def client() -> Iterator[TestClient]:
    # NullPool: TestClient runs the app on its own event loop.
    factory = async_sessionmaker(
        create_async_engine(TEST_DB_URL, poolclass=NullPool), class_=AsyncSession, expire_on_commit=False
    )

    async def _db() -> AsyncIterator[AsyncSession]:
        async with factory() as session:
            yield session
            await session.commit()

    fastapi_app.dependency_overrides[get_db] = _db
    fastapi_app.dependency_overrides[get_session_factory] = lambda: factory
    with TestClient(fastapi_app) as c:
        yield c
    fastapi_app.dependency_overrides.clear()


def _until(ws: WebSocketTestSession, kind: str) -> dict[str, Any]:
    for _ in range(20):
        message: dict[str, Any] = ws.receive_json()
        if message["type"] == kind:
            return message
    raise AssertionError(f"no {kind} message")


def _start(client: TestClient, base: _Ref) -> tuple[str, str]:
    body = client.post("/api/v1/buckets", json={"builder_slug": base.slug}).json()
    return body["id"], body["share_token"]


def test_edit_reaches_every_editor(client: TestClient, builder: tuple[_Ref, _Ref, _Ref]) -> None:
    base, rose, _ = builder
    bucket_id, token = _start(client, base)
    url = f"/api/v1/buckets/{bucket_id}/ws?t={token}"

    with client.websocket_connect(url + "&name=Ayesha") as a, client.websocket_connect(url + "&name=Bilal") as b:
        assert _until(a, "snapshot")["bucket"]["version"] == 0
        _until(b, "snapshot")
        presence = _until(a, "presence")
        while len(presence["editors"]) < 2:
            presence = _until(a, "presence")
        assert {e["name"] for e in presence["editors"]} == {"Ayesha", "Bilal"}

        a.send_json({"type": "edit", "client_op_id": "op-1", "edit": {"op": "add", "component_id": str(rose.id), "qty": 2}})
        assert _until(a, "ack") == {"type": "ack", "client_op_id": "op-1", "version": 1}
        update = _until(b, "bucket")
        assert update["client_op_id"] == "op-1"
        assert update["bucket"]["total_pkr"] == 50000 + 2 * 25000

        b.send_json({"type": "cursor", "x": 0.2, "y": 0.7})
        assert _until(a, "cursor")["x"] == 0.2


def test_bad_edit_is_rejected_with_fresh_state(client: TestClient, builder: tuple[_Ref, _Ref, _Ref]) -> None:
    base, rose, _ = builder
    bucket_id, token = _start(client, base)

    with client.websocket_connect(f"/api/v1/buckets/{bucket_id}/ws?t={token}") as ws:
        _until(ws, "snapshot")
        ws.send_json({"type": "edit", "client_op_id": "x", "edit": {"op": "add", "component_id": str(rose.id), "qty": 9}})
        reject = _until(ws, "reject")
        assert reject["client_op_id"] == "x"
        assert reject["bucket"]["version"] == 0

        ws.send_json({"type": "edit", "client_op_id": "y", "edit": {"op": "nonsense"}})
        assert _until(ws, "reject")["detail"] == "Invalid edit"


def test_wrong_token_is_refused(client: TestClient, builder: tuple[_Ref, _Ref, _Ref]) -> None:
    base, _, _ = builder
    bucket_id, _ = _start(client, base)
    from starlette.websockets import WebSocketDisconnect

    with pytest.raises(WebSocketDisconnect) as exc, client.websocket_connect(f"/api/v1/buckets/{bucket_id}/ws?t={'z' * 32}"):
        pass
    assert exc.value.code == 4404


def test_closed_socket_leaves_no_ghost_editor(client: TestClient, builder: tuple[_Ref, _Ref, _Ref]) -> None:
    # React dev mode opens a socket and closes it at once; it must not stay listed.
    base, _, _ = builder
    bucket_id, token = _start(client, base)
    with client.websocket_connect(f"/api/v1/buckets/{bucket_id}/ws?t={token}&name=Brief") as ws:
        _until(ws, "snapshot")

    async def editors_after_cleanup() -> list[dict[str, Any]]:
        import app.core.redis_client as redis_client

        redis_client._redis = None  # a client for this event loop
        for _ in range(40):
            editors = await realtime.editors(bucket_id)
            if not editors:
                break
            await asyncio.sleep(0.05)
        return editors

    assert asyncio.run(editors_after_cleanup()) == []
