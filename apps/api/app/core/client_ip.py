"""Resolve the real client IP behind trusted reverse proxies.

Without this, every request behind Railway/Render/Fly/Cloudflare appears to come
from the proxy, so rate limits and the login IP ban apply to all buyers at once.
The leftmost X-Forwarded-For entry is client-controlled and cannot be trusted;
each trusted proxy appends the address it saw, so with N trusted hops the client
is the Nth entry from the right.
"""

from starlette.requests import Request

from app.core.config import get_settings


def client_ip(request: Request) -> str:
    hops = get_settings().trusted_proxy_hops
    peer = request.client.host if request.client else "unknown"
    if hops <= 0:
        return peer
    forwarded = [p.strip() for p in request.headers.get("x-forwarded-for", "").split(",") if p.strip()]
    if len(forwarded) >= hops:
        return forwarded[-hops]
    return forwarded[0] if forwarded else peer
