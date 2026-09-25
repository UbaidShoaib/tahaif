"""Meilisearch client: request shape, failure handling, and index setup."""

import json
import uuid
from collections.abc import Callable

import httpx
import pytest

from app.integrations import meilisearch_client as mc

Handler = Callable[[httpx.Request], httpx.Response]


def _use(monkeypatch: pytest.MonkeyPatch, handler: Handler) -> list[httpx.Request]:
    """Route the client through a mock transport and record every request."""
    seen: list[httpx.Request] = []

    def _record(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return handler(request)

    monkeypatch.setattr(mc, "_base_url", lambda: "http://meili.test")
    monkeypatch.setattr(
        mc, "_client",
        lambda url: httpx.AsyncClient(base_url=url, transport=httpx.MockTransport(_record)),
    )
    return seen


@pytest.mark.asyncio
async def test_search_ids_filters_active_and_city(monkeypatch: pytest.MonkeyPatch) -> None:
    pid, city = uuid.uuid4(), uuid.uuid4()
    seen = _use(monkeypatch, lambda _r: httpx.Response(200, json={"hits": [{"id": str(pid)}], "estimatedTotalHits": 1}))

    ids, total = await mc.search_ids("cake", city_id=city, limit=5)

    assert ids == [pid] and total == 1
    body = json.loads(seen[0].content)
    assert body["filter"] == f'is_active = true AND city_ids = "{city}"'
    assert body["limit"] == 5 and body["attributesToRetrieve"] == ["id"]


@pytest.mark.asyncio
async def test_search_ids_raises_when_unconfigured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(mc, "_base_url", lambda: None)
    with pytest.raises(mc.SearchUnavailable):
        await mc.search_ids("cake")


@pytest.mark.asyncio
async def test_search_ids_raises_on_http_error(monkeypatch: pytest.MonkeyPatch) -> None:
    _use(monkeypatch, lambda _r: httpx.Response(403, json={"message": "invalid key"}))
    with pytest.raises(mc.SearchUnavailable):
        await mc.search_ids("cake")


@pytest.mark.asyncio
async def test_index_failure_is_swallowed(monkeypatch: pytest.MonkeyPatch) -> None:
    _use(monkeypatch, lambda _r: httpx.Response(500))
    assert await mc.index_products([{"id": "1"}]) is None


@pytest.mark.asyncio
async def test_index_products_returns_task_uid(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = _use(monkeypatch, lambda _r: httpx.Response(202, json={"taskUid": 7}))
    assert await mc.index_products([{"id": "1"}]) == 7
    assert seen[0].url.params["primaryKey"] == "id"


@pytest.mark.asyncio
async def test_configure_index_skips_create_when_index_exists(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(r: httpx.Request) -> httpx.Response:
        if r.method == "GET" and r.url.path == "/indexes/products":
            return httpx.Response(200, json={"uid": "products"})
        return httpx.Response(202, json={"taskUid": 3})

    seen = _use(monkeypatch, handler)
    assert await mc.configure_index() == 3
    assert [(r.method, r.url.path) for r in seen] == [("GET", "/indexes/products"), ("PATCH", "/indexes/products/settings")]
    settings = json.loads(seen[-1].content)
    assert "city_ids" in settings["filterableAttributes"]
    assert "vendor_name" in settings["searchableAttributes"]


@pytest.mark.asyncio
async def test_configure_index_creates_missing_index_first(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(r: httpx.Request) -> httpx.Response:
        if r.method == "GET" and r.url.path == "/indexes/products":
            return httpx.Response(404, json={"code": "index_not_found"})
        if r.url.path.startswith("/tasks/"):
            return httpx.Response(200, json={"status": "succeeded"})
        return httpx.Response(202, json={"taskUid": 9})

    seen = _use(monkeypatch, handler)
    assert await mc.configure_index() == 9
    assert [(r.method, r.url.path) for r in seen] == [
        ("GET", "/indexes/products"),
        ("POST", "/indexes"),
        ("GET", "/tasks/9"),
        ("PATCH", "/indexes/products/settings"),
    ]


@pytest.mark.asyncio
async def test_wait_raises_on_failed_task(monkeypatch: pytest.MonkeyPatch) -> None:
    _use(monkeypatch, lambda _r: httpx.Response(200, json={"status": "failed", "error": {"code": "x"}}))
    with pytest.raises(mc.SearchUnavailable):
        await mc.wait_for_task(1)
