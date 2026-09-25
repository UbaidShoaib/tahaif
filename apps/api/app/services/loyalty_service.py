"""Loyalty points service."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.repositories.loyalty_repository import LoyaltyRepository
from app.schemas.loyalty import LoyaltyLedgerEntryRead, LoyaltyWalletRead

POINTS_PER_100_PKR = 1  # 1 point per 100 PKR (= 10 000 paisa)


async def get_wallet(db: AsyncSession, user: User) -> LoyaltyWalletRead:
    repo = LoyaltyRepository(db)
    wallet = await repo.get_or_create_wallet(user.id)
    return LoyaltyWalletRead.model_validate(wallet)


async def get_ledger(
    db: AsyncSession, user: User, limit: int = 50
) -> list[LoyaltyLedgerEntryRead]:
    repo = LoyaltyRepository(db)
    entries = await repo.list_ledger(user.id, limit=limit)
    return [LoyaltyLedgerEntryRead.model_validate(e) for e in entries]


# Earn 1 point per PKR 100 spent; each point is worth PKR 1 at checkout
# (docs/questions.md Q9: "Earn 1 pt per PKR 100 spent, Burn 100 pts = PKR 100").
EARN_PAISA_PER_POINT = 10_000
POINT_VALUE_PAISA = 100


async def award_for_order(
    db: AsyncSession,
    user_id: uuid.UUID,
    order_id: uuid.UUID,
    total_pkr: int,
) -> None:
    """Award loyalty points when an order is placed. Fire-and-forget; never raises."""
    try:
        points = total_pkr // EARN_PAISA_PER_POINT
        if points <= 0:
            return
        repo = LoyaltyRepository(db)
        await repo.award_points(
            user_id=user_id,
            points=points,
            reason="Order reward",
            order_id=order_id,
        )
    except Exception:
        pass
