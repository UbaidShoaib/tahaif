import uuid

from fastapi import APIRouter, status

from app.core.deps import DB
from app.core.guest import Owner
from app.schemas.cart import CartItemAdd, CartItemUpdate, CartRead
from app.services import cart_service

router = APIRouter(prefix="/cart", tags=["cart"])

# Every cart endpoint works for signed-in buyers (Bearer token) and for guests
# (X-Cart-Token header, issued as `guest_token` on the first add). A request with
# both merges the guest cart into the user's cart. See ADR 0004.


@router.get("", response_model=CartRead)
async def get_cart(owner: Owner, db: DB) -> CartRead:
    """The buyer's cart. A guest with no token gets an empty cart (nothing is created)."""
    return await cart_service.get_cart(db, owner)


@router.post("/items", response_model=CartRead, status_code=status.HTTP_201_CREATED)
async def add_item(body: CartItemAdd, owner: Owner, db: DB) -> CartRead:
    """Add a gift. A guest's first add creates their cart and returns its `guest_token`."""
    return await cart_service.add_item(db, owner, body)


@router.patch("/items/{item_id}", response_model=CartRead)
async def update_item(item_id: uuid.UUID, body: CartItemUpdate, owner: Owner, db: DB) -> CartRead:
    return await cart_service.update_item(db, owner, item_id, body)


@router.delete("/items/{item_id}", response_model=CartRead)
async def remove_item(item_id: uuid.UUID, owner: Owner, db: DB) -> CartRead:
    return await cart_service.remove_item(db, owner, item_id)


@router.delete("", response_model=CartRead)
async def clear_cart(owner: Owner, db: DB) -> CartRead:
    return await cart_service.clear_cart(db, owner)
