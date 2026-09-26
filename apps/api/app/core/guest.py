"""Optional sign-in and guest cart identity for storefront endpoints (ADR 0004)."""
from typing import Annotated

from fastapi import Depends, Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.deps import DB, get_current_user
from app.models.user import User
from app.services.cart_service import CartOwner

_bearer = HTTPBearer(auto_error=False)


async def get_optional_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    db: DB,
) -> User | None:
    """The signed-in user, or None for guests.

    A token that is present but invalid or expired is still a 401 — the client
    should refresh — rather than silently falling back to a guest cart.
    """
    if not credentials:
        return None
    return await get_current_user(credentials, db)


OptionalUser = Annotated[User | None, Depends(get_optional_user)]


async def get_cart_owner(
    user: OptionalUser,
    x_cart_token: Annotated[str | None, Header(max_length=128)] = None,
) -> CartOwner:
    return CartOwner(user_id=user.id if user else None, guest_token=x_cart_token or None)


Owner = Annotated[CartOwner, Depends(get_cart_owner)]
