from collections.abc import AsyncGenerator, MutableMapping
from contextlib import asynccontextmanager

import sentry_sdk
import structlog
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.config import get_settings
from app.core.rate_limit import limiter

logger = structlog.get_logger()


def configure_logging(debug: bool) -> None:  # pragma: no cover
    processors = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
    ]
    if debug:
        processors.append(structlog.dev.ConsoleRenderer())
    else:
        processors.append(structlog.processors.JSONRenderer())

    structlog.configure(
        processors=processors,  # type: ignore[arg-type]
        wrapper_class=structlog.make_filtering_bound_logger(20),
        cache_logger_on_first_use=True,
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:  # pragma: no cover  # noqa: ARG001
    settings = get_settings()
    configure_logging(settings.debug)

    if settings.sentry_dsn:
        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            environment=settings.environment,
            traces_sample_rate=0.2 if settings.is_production else 1.0,
        )

    await logger.ainfo("startup", app=settings.app_name, version=settings.app_version)
    yield
    await logger.ainfo("shutdown")


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="Tahaif API",
        version=settings.app_version,
        docs_url="/api/v1/docs",
        redoc_url="/api/v1/redoc",
        openapi_url="/api/v1/openapi.json",
        lifespan=lifespan,
    )

    # limiter state must be set; SlowAPIMiddleware is intentionally omitted —
    # it uses BaseHTTPMiddleware which conflicts with asyncpg. The per-endpoint
    # @limiter.limit() decorators still raise RateLimitExceeded, caught below.
    app.state.limiter = limiter

    @app.exception_handler(RateLimitExceeded)
    async def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:  # noqa: ARG001
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={"detail": "Too many requests, please try again later"},
        )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_url],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Pure ASGI request-ID middleware — stamps every response with X-Request-ID
    class RequestIDMiddleware:
        def __init__(self, inner: ASGIApp) -> None:
            self._inner = inner

        async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
            if scope["type"] != "http":
                await self._inner(scope, receive, send)
                return

            import uuid as _uuid
            request_id = _uuid.uuid4().hex

            async def send_with_request_id(message: MutableMapping[str, object]) -> None:
                if message["type"] == "http.response.start":
                    from starlette.datastructures import MutableHeaders
                    headers = MutableHeaders(scope=message)
                    headers.append("X-Request-ID", request_id)
                await send(message)

            await self._inner(scope, receive, send_with_request_id)

    app.add_middleware(RequestIDMiddleware)

    # Pure ASGI security-headers middleware — avoids BaseHTTPMiddleware/asyncpg loop conflict
    class SecurityHeadersMiddleware:
        def __init__(self, inner: ASGIApp) -> None:
            self._inner = inner

        async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
            if scope["type"] != "http":
                await self._inner(scope, receive, send)
                return

            async def send_with_headers(message: MutableMapping[str, object]) -> None:
                if message["type"] == "http.response.start":
                    from starlette.datastructures import MutableHeaders
                    headers = MutableHeaders(scope=message)
                    headers.append("X-Content-Type-Options", "nosniff")
                    headers.append("X-Frame-Options", "DENY")
                    headers.append("Referrer-Policy", "strict-origin-when-cross-origin")
                    headers.append(
                        "Content-Security-Policy",
                        "default-src 'none'; frame-ancestors 'none'",
                    )
                    if settings.is_production:
                        headers.append(
                            "Strict-Transport-Security",
                            "max-age=31536000; includeSubDomains; preload",
                        )
                await send(message)

            await self._inner(scope, receive, send_with_headers)

    app.add_middleware(SecurityHeadersMiddleware)

    # Audit log middleware — logs mutating requests to /admin/* and /vendor/*
    class AuditLogMiddleware:
        def __init__(self, inner: ASGIApp) -> None:
            self._inner = inner

        async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
            if scope["type"] != "http":
                await self._inner(scope, receive, send)
                return

            from starlette.requests import Request as StarletteRequest
            req = StarletteRequest(scope)
            method = req.method
            path = req.url.path
            should_audit = method in {"POST", "PATCH", "PUT", "DELETE"} and (
                "/admin/" in path or "/vendor/" in path
            )

            if not should_audit:
                await self._inner(scope, receive, send)
                return

            import asyncio
            from app.core.db import get_db

            async def run_audit() -> None:
                try:
                    import uuid as _uuid
                    import sqlalchemy as _sa
                    forwarded = req.headers.get("X-Forwarded-For", "")
                    ip = forwarded.split(",")[0].strip() if forwarded else (req.client.host if req.client else None)

                    async for _db in get_db():
                        await _db.execute(_sa.text("""
                            INSERT INTO audit_logs (id, action, entity, entity_id, ip_address, created_at)
                            VALUES (:id, :action, :entity, :entity_id, :ip, NOW())
                        """), {
                            "id": _uuid.uuid4(),
                            "action": method,
                            "entity": path.split("/")[-2] if len(path.split("/")) > 1 else path,
                            "entity_id": path.split("/")[-1],
                            "ip": ip,
                        })
                        await _db.commit()
                except Exception:
                    pass  # audit must never break the request

            asyncio.ensure_future(run_audit())
            await self._inner(scope, receive, send)

    app.add_middleware(AuditLogMiddleware)

    from app.api.v1.router import api_router

    app.include_router(api_router, prefix="/api/v1")

    return app


app = create_app()
