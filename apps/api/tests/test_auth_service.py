"""Direct unit tests for auth_service — covers branches missed by HTTP-layer tests."""
import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.auth import RegisterRequest
from app.services import auth_service


@pytest.mark.asyncio
async def test_register_service_creates_user(db: AsyncSession) -> None:
    user, pair = await auth_service.register(
        db, RegisterRequest(email="svc_register@example.com", password="Strongpass1")
    )
    await db.commit()
    assert user.email == "svc_register@example.com"
    assert user.password_hash
    assert pair.access_token
    assert pair.refresh_token


@pytest.mark.asyncio
async def test_register_service_duplicate_raises_409(db: AsyncSession) -> None:
    await auth_service.register(
        db, RegisterRequest(email="svc_dupe@example.com", password="Strongpass1")
    )
    await db.commit()
    with pytest.raises(HTTPException) as exc_info:
        await auth_service.register(
            db, RegisterRequest(email="svc_dupe@example.com", password="Strongpass1")
        )
    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
async def test_login_service_happy_path(db: AsyncSession) -> None:
    await auth_service.register(
        db, RegisterRequest(email="svc_login@example.com", password="Strongpass1")
    )
    await db.commit()
    db.expire_all()

    user, pair = await auth_service.login(db, "svc_login@example.com", "Strongpass1")
    await db.commit()
    assert user.email == "svc_login@example.com"
    assert pair.access_token


@pytest.mark.asyncio
async def test_login_service_wrong_password(db: AsyncSession) -> None:
    await auth_service.register(
        db, RegisterRequest(email="svc_badpw@example.com", password="Strongpass1")
    )
    await db.commit()
    db.expire_all()

    with pytest.raises(HTTPException) as exc_info:
        await auth_service.login(db, "svc_badpw@example.com", "WrongPass1")
    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_login_service_unknown_email(db: AsyncSession) -> None:
    with pytest.raises(HTTPException) as exc_info:
        await auth_service.login(db, "ghost@example.com", "Strongpass1")
    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_refresh_service_rotation(db: AsyncSession) -> None:
    await auth_service.register(
        db, RegisterRequest(email="svc_refresh@example.com", password="Strongpass1")
    )
    await db.commit()
    db.expire_all()

    _user, pair1 = await auth_service.login(db, "svc_refresh@example.com", "Strongpass1")
    await db.commit()
    db.expire_all()

    _user2, pair2 = await auth_service.refresh(db, pair1.refresh_token)
    await db.commit()
    db.expire_all()
    # Refresh token must rotate (new raw token); access token may match if within same second
    assert pair2.refresh_token != pair1.refresh_token

    # Reuse old token → theft detection → 401
    with pytest.raises(HTTPException) as exc_info:
        await auth_service.refresh(db, pair1.refresh_token)
    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_logout_service(db: AsyncSession) -> None:
    await auth_service.register(
        db, RegisterRequest(email="svc_logout@example.com", password="Strongpass1")
    )
    await db.commit()
    db.expire_all()

    _user, pair = await auth_service.login(db, "svc_logout@example.com", "Strongpass1")
    await db.commit()
    db.expire_all()

    await auth_service.logout(db, pair.refresh_token)
    await db.commit()
    db.expire_all()

    # Token should now be invalid
    with pytest.raises(HTTPException) as exc_info:
        await auth_service.refresh(db, pair.refresh_token)
    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_forgot_password_unknown_email_returns_none(db: AsyncSession) -> None:
    result = await auth_service.forgot_password(db, "nobody@example.com")
    assert result is None


@pytest.mark.asyncio
async def test_forgot_password_known_email_returns_token(db: AsyncSession) -> None:
    await auth_service.register(
        db, RegisterRequest(email="svc_forgot@example.com", password="Strongpass1")
    )
    await db.commit()
    db.expire_all()

    token = await auth_service.forgot_password(db, "svc_forgot@example.com")
    await db.commit()
    assert token is not None


@pytest.mark.asyncio
async def test_reset_password_service(db: AsyncSession) -> None:
    await auth_service.register(
        db, RegisterRequest(email="svc_reset@example.com", password="Strongpass1")
    )
    await db.commit()
    db.expire_all()

    raw_token = await auth_service.forgot_password(db, "svc_reset@example.com")
    await db.commit()
    db.expire_all()
    assert raw_token

    await auth_service.reset_password(db, raw_token, "NewStrongPass2")
    await db.commit()
    db.expire_all()

    # Old password should fail
    with pytest.raises(HTTPException) as exc_info:
        await auth_service.login(db, "svc_reset@example.com", "Strongpass1")
    assert exc_info.value.status_code == 401

    # New password should work
    user, _ = await auth_service.login(db, "svc_reset@example.com", "NewStrongPass2")
    assert user.email == "svc_reset@example.com"


@pytest.mark.asyncio
async def test_reset_password_invalid_token(db: AsyncSession) -> None:
    with pytest.raises(HTTPException) as exc_info:
        await auth_service.reset_password(db, "fake_token", "NewStrongPass2")
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_reset_password_single_use(db: AsyncSession) -> None:
    await auth_service.register(
        db, RegisterRequest(email="svc_singleuse@example.com", password="Strongpass1")
    )
    await db.commit()
    db.expire_all()

    raw_token = await auth_service.forgot_password(db, "svc_singleuse@example.com")
    await db.commit()
    db.expire_all()

    await auth_service.reset_password(db, raw_token, "NewStrongPass2")
    await db.commit()
    db.expire_all()

    with pytest.raises(HTTPException) as exc_info:
        await auth_service.reset_password(db, raw_token, "AnotherPass3")
    assert exc_info.value.status_code == 400
