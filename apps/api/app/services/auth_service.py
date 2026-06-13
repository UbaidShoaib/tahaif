from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.config import get_settings
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.schemas.auth import GoogleOAuthUser, RegisterRequest, TokenPair

settings = get_settings()

_CONFLICT = HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
_BAD_CREDENTIALS = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
)
_INACTIVE = HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")
_BAD_REFRESH = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token"
)
_BAD_RESET = HTTPException(
    status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset token"
)


def _refresh_expires_at() -> datetime:
    return datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days)


async def register(db: AsyncSession, data: RegisterRequest) -> tuple[User, TokenPair]:
    repo = UserRepository(db)

    if await repo.get_by_email(data.email):
        raise _CONFLICT

    password_hash = security.hash_password(data.password)
    user = await repo.create(
        email=data.email,
        password_hash=password_hash,
        full_name=data.full_name,
    )

    raw_refresh, token_hash = security.create_refresh_token()
    family = security.new_token_family()
    await repo.create_refresh_token(user.id, token_hash, family, _refresh_expires_at())

    pair = TokenPair(
        access_token=security.create_access_token(user.id, user.role.value),
        refresh_token=raw_refresh,
        expires_in=settings.access_token_expire_minutes * 60,
    )
    return user, pair


async def login(db: AsyncSession, email: str, password: str) -> tuple[User, TokenPair]:
    repo = UserRepository(db)
    user = await repo.get_by_email(email)

    if not user or not user.password_hash:
        raise _BAD_CREDENTIALS
    if not security.verify_password(password, user.password_hash):
        raise _BAD_CREDENTIALS
    if not user.is_active:
        raise _INACTIVE

    raw_refresh, token_hash = security.create_refresh_token()
    family = security.new_token_family()
    await repo.create_refresh_token(user.id, token_hash, family, _refresh_expires_at())

    pair = TokenPair(
        access_token=security.create_access_token(user.id, user.role.value),
        refresh_token=raw_refresh,
        expires_in=settings.access_token_expire_minutes * 60,
    )
    return user, pair


async def refresh(db: AsyncSession, raw_refresh_token: str) -> tuple[User, TokenPair]:
    repo = UserRepository(db)
    token_hash = security.hash_token(raw_refresh_token)
    rt = await repo.get_refresh_token(token_hash)

    if not rt:
        raise _BAD_REFRESH

    if rt.revoked_at is not None:
        # Reuse of revoked token — possible theft; nuke the whole family
        await repo.revoke_token_family(rt.family)
        raise _BAD_REFRESH

    if rt.expires_at < datetime.now(UTC):
        raise _BAD_REFRESH

    user = await repo.get_by_id(rt.user_id)
    if not user or not user.is_active:
        raise _BAD_REFRESH

    # Rotate: revoke old, issue new in same family
    await repo.revoke_refresh_token(rt)
    raw_new, new_hash = security.create_refresh_token()
    await repo.create_refresh_token(user.id, new_hash, rt.family, _refresh_expires_at())

    pair = TokenPair(
        access_token=security.create_access_token(user.id, user.role.value),
        refresh_token=raw_new,
        expires_in=settings.access_token_expire_minutes * 60,
    )
    return user, pair


async def logout(db: AsyncSession, raw_refresh_token: str) -> None:
    repo = UserRepository(db)
    token_hash = security.hash_token(raw_refresh_token)
    rt = await repo.get_refresh_token(token_hash)
    if rt and rt.revoked_at is None:
        await repo.revoke_refresh_token(rt)


async def forgot_password(db: AsyncSession, email: str) -> str | None:
    """Returns the raw reset token if a user was found, else None.
    Caller decides whether to actually send the email (allows testing without Resend)."""
    repo = UserRepository(db)
    user = await repo.get_by_email(email)
    if not user:
        return None  # Don't reveal whether email exists

    raw, token_hash = security.create_password_reset_token()
    expires_at = datetime.now(UTC) + timedelta(hours=1)
    await repo.create_password_reset_token(user.id, token_hash, expires_at)
    return raw


async def reset_password(db: AsyncSession, raw_token: str, new_password: str) -> None:
    repo = UserRepository(db)
    token_hash = security.hash_token(raw_token)
    prt = await repo.get_password_reset_token(token_hash)

    if not prt:
        raise _BAD_RESET
    if prt.used_at is not None:
        raise _BAD_RESET
    if prt.expires_at < datetime.now(UTC):
        raise _BAD_RESET

    user = await repo.get_by_id(prt.user_id)
    if not user:
        raise _BAD_RESET

    new_hash = security.hash_password(new_password)
    await repo.update(user, password_hash=new_hash)
    await repo.mark_reset_token_used(prt)
    # Invalidate all existing refresh tokens since password changed
    await repo.revoke_all_user_tokens(user.id)


async def login_or_create_oauth_user(  # pragma: no cover
    db: AsyncSession,
    google_user: GoogleOAuthUser,
    access_token: str | None,
    id_token: str | None,
) -> tuple[User, TokenPair]:
    repo = UserRepository(db)

    # Check if oauth account already exists
    oauth_acc = await repo.get_oauth_account("google", google_user.sub)

    if oauth_acc:
        user = await repo.get_by_id(oauth_acc.user_id)
        if not user or not user.is_active:
            raise _INACTIVE
    else:
        # Check if email already registered (link accounts)
        user = await repo.get_by_email(google_user.email)
        if not user:
            user = await repo.create(
                email=google_user.email,
                full_name=google_user.name,
                avatar_url=google_user.picture,
                is_verified=google_user.email_verified,
            )

    await repo.upsert_oauth_account(
        user_id=user.id,
        provider="google",
        provider_user_id=google_user.sub,
        access_token=access_token,
        id_token=id_token,
        expires_at=None,
    )

    raw_refresh, token_hash = security.create_refresh_token()
    family = security.new_token_family()
    await repo.create_refresh_token(user.id, token_hash, family, _refresh_expires_at())

    pair = TokenPair(
        access_token=security.create_access_token(user.id, user.role.value),
        refresh_token=raw_refresh,
        expires_in=settings.access_token_expire_minutes * 60,
    )
    return user, pair
