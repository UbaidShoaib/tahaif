import uuid

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.address import Address


class AddressRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def list_for_user(self, user_id: uuid.UUID) -> list[Address]:
        result = await self._db.execute(
            select(Address)
            .where(Address.user_id == user_id, Address.is_active.is_(True))
            .order_by(Address.is_default.desc(), Address.created_at.asc())
        )
        return list(result.scalars().all())

    async def get(self, address_id: uuid.UUID, user_id: uuid.UUID) -> Address | None:
        result = await self._db.execute(
            select(Address).where(
                Address.id == address_id,
                Address.user_id == user_id,
                Address.is_active.is_(True),
            )
        )
        return result.scalar_one_or_none()

    async def create(self, user_id: uuid.UUID, **kwargs: object) -> Address:
        if kwargs.get("is_default"):
            await self._clear_default(user_id)
        address = Address(user_id=user_id, **kwargs)
        self._db.add(address)
        await self._db.flush()
        await self._db.refresh(address)
        return address

    async def update(self, address: Address, **kwargs: object) -> Address:
        if kwargs.get("is_default"):
            await self._clear_default(address.user_id)
        for key, value in kwargs.items():
            if value is not None:
                setattr(address, key, value)
        await self._db.flush()
        await self._db.refresh(address)
        return address

    async def soft_delete(self, address: Address) -> None:
        address.is_active = False
        await self._db.flush()

    async def _clear_default(self, user_id: uuid.UUID) -> None:
        await self._db.execute(
            update(Address)
            .where(Address.user_id == user_id, Address.is_default.is_(True))
            .values(is_default=False)
        )
