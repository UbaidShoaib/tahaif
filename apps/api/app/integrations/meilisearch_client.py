"""Thin wrapper around Meilisearch. All methods are no-ops when MEILISEARCH_URL is unset."""
from __future__ import annotations

import httpx

from app.core.config import get_settings

_INDEX = "products"


def _base_url() -> str | None:
    settings = get_settings()
    # Require an explicit key to prevent accidental connections to localhost:7700
    if not settings.meilisearch_master_key:
        return None
    return str(settings.meilisearch_url) if settings.meilisearch_url else None


def _headers() -> dict[str, str]:
    key = get_settings().meilisearch_master_key
    return {"Authorization": f"Bearer {key}"} if key else {}


async def index_product(doc: dict[str, object]) -> None:  # pragma: no cover
    url = _base_url()
    if not url:
        return
    async with httpx.AsyncClient(base_url=url, headers=_headers()) as client:
        await client.post(f"/indexes/{_INDEX}/documents", json=[doc])


async def delete_product(product_id: str) -> None:  # pragma: no cover
    url = _base_url()
    if not url:
        return
    async with httpx.AsyncClient(base_url=url, headers=_headers()) as client:
        await client.delete(f"/indexes/{_INDEX}/documents/{product_id}")


async def search(query: str, filters: str | None = None, limit: int = 20) -> dict[str, object]:  # pragma: no cover
    url = _base_url()
    if not url:
        return {"hits": [], "query": query, "estimatedTotalHits": 0}
    payload: dict[str, object] = {"q": query, "limit": limit}
    if filters:
        payload["filter"] = filters
    async with httpx.AsyncClient(base_url=url, headers=_headers()) as client:
        resp = await client.post(f"/indexes/{_INDEX}/search", json=payload)
        resp.raise_for_status()
        return resp.json()  # type: ignore[no-any-return]
