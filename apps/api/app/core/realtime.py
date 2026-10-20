"""Live fan-out for shared buckets (ADR 0014).

Every API worker subscribes to a Redis channel per open bucket, so an edit made
through one worker reaches sockets held by the others. Presence (who has the
bucket open) is a Redis hash whose entries expire unless refreshed.
"""

import json
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from app.core.redis_client import get_redis

PRESENCE_TTL_SECONDS = 30
MAX_EDITORS = 10


def _channel(bucket_id: str) -> str:
    return f"bucket:{bucket_id}"


def _presence_key(bucket_id: str) -> str:
    return f"bucket:{bucket_id}:presence"


async def publish(bucket_id: str, message: dict[str, Any]) -> None:
    await get_redis().publish(_channel(bucket_id), json.dumps(message, default=str))


@asynccontextmanager
async def subscription(bucket_id: str) -> AsyncIterator[AsyncIterator[dict[str, Any]]]:
    """Subscribe before anything is published, so this socket misses nothing;
    yields the stream of messages on the bucket's channel."""
    pubsub = get_redis().pubsub()
    await pubsub.subscribe(_channel(bucket_id))

    async def messages() -> AsyncIterator[dict[str, Any]]:
        async for raw in pubsub.listen():
            if raw.get("type") == "message":
                yield json.loads(raw["data"])

    try:
        yield messages()
    finally:
        await pubsub.unsubscribe(_channel(bucket_id))
        await pubsub.aclose()  # type: ignore[no-untyped-call]


async def join(bucket_id: str, client_id: str, name: str, color: str) -> bool:
    """Record this editor. False when the bucket already has MAX_EDITORS open."""
    if len(await editors(bucket_id)) >= MAX_EDITORS:
        return False
    await touch(bucket_id, client_id, name, color)
    return True


async def touch(bucket_id: str, client_id: str, name: str, color: str) -> None:
    redis = get_redis()
    key = _presence_key(bucket_id)
    await redis.hset(key, client_id, json.dumps({"name": name, "color": color, "seen": time.time()}))  # type: ignore[misc]
    await redis.expire(key, PRESENCE_TTL_SECONDS * 4)


async def leave(bucket_id: str, client_id: str) -> None:
    await get_redis().hdel(_presence_key(bucket_id), client_id)  # type: ignore[misc]


async def editors(bucket_id: str) -> list[dict[str, Any]]:
    """Editors seen within the TTL; stale entries (a worker that died) are dropped."""
    redis = get_redis()
    key = _presence_key(bucket_id)
    now = time.time()
    live: list[dict[str, Any]] = []
    for client_id, raw in (await redis.hgetall(key)).items():  # type: ignore[misc]
        entry = json.loads(raw)
        if now - entry["seen"] > PRESENCE_TTL_SECONDS:
            await redis.hdel(key, client_id)  # type: ignore[misc]
            continue
        live.append({"id": client_id, "name": entry["name"], "color": entry["color"]})
    return live
