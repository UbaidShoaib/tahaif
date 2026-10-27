"""Back-office team: admins add staff by email, change roles, deactivate; staff can't touch money settings."""

import sys
import uuid
from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User, UserRole
from app.repositories.user_repository import UserRepository
from tests.test_audit_log import _admin, _log, _order
from tests.test_social_orders import _login, _make_user, _staff_headers

sys.path.insert(0, str(Path(__file__).parents[1] / "scripts"))
from create_admin import make_admin  # noqa: E402

TEAM = "/api/v1/admin/team"


async def _verified(db: AsyncSession, role: UserRole = UserRole.customer) -> User:
    user = await _make_user(db, role=role)
    return await UserRepository(db).update(user, is_verified=True)


async def _me(client: AsyncClient, headers: dict[str, str]) -> str:
    return (await client.get("/api/v1/me", headers=headers)).json()["id"]


@pytest.mark.asyncio
async def test_admin_adds_a_verified_account_as_staff(client: AsyncClient, db: AsyncSession) -> None:
    admin = await _admin(client, db)
    person = await _verified(db)
    email, person_id = person.email, str(person.id)

    resp = await client.post(TEAM, json={"email": email.upper(), "role": "staff"}, headers=admin)
    assert resp.status_code == 200, resp.text
    assert (resp.json()["role"], resp.json()["is_active"]) == ("staff", True)

    team = (await client.get(TEAM, headers=admin)).json()
    assert any(m["email"] == email and m["role"] == "staff" for m in team)
    assert all(m["role"] in ("staff", "admin") for m in team)
    # The new member can now use the back office.
    staff = {"Authorization": f"Bearer {await _login(client, email)}"}
    assert (await client.get("/api/v1/admin/orders", headers=staff)).status_code == 200
    entry = (await _log(client, admin, entity="user", entity_id=person_id))[0]
    assert (entry["action"], entry["after"]["role"]) == ("user.role_changed", "staff")


@pytest.mark.asyncio
async def test_add_refuses_unknown_unverified_and_shop_accounts(client: AsyncClient, db: AsyncSession) -> None:
    admin = await _admin(client, db)
    unknown = await client.post(TEAM, json={"email": f"nobody_{uuid.uuid4().hex[:6]}@example.com"}, headers=admin)
    assert unknown.status_code == 404
    assert "sign up" in unknown.json()["detail"]

    unverified = await _make_user(db)
    resp = await client.post(TEAM, json={"email": unverified.email}, headers=admin)
    assert resp.status_code == 409 and "verified" in resp.json()["detail"]

    vendor = await _verified(db, UserRole.vendor)
    resp = await client.post(TEAM, json={"email": vendor.email}, headers=admin)
    assert resp.status_code == 409 and "shop" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_deactivating_signs_them_out_and_reactivating_restores(client: AsyncClient, db: AsyncSession) -> None:
    admin = await _admin(client, db)
    person = await _verified(db, UserRole.staff)
    email, url = person.email, f"{TEAM}/{person.id}"
    staff = {"Authorization": f"Bearer {await _login(client, email)}"}

    resp = await client.patch(url, json={"is_active": False}, headers=admin)
    assert resp.status_code == 200 and resp.json()["is_active"] is False
    assert (await client.get("/api/v1/admin/orders", headers=staff)).status_code == 401
    login = await client.post("/api/v1/auth/login", json={"email": email, "password": "Password1"})
    assert login.status_code in (401, 403)

    assert (await client.patch(url, json={"is_active": True}, headers=admin)).status_code == 200
    staff = {"Authorization": f"Bearer {await _login(client, email)}"}
    assert (await client.get("/api/v1/admin/orders", headers=staff)).status_code == 200
    actions = [e["action"] for e in await _log(client, admin, entity="user", entity_id=resp.json()["id"])]
    assert actions == ["user.reactivated", "user.deactivated"]


@pytest.mark.asyncio
async def test_role_change_and_removal_from_team(client: AsyncClient, db: AsyncSession) -> None:
    admin = await _admin(client, db)
    person = await _verified(db, UserRole.staff)
    url = f"{TEAM}/{person.id}"

    assert (await client.patch(url, json={"role": "admin"}, headers=admin)).json()["role"] == "admin"
    assert (await client.patch(url, json={"role": "customer"}, headers=admin)).json()["role"] == "customer"
    # Off the team now, so it's no longer theirs to edit here.
    assert (await client.patch(url, json={"is_active": False}, headers=admin)).status_code == 404


@pytest.mark.asyncio
async def test_no_one_changes_their_own_access(client: AsyncClient, db: AsyncSession) -> None:
    admin = await _admin(client, db)
    me = await _me(client, admin)
    for body in ({"role": "staff"}, {"is_active": False}):
        resp = await client.patch(f"{TEAM}/{me}", json=body, headers=admin)
        assert resp.status_code == 409, body


@pytest.mark.asyncio
async def test_last_active_admin_is_kept(client: AsyncClient, db: AsyncSession) -> None:
    admin = await _admin(client, db)
    me = uuid.UUID(await _me(client, admin))
    other = await _verified(db, UserRole.admin)
    # Earlier tests left admins behind; park them so `me` and `other` are the only active ones.
    parked = (await db.execute(
        update(User)
        .where(User.role == UserRole.admin, User.is_active.is_(True), User.id.not_in([me, other.id]))
        .values(is_active=False)
        .returning(User.id)
    )).scalars().all()
    await db.commit()
    try:
        assert (await client.patch(f"{TEAM}/{other.id}", json={"is_active": False}, headers=admin)).status_code == 200
        # `me` is the only active admin now: the old role endpoint can't demote them either.
        resp = await client.patch(f"/api/v1/admin/users/{me}/role", params={"role": "staff"}, headers=admin)
        assert resp.status_code == 409 and "last admin" in resp.json()["detail"]
    finally:
        await db.execute(update(User).where(User.id.in_(parked)).values(is_active=True))
        await db.commit()


@pytest.mark.asyncio
async def test_staff_cannot_manage_team_money_or_users(client: AsyncClient, db: AsyncSession) -> None:
    staff = await _staff_headers(client, db)
    assert (await client.get(TEAM, headers=staff)).status_code == 403
    assert (await client.post(TEAM, json={"email": "x@example.com"}, headers=staff)).status_code == 403
    assert (await client.get("/api/v1/admin/users", headers=staff)).status_code == 403
    coupon = {"code": f"S{uuid.uuid4().hex[:6]}", "coupon_type": "percent", "value": "10"}
    assert (await client.post("/api/v1/admin/coupons", json=coupon, headers=staff)).status_code == 403
    fx = {"quote_currency": "USD", "rate": "0.0036"}
    assert (await client.post("/api/v1/admin/fx-rates/override", json=fx, headers=staff)).status_code == 403
    # Reading coupons stays open, so staff can check a code a buyer mentions.
    assert (await client.get("/api/v1/admin/coupons", headers=staff)).status_code == 200


@pytest.mark.asyncio
async def test_only_admins_refund(client: AsyncClient, db: AsyncSession) -> None:
    staff = await _staff_headers(client, db)
    admin = await _admin(client, db)
    order = await _order(client, db, staff)
    url = f"/api/v1/admin/orders/{order['id']}"
    assert (await client.patch(f"{url}/status", json={"status": "paid"}, headers=staff)).status_code == 200

    assert "refunded" not in (await client.get(url, headers=staff)).json()["next_statuses"]
    assert "refunded" in (await client.get(url, headers=admin)).json()["next_statuses"]
    listed = (await client.get("/api/v1/admin/orders", headers=staff)).json()["items"]
    assert "refunded" not in next(o for o in listed if o["id"] == order["id"])["next_statuses"]

    resp = await client.patch(f"{url}/status", json={"status": "refunded"}, headers=staff)
    assert resp.status_code == 403 and "admin" in resp.json()["detail"]
    assert (await client.patch(f"{url}/status", json={"status": "refunded"}, headers=admin)).status_code == 200


@pytest.mark.asyncio
async def test_create_admin_script_promotes_or_creates(db: AsyncSession) -> None:
    existing = await _make_user(db)
    assert "now an admin" in await make_admin(db, existing.email)
    assert (existing.role, existing.is_verified) == (UserRole.admin, True)

    email = f"boss_{uuid.uuid4().hex[:6]}@example.com"
    with pytest.raises(ValueError):
        await make_admin(db, email)
    with pytest.raises(ValueError):  # sign-up's password rules apply
        await make_admin(db, email, "short")
    assert "Created" in await make_admin(db, email, "Password1")
    created = await UserRepository(db).get_by_email(email)
    assert created is not None and created.role == UserRole.admin
