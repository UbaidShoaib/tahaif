"""The DB session must commit before the response is sent.

FastAPI's default dependency scope runs yield-dependency cleanup after the
response is on the wire. With that, a client could refresh right after login
before the new refresh token was committed, and a commit failure would still
have reached the client as a success. deps.DB uses scope="function".
"""

from collections.abc import AsyncIterator, MutableMapping
from typing import Any

import pytest
from fastapi import FastAPI, HTTPException

from app.core.db import get_db
from app.core.deps import DB


class _RecordingSession:
    def __init__(self, events: list[str]) -> None:
        self.events = events

    async def commit(self) -> None:
        self.events.append("commit")

    async def rollback(self) -> None:
        self.events.append("rollback")


def _app(events: list[str], fail: bool = False) -> FastAPI:
    app = FastAPI()

    async def _session() -> AsyncIterator[_RecordingSession]:
        session = _RecordingSession(events)
        try:
            yield session
            await session.commit()
        except HTTPException:
            await session.commit()
            raise

    app.dependency_overrides[get_db] = _session

    @app.get("/write")
    async def _write(db: DB) -> dict[str, bool]:  # noqa: ARG001
        if fail:
            raise HTTPException(status_code=409, detail="conflict")
        return {"ok": True}

    return app


async def _call(app: FastAPI, events: list[str]) -> None:
    scope: dict[str, Any] = {
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": "GET",
        "scheme": "http", "path": "/write", "raw_path": b"/write", "query_string": b"",
        "headers": [], "server": ("test", 80), "client": ("test", 1), "root_path": "",
    }

    async def receive() -> dict[str, Any]:
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message: MutableMapping[str, Any]) -> None:
        if message["type"] == "http.response.start":
            events.append(f"response {message['status']}")

    await app(scope, receive, send)


@pytest.mark.asyncio
async def test_commit_happens_before_the_response_starts() -> None:
    events: list[str] = []
    await _call(_app(events), events)
    assert events == ["commit", "response 200"]


@pytest.mark.asyncio
async def test_http_errors_still_commit_before_the_response() -> None:
    events: list[str] = []
    await _call(_app(events, fail=True), events)
    assert events == ["commit", "response 409"]
