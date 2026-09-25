"""Thin wrapper around Meilisearch.

Writes (index/delete) are best-effort: a search outage must never break a
catalog save, so they log and return. Reads raise SearchUnavailable so the
service layer can fall back to a database query.
"""
from __future__ import annotations

import asyncio
import uuid

import httpx
import structlog

from app.core.config import get_settings

logger = structlog.get_logger()

_INDEX = "products"
_TIMEOUT = httpx.Timeout(5.0)
_SETTINGS: dict[str, object] = {
    "searchableAttributes": ["name", "vendor_name", "description"],
    "filterableAttributes": ["city_ids", "is_active", "vendor_id", "category_id"],
}


class SearchUnavailable(Exception):
    """Meilisearch is not configured, unreachable, or rejected the request."""


def _base_url() -> str | None:
    settings = get_settings()
    # Require an explicit key to prevent accidental connections to localhost:7700
    if not settings.meilisearch_master_key:
        return None
    return str(settings.meilisearch_url) if settings.meilisearch_url else None


def _headers() -> dict[str, str]:
    key = get_settings().meilisearch_master_key
    return {"Authorization": f"Bearer {key}"} if key else {}


def _client(url: str) -> httpx.AsyncClient:
    return httpx.AsyncClient(base_url=url, headers=_headers(), timeout=_TIMEOUT)


async def index_product(doc: dict[str, object]) -> None:
    await index_products([doc])


async def index_products(docs: list[dict[str, object]]) -> int | None:
    """Upsert documents. Returns the Meilisearch task uid, or None if skipped/failed."""
    url = _base_url()
    if not url or not docs:
        return None
    try:
        async with _client(url) as client:
            resp = await client.post(f"/indexes/{_INDEX}/documents", params={"primaryKey": "id"}, json=docs)
            resp.raise_for_status()
            return int(resp.json()["taskUid"])
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        await logger.awarning("meili_index_failed", count=len(docs), error=str(exc))
        return None


async def delete_product(product_id: str) -> None:
    url = _base_url()
    if not url:
        return
    try:
        async with _client(url) as client:
            resp = await client.delete(f"/indexes/{_INDEX}/documents/{product_id}")
            resp.raise_for_status()
    except httpx.HTTPError as exc:
        await logger.awarning("meili_delete_failed", product_id=product_id, error=str(exc))


async def configure_index() -> int | None:
    """Create the index if needed and apply searchable/filterable attributes."""
    url = _base_url()
    if not url:
        return None
    async with _client(url) as client:
        # Creating an existing index is accepted (202) and only fails later in the
        # async task, so check first and create only when it is missing.
        existing = await client.get(f"/indexes/{_INDEX}")
        if existing.status_code == 404:
            created = await client.post("/indexes", json={"uid": _INDEX, "primaryKey": "id"})
            created.raise_for_status()
            await _wait(client, int(created.json()["taskUid"]))
        else:
            existing.raise_for_status()
        resp = await client.patch(f"/indexes/{_INDEX}/settings", json=_SETTINGS)
        resp.raise_for_status()
        return int(resp.json()["taskUid"])


async def wait_for_task(task_uid: int, timeout_s: float = 30.0) -> None:
    url = _base_url()
    if not url:
        return
    async with _client(url) as client:
        await _wait(client, task_uid, timeout_s)


async def _wait(client: httpx.AsyncClient, task_uid: int, timeout_s: float = 30.0) -> None:
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout_s
    while True:
        resp = await client.get(f"/tasks/{task_uid}")
        resp.raise_for_status()
        task = resp.json()
        if task["status"] == "succeeded":
            return
        if task["status"] in ("failed", "canceled"):
            raise SearchUnavailable(f"Meilisearch task {task_uid} {task['status']}: {task.get('error')}")
        if loop.time() > deadline:
            raise SearchUnavailable(f"Meilisearch task {task_uid} still {task['status']} after {timeout_s}s")
        await asyncio.sleep(0.2)


async def search_ids(
    query: str, city_id: uuid.UUID | None = None, limit: int = 20
) -> tuple[list[uuid.UUID], int]:
    """Return matching product ids (best first) and Meilisearch's hit estimate."""
    url = _base_url()
    if not url:
        raise SearchUnavailable("Meilisearch is not configured")
    filters = ["is_active = true"]
    if city_id:
        filters.append(f'city_ids = "{city_id}"')
    payload: dict[str, object] = {
        "q": query,
        "limit": limit,
        "filter": " AND ".join(filters),
        "attributesToRetrieve": ["id"],
    }
    try:
        async with _client(url) as client:
            resp = await client.post(f"/indexes/{_INDEX}/search", json=payload)
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as exc:
        raise SearchUnavailable(str(exc)) from exc
    ids = [uuid.UUID(hit["id"]) for hit in data.get("hits", [])]
    return ids, int(data.get("estimatedTotalHits", len(ids)))
