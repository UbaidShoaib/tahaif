"""
Make the first super admin, without SQL. After that, the team is managed from the
back office (Admin → Team): super admins add admins, admins add staff.

Run from apps/api/: uv run python scripts/create_admin.py you@example.com
An existing account is made a super admin (and marked verified and active);
otherwise a new one is created and you are asked for its password.
"""

import asyncio
import getpass
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.core.security import hash_password
from app.models.user import UserRole
from app.repositories.user_repository import UserRepository
from app.schemas.auth import RegisterRequest


async def make_admin(db: AsyncSession, email: str, password: str | None = None) -> str:
    """Promote `email` to super admin, or create it with `password`. Returns what happened."""
    repo = UserRepository(db)
    user = await repo.get_by_email(email)
    if user:
        # Whoever runs this controls the server, so they vouch for the address.
        await repo.update(user, role=UserRole.super_admin, is_active=True, is_verified=True)
        return f"{user.email} is now a super admin."
    if password is None:
        raise ValueError(f"No account uses {email}; a password is needed to create one.")
    checked = RegisterRequest(email=email, password=password)  # same rules as sign-up
    await repo.create(
        email=str(checked.email),
        password_hash=hash_password(checked.password),
        role=UserRole.super_admin,
        is_verified=True,
    )
    return f"Created super admin {email}."


async def main(email: str) -> None:
    settings = get_settings()
    engine = create_async_engine(str(settings.database_url), echo=False)
    async_session = async_sessionmaker(engine, expire_on_commit=False)
    async with async_session() as db:
        password = None
        if not await UserRepository(db).get_by_email(email):
            password = getpass.getpass(f"No account for {email} yet. Password for the new super admin: ")
        try:
            print(await make_admin(db, email, password))
        except (ValueError, ValidationError) as e:
            sys.exit(str(e))
        await db.commit()
    await engine.dispose()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: uv run python scripts/create_admin.py you@example.com")
    asyncio.run(main(sys.argv[1]))
