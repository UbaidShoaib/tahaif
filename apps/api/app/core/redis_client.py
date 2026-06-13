import redis.asyncio as aioredis

from app.core.config import get_settings

_redis: aioredis.Redis | None = None  # type: ignore[type-arg,unused-ignore]


def get_redis() -> aioredis.Redis:  # type: ignore[type-arg,unused-ignore]
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(  # type: ignore[no-untyped-call]
            str(get_settings().redis_url),
            decode_responses=True,
        )
    return _redis
