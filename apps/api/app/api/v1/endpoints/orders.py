import uuid
from typing import Annotated

from fastapi import APIRouter, Header, status

from app.core.deps import DB, CurrentUser
from app.schemas.order import CheckoutPlace, CheckoutQuote, OrderRead
from app.services import checkout_service

router = APIRouter(tags=["orders"])


@router.post("/checkout/quote", response_model=CheckoutQuote)
async def checkout_quote(
    city_id: uuid.UUID,
    user: CurrentUser,
    db: DB,
) -> CheckoutQuote:
    return await checkout_service.quote(db, user.id, city_id)


@router.post("/checkout/place", response_model=OrderRead, status_code=status.HTTP_201_CREATED)
async def checkout_place(
    body: CheckoutPlace,
    user: CurrentUser,
    db: DB,
    idempotency_key: Annotated[str | None, Header(alias="idempotency-key")] = None,  # noqa: ARG001
) -> OrderRead:
    return await checkout_service.place_order(db, user.id, body)


@router.get("/orders/me", response_model=list[OrderRead])
async def my_orders(user: CurrentUser, db: DB) -> list[OrderRead]:
    return await checkout_service.get_my_orders(db, user.id)


@router.get("/orders/{public_token}", response_model=OrderRead)
async def track_order(public_token: uuid.UUID, db: DB) -> OrderRead:
    return await checkout_service.get_order_by_token(db, public_token)
