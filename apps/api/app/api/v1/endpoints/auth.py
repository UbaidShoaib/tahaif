import secrets

import structlog
from fastapi import APIRouter, Cookie, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse

from app.core.config import get_settings
from app.core.deps import DB
from app.core.rate_limit import limiter
from app.integrations import google_oauth
from app.integrations.resend_client import send_password_reset_email
from app.schemas.auth import (
    AuthResponse,
    ForgotPasswordRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenPair,
)
from app.schemas.user import UserRead
from app.services import auth_service

logger = structlog.get_logger()
settings = get_settings()

router = APIRouter(prefix="/auth", tags=["auth"])

_COOKIE_NAME = "refresh_token"
_COOKIE_OPTS: dict[str, object] = {
    "httponly": True,
    "samesite": "lax",
    "secure": settings.cookie_secure,
    "max_age": settings.refresh_token_expire_days * 86400,
    "path": "/api/v1/auth",
}


def _set_refresh_cookie(response: Response, raw_token: str) -> None:
    response.set_cookie(_COOKIE_NAME, raw_token, **_COOKIE_OPTS)  # type: ignore[arg-type]


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(_COOKIE_NAME, path="/api/v1/auth")


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/hour")
async def register(
    request: Request,  # noqa: ARG001 — required by slowapi
    body: RegisterRequest,
    response: Response,
    db: DB,
) -> AuthResponse:
    user, pair = await auth_service.register(db, body)
    _set_refresh_cookie(response, pair.refresh_token)
    return AuthResponse(
        access_token=pair.access_token,
        expires_in=pair.expires_in,
        user=UserRead.model_validate(user),
    )


@router.post("/login", response_model=AuthResponse)
@limiter.limit("5/minute")
async def login(
    request: Request,  # noqa: ARG001 — required by slowapi
    body: LoginRequest,
    response: Response,
    db: DB,
) -> AuthResponse:
    user, pair = await auth_service.login(db, body.email, body.password)
    _set_refresh_cookie(response, pair.refresh_token)
    return AuthResponse(
        access_token=pair.access_token,
        expires_in=pair.expires_in,
        user=UserRead.model_validate(user),
    )


@router.post("/refresh", response_model=AuthResponse)
@limiter.limit("30/minute")
async def refresh_token(
    request: Request,  # noqa: ARG001 — required by slowapi
    response: Response,
    db: DB,
    refresh_token_cookie: str | None = Cookie(default=None, alias=_COOKIE_NAME),
    body: RefreshRequest | None = None,
) -> AuthResponse:
    # Body takes precedence: browser uses cookie, API/mobile clients send body
    raw = (body.refresh_token if body else None) or refresh_token_cookie
    if not raw:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh token")
    user, pair = await auth_service.refresh(db, raw)
    _set_refresh_cookie(response, pair.refresh_token)
    return AuthResponse(
        access_token=pair.access_token,
        expires_in=pair.expires_in,
        user=UserRead.model_validate(user),
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    db: DB,
    refresh_token_cookie: str | None = Cookie(default=None, alias=_COOKIE_NAME),
    body: RefreshRequest | None = None,
) -> None:
    raw = refresh_token_cookie or (body.refresh_token if body else None)
    if raw:
        await auth_service.logout(db, raw)
    _clear_refresh_cookie(response)


@router.post("/forgot-password", status_code=status.HTTP_200_OK)
@limiter.limit("3/hour")
async def forgot_password(
    request: Request,  # noqa: ARG001 — required by slowapi
    body: ForgotPasswordRequest,
    db: DB,
) -> dict[str, str]:
    raw_token = await auth_service.forgot_password(db, body.email)
    if raw_token and settings.resend_api_key:
        reset_url = f"{settings.frontend_url}/reset-password?token={raw_token}"
        try:
            await send_password_reset_email(body.email, reset_url)
        except Exception:
            await logger.awarning("password_reset_email_failed", email=body.email)
    # Always return the same response to avoid user enumeration
    return {"message": "If that email is registered, a reset link has been sent"}


@router.post("/reset-password", status_code=status.HTTP_200_OK)
@limiter.limit("5/hour")
async def reset_password(
    request: Request,  # noqa: ARG001 — required by slowapi
    body: ResetPasswordRequest,
    db: DB,
) -> dict[str, str]:
    await auth_service.reset_password(db, body.token, body.new_password)
    return {"message": "Password has been reset successfully"}


# ── Google OAuth ──────────────────────────────────────────────────────────────

@router.get("/oauth/google/authorize")
async def google_authorize(request: Request, response: Response) -> RedirectResponse:  # pragma: no cover  # noqa: ARG001
    state = secrets.token_urlsafe(32)
    # Store state in a short-lived cookie for CSRF validation
    response.set_cookie("oauth_state", state, httponly=True, max_age=300, samesite="lax")
    url = google_oauth.get_authorization_url(state)
    return RedirectResponse(url)


@router.get("/oauth/google/callback", response_model=TokenPair)
async def google_callback(  # pragma: no cover
    request: Request,  # noqa: ARG001
    response: Response,
    db: DB,
    code: str,
    state: str,
    oauth_state: str | None = Cookie(default=None),
) -> TokenPair:
    if not oauth_state or not secrets.compare_digest(state, oauth_state):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OAuth state")

    response.delete_cookie("oauth_state")

    tokens = await google_oauth.exchange_code(code, settings.google_redirect_uri)
    google_user = await google_oauth.get_user_info(tokens["access_token"])

    _user, pair = await auth_service.login_or_create_oauth_user(
        db,
        google_user,
        access_token=tokens.get("access_token"),
        id_token=tokens.get("id_token"),
    )
    _set_refresh_cookie(response, pair.refresh_token)
    return pair
