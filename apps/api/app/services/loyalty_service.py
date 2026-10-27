"""Loyalty points service."""

import uuid
from datetime import UTC, datetime

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


POINTS_RETURNED = "Order cancelled: points returned"
REWARD_WITHDRAWN = "Order cancelled: reward withdrawn"


async def reverse_for_order(db: AsyncSession, user_id: uuid.UUID, order_id: uuid.UUID) -> int:
    """Undo an order's points when it is cancelled or refunded: points spent on it are
    returned and the points it earned are taken back. Returns the net change.

    Earned points the buyer has already spent elsewhere can't be taken back below
    zero. Running it again changes nothing.
    """
    repo = LoyaltyRepository(db)
    entries = await repo.ledger_for_order(user_id, order_id)
    if not entries or any(e.reason in (POINTS_RETURNED, REWARD_WITHDRAWN) for e in entries):
        return 0
    earned = sum(e.delta_points for e in entries if e.delta_points > 0)
    spent = -sum(e.delta_points for e in entries if e.delta_points < 0)
    wallet = await repo.get_wallet(user_id, for_update=True)
    if wallet is None:
        return 0

    wallet.balance_points += spent
    wallet.lifetime_burned -= spent
    withdrawn = min(earned, wallet.balance_points)
    wallet.balance_points -= withdrawn
    wallet.lifetime_earned -= withdrawn
    wallet.updated_at = datetime.now(UTC)
    await db.flush()
    if spent:
        await repo.add_ledger_entry(user_id, spent, POINTS_RETURNED, order_id)
    if withdrawn:
        await repo.add_ledger_entry(user_id, -withdrawn, REWARD_WITHDRAWN, order_id)
    return spent - withdrawn
