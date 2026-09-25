"""
Rebuild the Meilisearch products index from the database.
Run from apps/api/: uv run python scripts/reindex_search.py
Safe to re-run: configures the index settings and upserts every active product.
Exits non-zero if Meilisearch is unreachable, so callers can warn.
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.services import catalog_service


async def main() -> int:
    settings = get_settings()
    if not settings.meilisearch_master_key:
        print("MEILISEARCH_MASTER_KEY is not set — search will use the database fallback.")
        return 1
    engine = create_async_engine(str(settings.database_url), echo=False)
    async_session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with async_session() as db:
            count = await catalog_service.reindex_all_products(db)
    except Exception as exc:  # noqa: BLE001 — report any failure to the shell
        print(f"Reindex failed: {exc}")
        return 1
    finally:
        await engine.dispose()
    print(f"Indexed {count} products")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
