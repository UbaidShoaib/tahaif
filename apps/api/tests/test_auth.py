import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.user_repository import UserRepository
from app.services import auth_service

# ── Helpers ───────────────────────────────────────────────────────────────────

async def _register(client: AsyncClient, email: str = "test@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Strongpass1", "full_name": "Test User"},
    )
    return resp


# ── Register ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_register_happy_path(client: AsyncClient, db: AsyncSession) -> None:
    resp = await _register(client, "register_happy@example.com")
    assert resp.status_code == 201
    data = resp.json()
    assert data["user"]["email"] == "register_happy@example.com"
    assert "password_hash" not in str(data)
    assert "access_token" in data
    assert resp.cookies.get("refresh_token")


@pytest.mark.asyncio
async def test_register_duplicate_email(client: AsyncClient) -> None:
    await _register(client, "dupe@example.com")
    resp = await _register(client, "dupe@example.com")
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_register_weak_password(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": "weak@example.com", "password": "alllower1"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_register_no_uppercase(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": "noup@example.com", "password": "alllower123"},
    )
    assert resp.status_code == 422


# ── Login ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_login_happy_path(client: AsyncClient) -> None:
    await _register(client, "login_happy@example.com")
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "login_happy@example.com", "password": "Strongpass1"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert resp.cookies.get("refresh_token")


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient) -> None:
    await _register(client, "login_wrong@example.com")
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "login_wrong@example.com", "password": "WrongPass1"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_unknown_email(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "ghost@example.com", "password": "Strongpass1"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_inactive_user(client: AsyncClient, db: AsyncSession) -> None:
    await _register(client, "inactive@example.com")
    repo = UserRepository(db)
    user = await repo.get_by_email("inactive@example.com")
    assert user
    await repo.update(user, is_active=False)
    await db.commit()

    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "inactive@example.com", "password": "Strongpass1"},
    )
    assert resp.status_code == 403


# ── Refresh & rotation ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_refresh_rotation(client: AsyncClient) -> None:
    await _register(client, "refresh_rotation@example.com")
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "refresh_rotation@example.com", "password": "Strongpass1"},
    )
    token_1 = login_resp.cookies.get("refresh_token")
    assert token_1

    # First refresh should work
    resp1 = await client.post("/api/v1/auth/refresh", json={"refresh_token": token_1})
    assert resp1.status_code == 200
    token_2 = resp1.cookies.get("refresh_token")
    assert token_2 and token_2 != token_1

    # Reusing old token (token_1) should revoke family and return 401
    resp2 = await client.post("/api/v1/auth/refresh", json={"refresh_token": token_1})
    assert resp2.status_code == 401

    # Even the freshly issued token_2 should now be revoked (family revoked)
    resp3 = await client.post("/api/v1/auth/refresh", json={"refresh_token": token_2})
    assert resp3.status_code == 401


@pytest.mark.asyncio
async def test_logout_invalidates_refresh(client: AsyncClient) -> None:
    await _register(client, "logout_test@example.com")
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "logout_test@example.com", "password": "Strongpass1"},
    )
    raw_token = login_resp.cookies.get("refresh_token")
    assert raw_token

    await client.post("/api/v1/auth/logout", json={"refresh_token": raw_token})

    resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": raw_token})
    assert resp.status_code == 401


# ── Password reset ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_forgot_password_always_200(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "definitely_not_registered_xyz@example.com"},
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_reset_password_happy_path(client: AsyncClient, db: AsyncSession) -> None:
    await _register(client, "reset_me@example.com")
    raw_token = await auth_service.forgot_password(db, "reset_me@example.com")
    await db.commit()
    assert raw_token

    resp = await client.post(
        "/api/v1/auth/reset-password",
        json={"token": raw_token, "new_password": "NewStrongPass2"},
    )
    assert resp.status_code == 200

    # Old password should no longer work
    bad = await client.post(
        "/api/v1/auth/login",
        json={"email": "reset_me@example.com", "password": "Strongpass1"},
    )
    assert bad.status_code == 401

    # New password should work
    good = await client.post(
        "/api/v1/auth/login",
        json={"email": "reset_me@example.com", "password": "NewStrongPass2"},
    )
    assert good.status_code == 200


@pytest.mark.asyncio
async def test_reset_password_token_single_use(client: AsyncClient, db: AsyncSession) -> None:
    await _register(client, "single_use@example.com")
    raw_token = await auth_service.forgot_password(db, "single_use@example.com")
    await db.commit()
    assert raw_token

    await client.post(
        "/api/v1/auth/reset-password",
        json={"token": raw_token, "new_password": "NewStrongPass2"},
    )
    resp2 = await client.post(
        "/api/v1/auth/reset-password",
        json={"token": raw_token, "new_password": "AnotherPass3"},
    )
    assert resp2.status_code == 400


@pytest.mark.asyncio
async def test_reset_password_invalid_token(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/reset-password",
        json={"token": "completely_fake_token", "new_password": "NewStrongPass2"},
    )
    assert resp.status_code == 400


# ── /me endpoints ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_me_authenticated(client: AsyncClient) -> None:
    await _register(client, "me_test@example.com")
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "me_test@example.com", "password": "Strongpass1"},
    )
    token = login_resp.json()["access_token"]

    resp = await client.get("/api/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["email"] == "me_test@example.com"


@pytest.mark.asyncio
async def test_get_me_unauthenticated(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_patch_me(client: AsyncClient) -> None:
    await _register(client, "patch_me@example.com")
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "patch_me@example.com", "password": "Strongpass1"},
    )
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.patch(
        "/api/v1/me",
        json={"full_name": "Updated Name", "locale": "ur", "currency_pref": "GBP"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["full_name"] == "Updated Name"
    assert data["locale"] == "ur"
    assert data["currency_pref"] == "GBP"


# ── Address CRUD ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_address_crud(client: AsyncClient) -> None:
    await _register(client, "addr_crud@example.com")
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "addr_crud@example.com", "password": "Strongpass1"},
    )
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Create
    create_resp = await client.post(
        "/api/v1/me/addresses",
        json={
            "recipient_name": "Mama",
            "recipient_phone": "+923001234567",
            "line1": "House 5 Street 10",
            "city_name": "Lahore",
            "is_default": True,
        },
        headers=headers,
    )
    assert create_resp.status_code == 201
    addr_id = create_resp.json()["id"]

    # List
    list_resp = await client.get("/api/v1/me/addresses", headers=headers)
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1

    # Update
    patch_resp = await client.patch(
        f"/api/v1/me/addresses/{addr_id}",
        json={"line1": "House 6 Street 10"},
        headers=headers,
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["line1"] == "House 6 Street 10"

    # Delete
    del_resp = await client.delete(f"/api/v1/me/addresses/{addr_id}", headers=headers)
    assert del_resp.status_code == 204

    # Confirm gone
    list_after = await client.get("/api/v1/me/addresses", headers=headers)
    assert list_after.json() == []


@pytest.mark.asyncio
async def test_address_not_found_returns_404(client: AsyncClient) -> None:
    await _register(client, "addr_notfound@example.com")
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "addr_notfound@example.com", "password": "Strongpass1"},
    )
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    import uuid
    fake_id = uuid.uuid4()
    resp = await client.patch(
        f"/api/v1/me/addresses/{fake_id}",
        json={"line1": "Nope"},
        headers=headers,
    )
    assert resp.status_code == 404
