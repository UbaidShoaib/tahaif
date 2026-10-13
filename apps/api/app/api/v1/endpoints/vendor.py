import uuid
from typing import Annotated

from fastapi import APIRouter, Form, Query, UploadFile, status

from app.core.deps import DB, CurrentUser
from app.models.order import FulfillmentStatus
from app.schemas.catalog import ProductRead, VendorRead, VendorUpdate
from app.schemas.vendor import (
    FulfillmentStatusUpdate,
    VendorApplicationCreate,
    VendorApplicationRead,
    VendorFulfillmentRead,
)
from app.services import vendor_application_service, vendor_service

router = APIRouter(prefix="/vendor", tags=["vendor"])


@router.post("/application", response_model=VendorApplicationRead, status_code=status.HTTP_201_CREATED)
async def apply_to_sell(body: VendorApplicationCreate, user: CurrentUser, db: DB) -> VendorApplicationRead:
    """Apply to open a shop. It stays hidden until staff approve it; a rejected
    application can be sent again."""
    return await vendor_application_service.apply(db, user, body)


@router.get("/application", response_model=VendorApplicationRead)
async def my_application(user: CurrentUser, db: DB) -> VendorApplicationRead:
    """Your shop application and its status (404 if you have not applied)."""
    return await vendor_application_service.get_mine(db, user)


@router.get("/me", response_model=VendorRead)
async def get_my_vendor(user: CurrentUser, db: DB) -> VendorRead:
    return await vendor_service.get_my_vendor(db, user)  # type: ignore[return-value]


@router.patch("/me", response_model=VendorRead)
async def update_my_vendor(body: VendorUpdate, user: CurrentUser, db: DB) -> VendorRead:
    return await vendor_service.update_my_vendor(db, user, body)  # type: ignore[return-value]


@router.get("/fulfillments", response_model=list[VendorFulfillmentRead])
async def list_fulfillments(
    user: CurrentUser,
    db: DB,
    filter_status: FulfillmentStatus | None = Query(default=None),  # noqa: B008
) -> list[VendorFulfillmentRead]:
    return await vendor_service.list_my_fulfillments(db, user, filter_status)


@router.get("/fulfillments/{fulfillment_id}", response_model=VendorFulfillmentRead)
async def get_fulfillment(fulfillment_id: uuid.UUID, user: CurrentUser, db: DB) -> VendorFulfillmentRead:
    """One of your fulfillments, with each item's card message (used by the print view)."""
    return await vendor_service.get_my_fulfillment(db, user, fulfillment_id)


@router.patch("/fulfillments/{fulfillment_id}", response_model=VendorFulfillmentRead)
async def update_fulfillment(
    fulfillment_id: uuid.UUID,
    body: FulfillmentStatusUpdate,
    user: CurrentUser,
    db: DB,
) -> VendorFulfillmentRead:
    return await vendor_service.update_fulfillment(db, user, fulfillment_id, body)


@router.post("/fulfillments/{fulfillment_id}/delivery-photo", response_model=VendorFulfillmentRead)
async def confirm_delivery_with_photo(
    fulfillment_id: uuid.UUID,
    file: UploadFile,
    user: CurrentUser,
    db: DB,
    received_by: Annotated[str | None, Form(max_length=255, examples=["Ammi (Mrs. Khan)"])] = None,
) -> VendorFulfillmentRead:
    """Attach a proof-of-delivery photo (JPEG/PNG/WebP, max 10 MB) and mark the
    fulfillment delivered. Allowed once it has been dispatched; on a delivered
    fulfillment it replaces the photo. The buyer sees it on the tracking page."""
    return await vendor_service.confirm_delivery_with_photo(db, user, fulfillment_id, file, received_by)


@router.get("/products", response_model=list[ProductRead])
async def list_my_products(
    user: CurrentUser,
    db: DB,
    page: int = Query(default=1, ge=1),
) -> list[ProductRead]:
    items, _total = await vendor_service.list_my_products(db, user, page=page)
    return items  # type: ignore[return-value]
