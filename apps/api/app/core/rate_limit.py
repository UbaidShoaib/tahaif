import os

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import get_settings


def build_limiter(storage_uri: str, enabled: bool = True) -> Limiter:
    """Rate limiter whose counters live in Redis, shared by every API worker.

    Counters used to be per-process memory, so each worker or replica allowed
    its own quota and a restart reset them. If Redis is unreachable the limiter
    falls back to per-process counting rather than failing requests.
    """
    return Limiter(
        key_func=get_remote_address,
        default_limits=["200/minute"],
        storage_uri=storage_uri,
        key_prefix="tahaif-rl",
        in_memory_fallback_enabled=True,
        swallow_errors=True,
        enabled=enabled,
    )


# TESTING=1 disables rate limiting so test suites don't hit per-IP limits
limiter = build_limiter(str(get_settings().redis_url), enabled=os.getenv("TESTING", "0") != "1")
