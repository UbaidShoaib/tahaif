import hashlib
import os
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from jose import JWTError, jwt

from app.core.config import get_settings

_ph = PasswordHasher(time_cost=2, memory_cost=65536, parallelism=2)

settings = get_settings()


def hash_password(plain: str) -> str:
    return _ph.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return _ph.verify(hashed, plain)
    except VerifyMismatchError:
        return False


def create_access_token(user_id: uuid.UUID, role: str) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_expire_minutes),
        "type": "access",
    }
    return str(jwt.encode(payload, settings.secret_key, algorithm="HS256"))


def decode_access_token(token: str) -> dict[str, str] | None:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        if payload.get("type") != "access":
            return None
        return payload  # type: ignore[no-any-return]
    except JWTError:
        return None


def create_refresh_token() -> tuple[str, str]:
    """Return (raw_token, sha256_hash). Store the hash; send raw to client."""
    raw = secrets.token_urlsafe(48)
    token_hash = _hash_token(raw)
    return raw, token_hash


def create_password_reset_token() -> tuple[str, str]:
    """Return (raw_token, sha256_hash)."""
    raw = secrets.token_urlsafe(32)
    token_hash = _hash_token(raw)
    return raw, token_hash


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def hash_token(raw: str) -> str:
    return _hash_token(raw)


def new_token_family() -> uuid.UUID:
    return uuid.uuid4()


def generate_secret_key() -> str:
    return os.urandom(32).hex()
