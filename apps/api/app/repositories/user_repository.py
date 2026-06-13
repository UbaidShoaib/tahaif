import uuid
from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import OAuthAccount, PasswordResetToken, RefreshToken, User


class UserRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_by_id(self, user_id: uuid.UUID) -> User | None:
        result = await self._db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> User | None:
        result = await self._db.execute(
            select(User).where(User.email == email.lower())
        )
        return result.scalar_one_or_none()

    async def create(self, **kwargs: object) -> User:
        if "email" in kwargs and isinstance(kwargs["email"], str):
            kwargs["email"] = kwargs["email"].lower()
        user = User(**kwargs)
        self._db.add(user)
        await self._db.flush()
        await self._db.refresh(user)
        return user

    async def update(self, user: User, **kwargs: object) -> User:
        for key, value in kwargs.items():
            setattr(user, key, value)
        await self._db.flush()
        await self._db.refresh(user)
        return user

    # ── Refresh tokens ────────────────────────────────────────────────────────

    async def create_refresh_token(
        self,
        user_id: uuid.UUID,
        token_hash: str,
        family: uuid.UUID,
        expires_at: datetime,
    ) -> RefreshToken:
        rt = RefreshToken(
            user_id=user_id,
            token_hash=token_hash,
            family=family,
            expires_at=expires_at,
        )
        self._db.add(rt)
        await self._db.flush()
        return rt

    async def get_refresh_token(self, token_hash: str) -> RefreshToken | None:
        result = await self._db.execute(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )
        return result.scalar_one_or_none()

    async def revoke_refresh_token(self, token: RefreshToken) -> None:
        token.revoked_at = datetime.now(UTC)
        await self._db.flush()

    async def revoke_token_family(self, family: uuid.UUID) -> None:
        now = datetime.now(UTC)
        await self._db.execute(
            update(RefreshToken)
            .where(RefreshToken.family == family, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )

    async def revoke_all_user_tokens(self, user_id: uuid.UUID) -> None:
        now = datetime.now(UTC)
        await self._db.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )

    # ── Password reset ────────────────────────────────────────────────────────

    async def create_password_reset_token(
        self,
        user_id: uuid.UUID,
        token_hash: str,
        expires_at: datetime,
    ) -> PasswordResetToken:
        prt = PasswordResetToken(
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at,
        )
        self._db.add(prt)
        await self._db.flush()
        return prt

    async def get_password_reset_token(self, token_hash: str) -> PasswordResetToken | None:
        result = await self._db.execute(
            select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash)
        )
        return result.scalar_one_or_none()

    async def mark_reset_token_used(self, token: PasswordResetToken) -> None:
        token.used_at = datetime.now(UTC)
        await self._db.flush()

    # ── OAuth accounts ────────────────────────────────────────────────────────

    async def get_oauth_account(
        self, provider: str, provider_user_id: str
    ) -> OAuthAccount | None:
        result = await self._db.execute(
            select(OAuthAccount).where(
                OAuthAccount.provider == provider,
                OAuthAccount.provider_user_id == provider_user_id,
            )
        )
        return result.scalar_one_or_none()

    async def upsert_oauth_account(
        self,
        user_id: uuid.UUID,
        provider: str,
        provider_user_id: str,
        access_token: str | None,
        id_token: str | None,
        expires_at: datetime | None,
    ) -> OAuthAccount:
        existing = await self.get_oauth_account(provider, provider_user_id)
        if existing:
            existing.access_token = access_token
            existing.id_token = id_token
            existing.expires_at = expires_at
            await self._db.flush()
            return existing

        account = OAuthAccount(
            user_id=user_id,
            provider=provider,
            provider_user_id=provider_user_id,
            access_token=access_token,
            id_token=id_token,
            expires_at=expires_at,
        )
        self._db.add(account)
        await self._db.flush()
        return account
