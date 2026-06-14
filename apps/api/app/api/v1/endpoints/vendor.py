import uuid

from fastapi import APIRouter, Query

from app.core.deps import DB, CurrentUser
from app.models.order import FulfillmentStatus
from app.schemas.catalog import ProductRead, VendorRead, VendorUpdate
from app.schemas.vendor import FulfillmentStatusUpdate, VendorFulfillmentRead
from app.services import vendor_service

router = APIRouter(prefix="/vendor", tags=["vendor"])


@router.get("/me", response_model=VendorRead)
async def get_my_vendor(user: CurrentUser, db: DB) -> VendorRead:
    return await vendor_service.get_my_vendor(db, user)


@router.patch("/me", response_model=VendorRead)
async def update_my_vendor(body: VendorUpdate, user: CurrentUser, db: DB) -> VendorRead:
    return await vendor_service.update_my_vendor(db, user, body)


@router.get("/fulfillments", response_model=list[VendorFulfillmentRead])
async def list_fulfillments(
    user: CurrentUser,
    db: DB,
    filter_status: FulfillmentStatus | None = Query(default=None),
) -> list[VendorFulfillmentRead]:
    return await vendor_service.list_my_fulfillments(db, user, filter_status)


@router.patch("/fulfillments/{fulfillment_id}", response_model=VendorFulfillmentRead)
async def update_fulfillment(
    fulfillment_id: uuid.UUID,
    body: FulfillmentStatusUpdate,
    user: CurrentUser,
    db: DB,
) -> VendorFulfillmentRead:
    return await vendor_service.update_fulfillment(db, user, fulfillment_id, body)


@router.get("/products", response_model=list[ProductRead])
async def list_my_products(
    user: CurrentUser,
    db: DB,
    page: int = Query(default=1, ge=1),
) -> list[ProductRead]:
    items, _total = await vendor_service.list_my_products(db, user, page=page)
    return items
