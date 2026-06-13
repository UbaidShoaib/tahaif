import uuid

from fastapi import APIRouter, status

from app.core.deps import DB, CurrentUser
from app.schemas.cart import CartItemAdd, CartItemUpdate, CartRead
from app.services import cart_service

router = APIRouter(prefix="/cart", tags=["cart"])


@router.get("", response_model=CartRead)
async def get_cart(user: CurrentUser, db: DB) -> CartRead:
    return await cart_service.get_cart(db, user.id)


@router.post("/items", response_model=CartRead, status_code=status.HTTP_201_CREATED)
async def add_item(body: CartItemAdd, user: CurrentUser, db: DB) -> CartRead:
    return await cart_service.add_item(db, user.id, body)


@router.patch("/items/{item_id}", response_model=CartRead)
async def update_item(item_id: uuid.UUID, body: CartItemUpdate, user: CurrentUser, db: DB) -> CartRead:
    return await cart_service.update_item(db, user.id, item_id, body)


@router.delete("/items/{item_id}", response_model=CartRead)
async def remove_item(item_id: uuid.UUID, user: CurrentUser, db: DB) -> CartRead:
    return await cart_service.remove_item(db, user.id, item_id)


@router.delete("", response_model=CartRead)
async def clear_cart(user: CurrentUser, db: DB) -> CartRead:
    return await cart_service.clear_cart(db, user.id)
