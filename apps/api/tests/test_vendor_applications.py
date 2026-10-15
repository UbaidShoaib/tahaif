"""Opening a shop: apply → staff approve/reject, and what an applicant can't do alone."""

import uuid
from types import SimpleNamespace

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import UserRole
from app.repositories.catalog_repository import CityRepository
from app.repositories.user_repository import UserRepository

API = "/api/v1"


# Plain values, not ORM rows: the client fixture expires every row after each
# request, and reading an expired attribute outside a greenlet fails.
User = SimpleNamespace
City = SimpleNamespace


async def _make_user(db: AsyncSession, role: UserRole = UserRole.customer) -> User:
    from app.core.security import hash_password

    email = f"user_{uuid.uuid4().hex[:8]}@example.com"
    await UserRepository(db).create(
        email=email, password_hash=hash_password("Password1"), role=role, full_name="Ayesha Khan"
    )
    await db.commit()
    return SimpleNamespace(email=email)


async def _headers(client: AsyncClient, user: User) -> dict[str, str]:
    resp = await client.post(f"{API}/auth/login", json={"email": user.email, "password": "Password1"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture(autouse=True)
def fake_storage(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Documents go to a private bucket; record keys instead of calling S3."""
    from app.integrations import s3_client

    deleted: list[str] = []

    async def _upload(vendor_id: str, document_id: str, data: bytes, content_type: str) -> str:
        if content_type not in s3_client.VENDOR_DOC_MIME_TYPES:
            from fastapi import HTTPException

            raise HTTPException(status_code=415, detail="Upload a photo (JPEG, PNG, WebP) or a PDF")
        return f"vendor-docs/{vendor_id}/{document_id}"

    async def _delete(key: str) -> None:
        deleted.append(key)

    monkeypatch.setattr(s3_client, "upload_vendor_document", _upload)
    monkeypatch.setattr(s3_client, "delete_object", _delete)
    monkeypatch.setattr(s3_client, "presign_get", lambda key, **_: f"https://signed.example/{key}")
    return deleted


@pytest_asyncio.fixture
async def city(db: AsyncSession) -> City:
    slug = f"city-{uuid.uuid4().hex[:6]}"
    row = await CityRepository(db).create(name=slug.title(), slug=slug, timezone="Asia/Karachi")
    await db.commit()
    return SimpleNamespace(id=row.id, name=row.name)


@pytest_asyncio.fixture
async def admin(db: AsyncSession) -> User:
    return await _make_user(db, UserRole.admin)


def _form(city: City, name: str | None = None) -> dict[str, str]:
    return {
        "name": name or f"Gulberg Florist {uuid.uuid4().hex[:5]}",
        "city_id": str(city.id),
        "contact_phone": "+92 300 1234567",
        "description": "Hand-tied bouquets.",
        "bank_account_title": "Ayesha Khan",
        "bank_name": "Meezan Bank",
        "bank_iban": "pk36 scbl 0000 0011 2345 6702",
    }


async def _upload(client: AsyncClient, headers: dict[str, str], kind: str, content_type: str = "image/jpeg"):
    return await client.post(
        f"{API}/vendor/application/documents",
        data={"kind": kind},
        files={"file": (f"{kind}.jpg", b"fake-bytes", content_type)},
        headers=headers,
    )


async def _apply(client: AsyncClient, db: AsyncSession, city: City) -> tuple[User, dict[str, str], dict]:
    user = await _make_user(db)
    headers = await _headers(client, user)
    resp = await client.post(f"{API}/vendor/application", json=_form(city), headers=headers)
    assert resp.status_code == 201, resp.text
    for kind in ("cnic_front", "cnic_back"):
        assert (await _upload(client, headers, kind)).status_code == 201
    return user, headers, (await client.get(f"{API}/vendor/application", headers=headers)).json()


async def test_application_is_pending_and_hidden_everywhere(
    client: AsyncClient, db: AsyncSession, city: City
) -> None:
    user, headers, app = await _apply(client, db, city)

    assert app["status"] == "pending"
    assert app["city_name"] == city.name
    assert (await client.get(f"{API}/vendor/application", headers=headers)).json()["id"] == app["id"]
    listed = (await client.get(f"{API}/vendors")).json()
    assert app["slug"] not in [v["slug"] for v in listed]
    assert (await client.get(f"{API}/vendors/{app['slug']}")).status_code == 404
    # No portal access and no role until staff say so.
    assert (await client.get(f"{API}/vendor/me", headers=headers)).status_code == 403
    assert (await client.get(f"{API}/me", headers=headers)).json()["role"] == "customer"


async def test_one_open_application_per_user(client: AsyncClient, db: AsyncSession, city: City) -> None:
    _, headers, _ = await _apply(client, db, city)

    again = await client.post(f"{API}/vendor/application", json=_form(city), headers=headers)

    assert again.status_code == 409
    assert "already being reviewed" in again.json()["detail"]


async def test_same_shop_name_gets_its_own_slug(client: AsyncClient, db: AsyncSession, city: City) -> None:
    name = f"Rose Corner {uuid.uuid4().hex[:5]}"
    slugs = []
    for _ in range(2):
        headers = await _headers(client, await _make_user(db))
        resp = await client.post(f"{API}/vendor/application", json=_form(city, name), headers=headers)
        slugs.append(resp.json()["slug"])

    assert slugs[0] != slugs[1]
    assert slugs[1].startswith(slugs[0])


@pytest.mark.parametrize(
    ("field", "value", "code"),
    [
        ("contact_phone", "call me", 422),
        ("name", "x", 422),
        ("city_id", str(uuid.uuid4()), 404),
        ("bank_iban", "GB29NWBK60161331926819", 422),
        ("bank_iban", "PK36SCBL00000011234", 422),
    ],
)
async def test_application_is_validated(
    client: AsyncClient, db: AsyncSession, city: City, field: str, value: str, code: int
) -> None:
    headers = await _headers(client, await _make_user(db))

    resp = await client.post(f"{API}/vendor/application", json={**_form(city), field: value}, headers=headers)

    assert resp.status_code == code


async def test_no_application_is_a_404_and_guests_are_turned_away(client: AsyncClient, db: AsyncSession, city: City) -> None:
    headers = await _headers(client, await _make_user(db))

    assert (await client.get(f"{API}/vendor/application", headers=headers)).status_code == 404
    assert (await client.post(f"{API}/vendor/application", json=_form(city))).status_code in (401, 403)


async def test_approval_opens_the_shop_and_makes_the_owner_a_vendor(
    client: AsyncClient, db: AsyncSession, city: City, admin: User
) -> None:
    user, headers, app = await _apply(client, db, city)
    admin_headers = await _headers(client, admin)

    queue = await client.get(f"{API}/admin/vendor-applications", params={"status": "pending"}, headers=admin_headers)
    row = next(a for a in queue.json() if a["id"] == app["id"])
    assert row["applicant_email"] == user.email
    assert row["applicant_name"] == "Ayesha Khan"

    resp = await client.post(f"{API}/admin/vendor-applications/{app['id']}/approve", headers=admin_headers)

    assert resp.status_code == 200
    assert resp.json()["status"] == "approved"
    assert resp.json()["reviewed_at"] is not None
    assert (await client.get(f"{API}/vendors/{app['slug']}")).status_code == 200
    assert (await client.get(f"{API}/vendor/me", headers=headers)).json()["slug"] == app["slug"]
    login = await client.post(f"{API}/auth/login", json={"email": user.email, "password": "Password1"})
    assert login.json()["user"]["role"] == "vendor"
    # Decided once: a second click, or a late reject, changes nothing.
    again = await client.post(f"{API}/admin/vendor-applications/{app['id']}/approve", headers=admin_headers)
    late = await client.post(f"{API}/admin/vendor-applications/{app['id']}/reject", json={}, headers=admin_headers)
    assert (again.status_code, late.status_code) == (409, 409)
    assert (await client.post(f"{API}/vendor/application", json=_form(city), headers=headers)).status_code == 409


async def test_rejection_shows_the_reason_and_allows_a_new_attempt(
    client: AsyncClient, db: AsyncSession, city: City, admin: User
) -> None:
    _, headers, app = await _apply(client, db, city)
    admin_headers = await _headers(client, admin)

    resp = await client.post(
        f"{API}/admin/vendor-applications/{app['id']}/reject",
        json={"note": "  No bakeries yet.  "},
        headers=admin_headers,
    )

    assert resp.json()["status"] == "rejected"
    mine = (await client.get(f"{API}/vendor/application", headers=headers)).json()
    assert (mine["status"], mine["review_note"]) == ("rejected", "No bakeries yet.")
    assert (await client.get(f"{API}/vendors/{app['slug']}")).status_code == 404
    assert (await client.get(f"{API}/vendor/me", headers=headers)).status_code == 403

    retry = await client.post(f"{API}/vendor/application", json=_form(city, "Second Try"), headers=headers)

    assert retry.status_code == 201
    body = retry.json()
    assert (body["id"], body["status"], body["name"], body["review_note"]) == (app["id"], "pending", "Second Try", None)


async def test_only_staff_review_applications(client: AsyncClient, db: AsyncSession, city: City) -> None:
    _, headers, app = await _apply(client, db, city)

    assert (await client.get(f"{API}/admin/vendor-applications", headers=headers)).status_code == 403
    approve = await client.post(f"{API}/admin/vendor-applications/{app['id']}/approve", headers=headers)
    assert approve.status_code == 403
    assert (await client.get(f"{API}/vendor/application", headers=headers)).json()["status"] == "pending"


async def test_unknown_application_is_a_404(client: AsyncClient, admin: User) -> None:
    admin_headers = await _headers(client, admin)

    resp = await client.post(f"{API}/admin/vendor-applications/{uuid.uuid4()}/approve", headers=admin_headers)

    assert resp.status_code == 404


async def test_staff_applicant_keeps_their_role(client: AsyncClient, db: AsyncSession, city: City, admin: User) -> None:
    staff = await _make_user(db, UserRole.staff)
    staff_headers = await _headers(client, staff)
    app = (await client.post(f"{API}/vendor/application", json=_form(city), headers=staff_headers)).json()

    await client.post(f"{API}/admin/vendor-applications/{app['id']}/approve", headers=await _headers(client, admin))

    login = await client.post(f"{API}/auth/login", json={"email": staff.email, "password": "Password1"})
    assert login.json()["user"]["role"] == "staff"


async def test_owner_cannot_open_their_own_shop(client: AsyncClient, db: AsyncSession, city: City) -> None:
    _, headers, app = await _apply(client, db, city)

    resp = await client.patch(f"{API}/vendors/{app['slug']}", json={"is_active": True}, headers=headers)

    assert resp.status_code == 403
    assert (await client.get(f"{API}/vendors/{app['slug']}")).status_code == 404


async def test_pending_shop_cannot_list_products(client: AsyncClient, db: AsyncSession, city: City) -> None:
    _, headers, app = await _apply(client, db, city)

    resp = await client.post(
        f"{API}/products",
        json={"vendor_id": app["id"], "name": "Early Roses", "slug": f"early-{uuid.uuid4().hex[:6]}", "base_price_pkr": 100000},
        headers=headers,
    )

    assert resp.status_code == 403
    assert "not been approved" in resp.json()["detail"]


async def test_vendor_product_waits_for_staff_to_publish_it(
    client: AsyncClient, db: AsyncSession, city: City, admin: User
) -> None:
    _, headers, app = await _apply(client, db, city)
    admin_headers = await _headers(client, admin)
    await client.post(f"{API}/admin/vendor-applications/{app['id']}/approve", headers=admin_headers)
    slug = f"peonies-{uuid.uuid4().hex[:6]}"

    created = await client.post(
        f"{API}/products",
        json={"vendor_id": app["id"], "name": "Peonies", "slug": slug, "base_price_pkr": 250000},
        headers=headers,
    )

    assert created.status_code == 201
    assert created.json()["is_active"] is False
    assert (await client.get(f"{API}/products/{slug}")).status_code == 404
    # The vendor can edit it but not publish it.
    assert (await client.patch(f"{API}/products/{slug}", json={"name": "Pink Peonies"}, headers=headers)).status_code == 200
    assert (await client.patch(f"{API}/products/{slug}", json={"is_active": True}, headers=headers)).status_code == 403

    waiting = await client.get(f"{API}/admin/products", params={"is_active": "false"}, headers=admin_headers)
    row = next(p for p in waiting.json() if p["slug"] == slug)
    assert (row["name"], row["vendor_name"], row["is_active"]) == ("Pink Peonies", app["name"], False)
    assert (await client.get(f"{API}/admin/products", headers=headers)).status_code == 403

    await client.patch(f"{API}/admin/products/{row['id']}/active", json={"is_active": True}, headers=admin_headers)

    assert (await client.get(f"{API}/products/{slug}")).status_code == 200
    # Once published, the vendor may hide it again but still not re-publish it.
    assert (await client.patch(f"{API}/products/{slug}", json={"is_active": False}, headers=headers)).status_code == 200
    assert (await client.patch(f"{API}/products/{slug}", json={"is_active": True}, headers=headers)).status_code == 403


async def test_bank_details_and_documents_are_kept_private_to_owner_and_staff(
    client: AsyncClient, db: AsyncSession, city: City, admin: User
) -> None:
    _, headers, app = await _apply(client, db, city)

    assert app["bank_iban"] == "PK36SCBL0000001123456702"
    assert [d["kind"] for d in app["documents"]] == ["cnic_front", "cnic_back"]
    assert app["missing_documents"] == []
    assert all(d["url"] is None for d in app["documents"])  # owners get no links

    queue = await client.get(
        f"{API}/admin/vendor-applications", params={"status": "pending"}, headers=await _headers(client, admin)
    )
    row = next(a for a in queue.json() if a["id"] == app["id"])
    assert row["bank_name"] == "Meezan Bank"
    assert all(d["url"].startswith("https://signed.example/vendor-docs/") for d in row["documents"])


async def test_cannot_approve_without_cnic(client: AsyncClient, db: AsyncSession, city: City, admin: User) -> None:
    headers = await _headers(client, await _make_user(db))
    app = (await client.post(f"{API}/vendor/application", json=_form(city), headers=headers)).json()
    assert app["missing_documents"] == ["cnic_front", "cnic_back"]
    await _upload(client, headers, "cnic_front")

    resp = await client.post(
        f"{API}/admin/vendor-applications/{app['id']}/approve", headers=await _headers(client, admin)
    )

    assert resp.status_code == 409
    assert "cnic back" in resp.json()["detail"]


async def test_reupload_replaces_and_delete_removes(
    client: AsyncClient, db: AsyncSession, city: City, fake_storage: list[str]
) -> None:
    _, headers, app = await _apply(client, db, city)
    first = next(d for d in app["documents"] if d["kind"] == "cnic_front")

    again = await _upload(client, headers, "cnic_front")
    docs = again.json()["documents"]
    assert [d["kind"] for d in docs].count("cnic_front") == 1
    assert first["id"] not in [d["id"] for d in docs]
    assert len(fake_storage) == 1

    back = next(d for d in docs if d["kind"] == "cnic_back")
    resp = await client.delete(f"{API}/vendor/application/documents/{back['id']}", headers=headers)
    assert resp.json()["missing_documents"] == ["cnic_back"]
    gone = await client.delete(f"{API}/vendor/application/documents/{back['id']}", headers=headers)
    assert gone.status_code == 404


async def test_document_rules(client: AsyncClient, db: AsyncSession, city: City, admin: User) -> None:
    # Applying comes first.
    stranger = await _headers(client, await _make_user(db))
    assert (await _upload(client, stranger, "cnic_front")).status_code == 404

    _, headers, app = await _apply(client, db, city)
    assert (await _upload(client, headers, "cnic_front", "text/plain")).status_code == 415
    assert (await _upload(client, headers, "selfie")).status_code == 422

    await client.post(f"{API}/admin/vendor-applications/{app['id']}/approve", headers=await _headers(client, admin))
    # Decided applications are frozen.
    assert (await _upload(client, headers, "shop_photo")).status_code == 409
