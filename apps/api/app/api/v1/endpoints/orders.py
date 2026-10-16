import hashlib
import uuid
from typing import Annotated

from fastapi import APIRouter, Form, Header, Query, Request, UploadFile, status

from app.core.deps import DB, CurrentUser
from app.core.guest import OptionalUser
from app.core.rate_limit import limiter
from app.models.order import PaymentMethod
from app.schemas.order import (
    CardNoteRead,
    CheckoutPlace,
    CheckoutQuote,
    OrderRead,
    ThanksPage,
)
from app.schemas.social_order import OrderConfirm
from app.services import (
    checkout_service,
    note_service,
    social_order_service,
    thanks_service,
)

router = APIRouter(tags=["orders"])

# Quote and place work for signed-in buyers (Bearer token) and for guests
# (X-Cart-Token header from the cart). See ADR 0004.
CartToken = Annotated[str | None, Header(alias="x-cart-token", max_length=128)]


@router.post("/checkout/quote", response_model=CheckoutQuote)
async def checkout_quote(
    city_id: uuid.UUID,
    user: OptionalUser,
    db: DB,
    coupon_code: Annotated[str | None, Query(max_length=50)] = None,
    use_loyalty_points: bool = False,
    payment_method: PaymentMethod = PaymentMethod.cod,
    x_cart_token: CartToken = None,
) -> CheckoutQuote:
    """Preview totals, including coupon and loyalty discounts and the charge currency.

    COD and bank transfer are always charged in PKR. An invalid coupon returns
    400 with the same message checkout would give. Guests can't use loyalty points.
    """
    return await checkout_service.quote(
        db, user, city_id, coupon_code=coupon_code, use_loyalty_points=use_loyalty_points,
        payment_method=payment_method, guest_token=x_cart_token,
    )


@router.post("/checkout/place", response_model=OrderRead, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def checkout_place(
    request: Request,  # noqa: ARG001 — required by slowapi
    body: CheckoutPlace,
    user: OptionalUser,
    db: DB,
    idempotency_key: Annotated[str | None, Header(alias="idempotency-key")] = None,
    x_cart_token: CartToken = None,
) -> OrderRead:
    """Place the order. Guests must include `contact_email` and `contact_phone`."""
    # Hash the raw key so that the stored value has a consistent length
    hashed_key = hashlib.sha256(idempotency_key.encode()).hexdigest()[:64] if idempotency_key else None
    return await checkout_service.place_order(db, user, body, hashed_key, guest_token=x_cart_token)


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
    """Upload bank-transfer payment proof (image or PDF, max 10 MB) for one of your orders."""
    url = await checkout_service.upload_transfer_proof(db, file=file, user=user, order_id=order_id)
    return {"proof_url": url}


@router.post("/orders/by-token/{public_token}/proof", status_code=status.HTTP_200_OK)
@limiter.limit("10/hour")
async def upload_transfer_proof_by_token(
    request: Request,  # noqa: ARG001 — required by slowapi
    public_token: uuid.UUID,
    file: UploadFile,
    db: DB,
) -> dict[str, str]:
    """Guest version: the order's public token (from the confirmation/tracking link) authorises it."""
    url = await checkout_service.upload_transfer_proof(db, file=file, public_token=public_token)
    return {"proof_url": url}


@router.post("/orders/by-token/{public_token}/confirm", response_model=OrderRead)
@limiter.limit("10/hour")
async def confirm_order(
    request: Request,  # noqa: ARG001 — required by slowapi
    public_token: uuid.UUID,
    body: OrderConfirm,
    db: DB,
) -> OrderRead:
    """The buyer confirms an order staff took from a chat (ADR 0009): accepts the
    terms, optionally fixes the recipient's details and opts in to offers.
    Allowed while the order awaits payment; confirming again changes nothing."""
    return await social_order_service.confirm_order(db, public_token, body)


# ── Greeting-card voice/video notes (diaspora Release B) ─────────────────────


@router.post(
    "/orders/by-token/{public_token}/items/{item_id}/note",
    status_code=status.HTTP_204_NO_CONTENT,
)
@limiter.limit("10/hour")
async def attach_card_note(
    request: Request,  # noqa: ARG001 — required by slowapi
    public_token: uuid.UUID,
    item_id: uuid.UUID,
    file: UploadFile,
    db: DB,
) -> None:
    """Attach (or replace) a voice/video note for this item's card: audio or video,
    max 25 MB. Allowed until the gift is dispatched. The order's public token
    (from the confirmation/tracking link) authorises it."""
    await note_service.attach_note(db, public_token, item_id, file)


@router.delete(
    "/orders/by-token/{public_token}/items/{item_id}/note",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_card_note(public_token: uuid.UUID, item_id: uuid.UUID, db: DB) -> None:
    """Remove the note from this item's card (until the gift is dispatched)."""
    await note_service.remove_note(db, public_token, item_id)


@router.get("/notes/{note_token}", response_model=CardNoteRead)
async def play_card_note(note_token: uuid.UUID, db: DB) -> CardNoteRead:
    """Public: what the recipient opens from the QR code on the printed card."""
    return await note_service.get_note(db, note_token)


# ── Recipient thank-you (diaspora Release B) ─────────────────────────────────


@router.get("/thanks/{thanks_token}", response_model=ThanksPage)
async def thanks_page(thanks_token: uuid.UUID, db: DB) -> ThanksPage:
    """Public: who the gift is from, for the recipient's thank-you page. No prices or order details."""
    return await thanks_service.get_page(db, thanks_token)


@router.post("/thanks/{thanks_token}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("10/hour")
async def send_thanks(
    request: Request,  # noqa: ARG001 — required by slowapi
    thanks_token: uuid.UUID,
    db: DB,
    message: Annotated[str | None, Form(max_length=1000, examples=["Thank you beta, the cake was perfect!"])] = None,
    file: UploadFile | None = None,
) -> None:
    """Public: the recipient's thank-you, text and/or one photo, voice note or video
    (max 25 MB). Sending again replaces it; the buyer is told about the first one."""
    await thanks_service.send_thanks(db, thanks_token, message, file)
