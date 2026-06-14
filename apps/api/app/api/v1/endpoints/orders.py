import hashlib
import uuid
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, UploadFile, status

from app.core.deps import DB, CurrentUser
from app.integrations.s3_client import upload_proof
from app.repositories.order_repository import OrderRepository
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
    idempotency_key: Annotated[str | None, Header(alias="idempotency-key")] = None,
) -> OrderRead:
    # Hash the raw key so that the stored value has a consistent length
    hashed_key = hashlib.sha256(idempotency_key.encode()).hexdigest()[:64] if idempotency_key else None
    return await checkout_service.place_order(db, user, body, hashed_key)


@router.get("/orders/me", response_model=list[OrderRead])
async def my_orders(user: CurrentUser, db: DB) -> list[OrderRead]:
    return await checkout_service.get_my_orders(db, user.id)


@router.get("/orders/{public_token}", response_model=OrderRead)
async def track_order(public_token: uuid.UUID, db: DB) -> OrderRead:
    return await checkout_service.get_order_by_token(db, public_token)


@router.post("/orders/{order_id}/proof", status_code=status.HTTP_200_OK)
async def upload_transfer_proof(
    order_id: uuid.UUID,
    file: UploadFile,
    user: CurrentUser,
    db: DB,
) -> dict[str, str]:
    """Upload bank-transfer payment proof (image or PDF, max 10 MB)."""
    repo = OrderRepository(db)
    order = await repo.get_by_id(order_id)

    if not order or order.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    if not order.payments:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No payment record found")

    payment = order.payments[0]
    from app.models.order import PaymentMethod, PaymentStatus
    if payment.method != PaymentMethod.bank_transfer:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Proof upload is only for bank transfer orders",
        )

    data = await file.read()
    url = await upload_proof(
        order_id=str(order_id),
        filename=file.filename or "receipt.jpg",
        data=data,
        content_type=file.content_type or "image/jpeg",
    )

    payment.proof_url = url
    payment.status = PaymentStatus.awaiting_verification
    await db.flush()

    return {"proof_url": url}
