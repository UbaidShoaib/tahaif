"""Email verification by 6-digit code: send, verify, lockout, checkout gate."""

import uuid

import pytest
from fastapi import HTTPException
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.services import checkout_service, email_verification_service


async def _make_user(db: AsyncSession) -> User:
    return await UserRepository(db).create(
        email=f"ev_{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password1"),
    )


@pytest.fixture
def fixed_code(monkeypatch: pytest.MonkeyPatch) -> str:
    monkeypatch.setattr(email_verification_service, "generate_code", lambda: "123456")
    return "123456"


def test_generate_code_is_six_digits() -> None:
    for _ in range(50):
        code = email_verification_service.generate_code()
        assert len(code) == 6 and code.isdigit()


async def test_verify_with_right_code_marks_verified(db: AsyncSession, fixed_code: str) -> None:
    user = await _make_user(db)
    await email_verification_service.send_code(user)
    verified = await email_verification_service.verify_code(db, user, fixed_code)
    assert verified.is_verified is True


async def test_wrong_code_rejected(db: AsyncSession, fixed_code: str) -> None:  # noqa: ARG001
    user = await _make_user(db)
    await email_verification_service.send_code(user)
    with pytest.raises(HTTPException) as exc:
        await email_verification_service.verify_code(db, user, "000000")
    assert exc.value.status_code == 400
    assert user.is_verified is False


async def test_code_burned_after_max_attempts(db: AsyncSession, fixed_code: str) -> None:
    user = await _make_user(db)
    await email_verification_service.send_code(user)
    for _ in range(email_verification_service.MAX_ATTEMPTS):
        with pytest.raises(HTTPException):
            await email_verification_service.verify_code(db, user, "000000")
    # Even the right code no longer works — a new one must be requested.
    with pytest.raises(HTTPException):
        await email_verification_service.verify_code(db, user, fixed_code)


async def test_resend_cooldown(db: AsyncSession) -> None:
    user = await _make_user(db)
    await email_verification_service.send_code(user)
    with pytest.raises(HTTPException) as exc:
        await email_verification_service.send_code(user)
    assert exc.value.status_code == 429


async def test_no_code_sent_rejects(db: AsyncSession) -> None:
    user = await _make_user(db)
    with pytest.raises(HTTPException):
        await email_verification_service.verify_code(db, user, "123456")


async def test_signup_then_verify_over_http(client: AsyncClient, fixed_code: str) -> None:
    email = f"ev_http_{uuid.uuid4().hex[:8]}@example.com"
    res = await client.post(
        "/api/v1/auth/register", json={"email": email, "password": "Password1"}
    )
    assert res.status_code == 201
    assert res.json()["user"]["is_verified"] is False
    headers = {"Authorization": f"Bearer {res.json()['access_token']}"}

    bad = await client.post("/api/v1/auth/verify-email", json={"code": "999999"}, headers=headers)
    assert bad.status_code == 400
    malformed = await client.post("/api/v1/auth/verify-email", json={"code": "12ab"}, headers=headers)
    assert malformed.status_code == 422

    ok = await client.post("/api/v1/auth/verify-email", json={"code": fixed_code}, headers=headers)
    assert ok.status_code == 200
    assert ok.json()["is_verified"] is True

    me = await client.get("/api/v1/me", headers=headers)
    assert me.json()["is_verified"] is True


async def test_verify_requires_auth(client: AsyncClient) -> None:
    res = await client.post("/api/v1/auth/verify-email", json={"code": "123456"})
    assert res.status_code == 401


async def test_unverified_user_cannot_check_out(
    db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(checkout_service.settings, "require_verified_email_for_checkout", True)
    user = await _make_user(db)
    with pytest.raises(HTTPException) as exc:
        await checkout_service.place_order(db, user, body=None)  # type: ignore[arg-type]
    assert exc.value.status_code == 403
