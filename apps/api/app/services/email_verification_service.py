"""Email verification by 6-digit one-time code.

Codes live in Redis (hashed, 10-minute TTL) — no table needed. A code allows
5 wrong guesses before it is burned, and a new one can be sent once a minute.
"""

import hashlib
import hmac
import secrets

import structlog
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.redis_client import get_redis
from app.integrations.resend_client import send_verification_code_email
from app.models.user import User
from app.repositories.user_repository import UserRepository

logger = structlog.get_logger()
settings = get_settings()

CODE_TTL_SECS = 600
RESEND_COOLDOWN_SECS = 60
MAX_ATTEMPTS = 5

_BAD_CODE = HTTPException(
    status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired code"
)


def _code_key(user: User) -> str:
    return f"email_otp:{user.id}"


def _attempts_key(user: User) -> str:
    return f"email_otp_attempts:{user.id}"


def _cooldown_key(user: User) -> str:
    return f"email_otp_cooldown:{user.id}"


def _hash(code: str) -> str:
    return hashlib.sha256(f"{settings.secret_key}:{code}".encode()).hexdigest()


def generate_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


async def send_code(user: User) -> None:
    """Issue a fresh code and email it. Raises 429 inside the resend cooldown."""
    if user.is_verified:
        return
    redis = get_redis()
    if not await redis.set(_cooldown_key(user), "1", ex=RESEND_COOLDOWN_SECS, nx=True):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Please wait a minute before requesting another code",
        )
    code = generate_code()
    await redis.set(_code_key(user), _hash(code), ex=CODE_TTL_SECS)
    await redis.delete(_attempts_key(user))

    if not settings.resend_api_key:
        # Local dev without Resend: surface the code in the logs instead.
        await logger.ainfo("email_verification_code", email=user.email, code=code)
        return
    try:
        await send_verification_code_email(user.email, code)
    except Exception as exc:
        await logger.aerror("verification_email_failed", email=user.email, error=str(exc))
        await redis.delete(_cooldown_key(user))  # let them retry straight away
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not send the verification email. Please try again.",
        ) from exc


async def verify_code(db: AsyncSession, user: User, code: str) -> User:
    if user.is_verified:
        return user
    redis = get_redis()
    stored = await redis.get(_code_key(user))
    if not stored:
        raise _BAD_CODE
    if not hmac.compare_digest(stored, _hash(code)):
        attempts = await redis.incr(_attempts_key(user))
        await redis.expire(_attempts_key(user), CODE_TTL_SECS)
        if attempts >= MAX_ATTEMPTS:
            await redis.delete(_code_key(user), _attempts_key(user))
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Too many wrong attempts. Request a new code.",
            )
        raise _BAD_CODE
    await redis.delete(_code_key(user), _attempts_key(user), _cooldown_key(user))
    return await UserRepository(db).update(user, is_verified=True)
