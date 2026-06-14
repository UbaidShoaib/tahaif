import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import JSONResponse

from app.core.deps import DB, CurrentUser
from app.repositories.address_repository import AddressRepository
from app.repositories.user_repository import UserRepository
from app.schemas.address import AddressCreate, AddressRead, AddressUpdate
from app.schemas.user import UserRead, UserUpdate

router = APIRouter(prefix="/me", tags=["me"])


@router.get("", response_model=UserRead)
async def get_me(current_user: CurrentUser) -> UserRead:
    return UserRead.model_validate(current_user)


@router.patch("", response_model=UserRead)
async def update_me(
    body: UserUpdate,
    current_user: CurrentUser,
    db: DB,
) -> UserRead:
    repo = UserRepository(db)
    updates = body.model_dump(exclude_none=True)
    if updates:
        current_user = await repo.update(current_user, **updates)
    return UserRead.model_validate(current_user)


# ── Addresses ─────────────────────────────────────────────────────────────────

@router.get("/addresses", response_model=list[AddressRead])
async def list_addresses(current_user: CurrentUser, db: DB) -> list[AddressRead]:
    repo = AddressRepository(db)
    addresses = await repo.list_for_user(current_user.id)
    return [AddressRead.model_validate(a) for a in addresses]


@router.post("/addresses", response_model=AddressRead, status_code=status.HTTP_201_CREATED)
async def create_address(
    body: AddressCreate,
    current_user: CurrentUser,
    db: DB,
) -> AddressRead:
    repo = AddressRepository(db)
    address = await repo.create(current_user.id, **body.model_dump())
    return AddressRead.model_validate(address)


@router.patch("/addresses/{address_id}", response_model=AddressRead)
async def update_address(
    address_id: uuid.UUID,
    body: AddressUpdate,
    current_user: CurrentUser,
    db: DB,
) -> AddressRead:
    repo = AddressRepository(db)
    address = await repo.get(address_id, current_user.id)
    if not address:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Address not found")
    updates = body.model_dump(exclude_none=True)
    if updates:
        address = await repo.update(address, **updates)
    return AddressRead.model_validate(address)


@router.delete("/addresses/{address_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_address(
    address_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
) -> None:
    repo = AddressRepository(db)
    address = await repo.get(address_id, current_user.id)
    if not address:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Address not found")
    await repo.soft_delete(address)


# ── GDPR ──────────────────────────────────────────────────────────────────────

@router.get("/export")
async def export_my_data(current_user: CurrentUser, db: DB) -> JSONResponse:
    """Return all personal data for the authenticated user as a JSON download."""
    addr_repo = AddressRepository(db)
    addresses = await addr_repo.list_for_user(current_user.id)

    export = {
        "user": {
            "id": str(current_user.id),
            "email": current_user.email,
            "full_name": current_user.full_name,
            "phone": current_user.phone,
            "locale": current_user.locale,
            "currency_pref": current_user.currency_pref,
            "is_verified": current_user.is_verified,
            "created_at": current_user.created_at.isoformat(),
        },
        "addresses": [
            {
                "id": str(a.id),
                "label": getattr(a, "label", None),
                "line1": getattr(a, "line1", None),
                "line2": getattr(a, "line2", None),
            }
            for a in addresses
        ],
        "exported_at": datetime.now(UTC).isoformat(),
    }

    return JSONResponse(
        content=export,
        headers={"Content-Disposition": 'attachment; filename="tahaif-my-data.json"'},
    )


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(current_user: CurrentUser, db: DB) -> None:
    """Anonymise account and hard-delete refresh tokens (GDPR right to erasure)."""
    repo = UserRepository(db)

    anonymised_email = f"deleted_{current_user.id}@anon.tahaif.invalid"
    await repo.update(
        current_user,
        email=anonymised_email,
        full_name="[Deleted]",
        phone=None,
        password_hash=None,
        avatar_url=None,
        is_active=False,
    )
    await repo.revoke_all_user_tokens(current_user.id)
