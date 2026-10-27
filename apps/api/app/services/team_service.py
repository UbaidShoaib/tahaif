"""The back-office team: admins add staff by email, change roles and deactivate accounts.

There is no separate sign-up for staff. A person registers on the site like any
buyer and verifies their email; an admin then adds that account here. Two rules
keep the back office reachable: nobody changes their own role or deactivates
themselves, and the last active admin can't be demoted or deactivated.
"""

import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User, UserRole
from app.repositories.user_repository import UserRepository
from app.schemas.team import TeamMemberAdd, TeamMemberRead, TeamMemberUpdate
from app.services import audit_service

_TEAM = (UserRole.staff, UserRole.admin)


def _read(u: User) -> TeamMemberRead:
    return TeamMemberRead(
        id=u.id, email=u.email, full_name=u.full_name, role=u.role, is_active=u.is_active, created_at=u.created_at
    )


def _conflict(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


async def list_team(db: AsyncSession) -> list[TeamMemberRead]:
    """Admins first, then staff; deactivated accounts stay listed so they can be turned back on."""
    result = await db.execute(
        select(User).where(User.role.in_(_TEAM)).order_by(User.role.desc(), User.is_active.desc(), User.email)
    )
    return [_read(u) for u in result.scalars().all()]


async def ensure_an_admin_remains(db: AsyncSession, user: User, *, role: UserRole, is_active: bool) -> None:
    """Refuse a change that would leave no active admin to run the back office."""
    if user.role != UserRole.admin or not user.is_active or (role == UserRole.admin and is_active):
        return
    admins = await db.scalar(
        select(func.count()).select_from(User).where(User.role == UserRole.admin, User.is_active.is_(True))
    )
    if (admins or 0) <= 1:
        raise _conflict("This is the last admin. Make someone else an admin first.")


async def _set_role(db: AsyncSession, actor: User, user: User, role: UserRole) -> None:
    await audit_service.record(
        db, actor, "user.role_changed", "user", user.id,
        before={"role": user.role}, after={"role": role}, context={"email": user.email},
    )
    user.role = role


async def add_member(db: AsyncSession, actor: User, body: TeamMemberAdd) -> TeamMemberRead:
    user = await UserRepository(db).get_by_email(str(body.email))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No account uses that email. Ask them to sign up on the site first, then add them here.",
        )
    if not user.is_verified:
        # Anyone can register with any address; only a verified one proves it's really them.
        raise _conflict("They haven't verified their email yet. Ask them to click the link we sent, then try again.")
    if not user.is_active:
        raise _conflict("This account is deactivated. Find it in the team list and turn it back on.")
    if user.role == UserRole.vendor:
        # Staff can't open the shop portal, so this would lock them out of their own shop.
        raise _conflict("This account runs a shop. Ask them to sign up with a different email for staff work.")
    role = UserRole(body.role)
    if user.role != role:
        if user.id == actor.id:
            raise _conflict("You can't change your own role.")
        await ensure_an_admin_remains(db, user, role=role, is_active=True)
        await _set_role(db, actor, user, role)
        await db.flush()
    return _read(user)


async def update_member(
    db: AsyncSession, actor: User, user_id: uuid.UUID, body: TeamMemberUpdate
) -> TeamMemberRead:
    user = await UserRepository(db).get_by_id(user_id)
    if not user or user.role not in _TEAM:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not on the team")
    role = UserRole(body.role) if body.role else user.role
    is_active = user.is_active if body.is_active is None else body.is_active
    if (role, is_active) == (user.role, user.is_active):
        return _read(user)
    if user.id == actor.id:
        raise _conflict("You can't change your own role or deactivate yourself. Ask another admin.")
    await ensure_an_admin_remains(db, user, role=role, is_active=is_active)

    if role != user.role:
        await _set_role(db, actor, user, role)
    if is_active != user.is_active:
        await audit_service.record(
            db, actor, "user.reactivated" if is_active else "user.deactivated", "user", user.id,
            before={"is_active": user.is_active}, after={"is_active": is_active}, context={"email": user.email},
        )
        user.is_active = is_active
        if not is_active:
            # Sign them out everywhere; their access token already stops working (deps checks is_active).
            await UserRepository(db).revoke_all_user_tokens(user.id)
    await db.flush()
    return _read(user)
