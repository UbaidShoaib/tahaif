import uuid

from fastapi import APIRouter, HTTPException, status

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
