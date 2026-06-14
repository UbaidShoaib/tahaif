from fastapi import APIRouter, Query

from app.core.deps import DB, CurrentUser
from app.schemas.loyalty import LoyaltyLedgerEntryRead, LoyaltyWalletRead
from app.services import loyalty_service

router = APIRouter(prefix="/loyalty", tags=["loyalty"])


@router.get("/me", response_model=LoyaltyWalletRead)
async def get_my_wallet(user: CurrentUser, db: DB) -> LoyaltyWalletRead:
    return await loyalty_service.get_wallet(db, user)


@router.get("/me/ledger", response_model=list[LoyaltyLedgerEntryRead])
async def get_my_ledger(
    user: CurrentUser,
    db: DB,
    limit: int = Query(default=50, ge=1, le=200),
) -> list[LoyaltyLedgerEntryRead]:
    return await loyalty_service.get_ledger(db, user, limit=limit)
