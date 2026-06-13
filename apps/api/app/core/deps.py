import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import decode_access_token
from app.models.user import User, UserRole
from app.repositories.user_repository import UserRepository

_bearer = HTTPBearer(auto_error=False)

_UNAUTHORIZED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)
_FORBIDDEN = HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    if not credentials:
        raise _UNAUTHORIZED

    payload = decode_access_token(credentials.credentials)
    if not payload:
        raise _UNAUTHORIZED

    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError):
        raise _UNAUTHORIZED from None

    repo = UserRepository(db)
    user = await repo.get_by_id(user_id)
    if not user or not user.is_active:
        raise _UNAUTHORIZED

    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[AsyncSession, Depends(get_db)]


def require_roles(*roles: UserRole):  # type: ignore[no-untyped-def]
    async def _check(user: CurrentUser) -> User:
        if user.role not in roles:
            raise _FORBIDDEN
        return user

    return Depends(_check)
