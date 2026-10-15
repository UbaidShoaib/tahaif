"""Opening a shop: a signed-in user applies, staff approve or reject.

An application is a Vendor row that is hidden (is_active False) and
`pending`. Approval opens the shop and makes its owner a vendor; nothing an
applicant can do on their own publishes anything (ADR 0008).
"""
import re
import uuid
from datetime import UTC, datetime

import structlog
from fastapi import HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations import s3_client
from app.models.catalog import (
    REQUIRED_VENDOR_DOCUMENTS,
    Vendor,
    VendorApprovalStatus,
    VendorDocumentKind,
)
from app.models.user import User, UserRole
from app.repositories.catalog_repository import CityRepository, VendorRepository
from app.repositories.user_repository import UserRepository
from app.schemas.vendor import (
    AdminVendorApplicationRead,
    VendorApplicationCreate,
    VendorApplicationRead,
    VendorDocumentRead,
)
from app.services import proof_service

logger = structlog.get_logger()

_PENDING = VendorApprovalStatus.pending.value
_APPROVED = VendorApprovalStatus.approved.value
_REJECTED = VendorApprovalStatus.rejected.value


def _conflict(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")


def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:80] or "shop"


async def _free_slug(repo: VendorRepository, name: str) -> str:
    base = _slugify(name)
    if not await repo.get_by_slug(base):
        return base
    return f"{base}-{uuid.uuid4().hex[:6]}"


def _missing_documents(vendor: Vendor) -> list[VendorDocumentKind]:
    have = {d.kind for d in vendor.documents}
    return [k for k in REQUIRED_VENDOR_DOCUMENTS if k.value not in have]


def _documents(vendor: Vendor, signed: bool) -> list[VendorDocumentRead]:
    return [
        VendorDocumentRead(
            id=d.id,
            kind=VendorDocumentKind(d.kind),
            filename=d.filename,
            content_type=d.content_type,
            created_at=d.created_at,
            url=proof_service.signed_vendor_document_url(d.object_key) if signed else None,
        )
        for d in vendor.documents
    ]


def _read(vendor: Vendor, signed: bool = False) -> VendorApplicationRead:
    return VendorApplicationRead(
        id=vendor.id,
        name=vendor.name,
        slug=vendor.slug,
        city_id=vendor.city_id,
        city_name=vendor.city.name,
        contact_phone=vendor.contact_phone,
        description=vendor.description,
        status=VendorApprovalStatus(vendor.approval_status),
        review_note=vendor.review_note,
        created_at=vendor.created_at,
        reviewed_at=vendor.reviewed_at,
        bank_account_title=vendor.bank_account_title,
        bank_name=vendor.bank_name,
        bank_iban=vendor.bank_iban,
        documents=_documents(vendor, signed),
        missing_documents=_missing_documents(vendor),
    )


def _admin_read(vendor: Vendor) -> AdminVendorApplicationRead:
    owner = vendor.owner
    return AdminVendorApplicationRead(
        **_read(vendor, signed=True).model_dump(),
        applicant_email=owner.email if owner else "",
        applicant_name=owner.full_name if owner else None,
    )


async def apply(db: AsyncSession, user: User, data: VendorApplicationCreate) -> VendorApplicationRead:
    """Submit an application, or resubmit one that was rejected."""
    repo = VendorRepository(db)
    city = await CityRepository(db).get_by_id(data.city_id)
    if not city or not city.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="City not found")

    existing = await repo.get_application_by_owner(user.id)
    if existing and existing.approval_status == _PENDING:
        raise _conflict("Your application is already being reviewed")
    if existing and existing.approval_status == _APPROVED:
        raise _conflict("You already have a shop")

    fields = {
        "name": data.name.strip(),
        "city_id": data.city_id,
        "contact_phone": data.contact_phone.strip(),
        "description": (data.description or "").strip() or None,
        "bank_account_title": data.bank_account_title.strip(),
        "bank_name": data.bank_name.strip(),
        "bank_iban": data.bank_iban,
        "approval_status": _PENDING,
        "is_active": False,
        "review_note": None,
        "reviewed_at": None,
    }
    if existing:  # rejected: the same row goes back into the queue
        await repo.update(existing, **fields)
        vendor_id = existing.id
    else:
        slug = await _free_slug(repo, data.name)
        vendor_id = (await repo.create(owner_user_id=user.id, slug=slug, **fields)).id

    await logger.ainfo("vendor_application_submitted", vendor_id=str(vendor_id), user_id=str(user.id))
    vendor = await repo.get_application(vendor_id)
    assert vendor is not None
    return _read(vendor)


async def get_mine(db: AsyncSession, user: User) -> VendorApplicationRead:
    vendor = await VendorRepository(db).get_application_by_owner(user.id)
    if not vendor:
        raise _not_found()
    return _read(vendor)


async def list_applications(
    db: AsyncSession, approval_status: VendorApprovalStatus | None = None
) -> list[AdminVendorApplicationRead]:
    vendors = await VendorRepository(db).list_applications(
        approval_status.value if approval_status else None
    )
    return [_admin_read(v) for v in vendors]


async def _pending_or_409(repo: VendorRepository, vendor_id: uuid.UUID) -> Vendor:
    vendor = await repo.get_application(vendor_id)
    if not vendor or vendor.owner_user_id is None:
        raise _not_found()
    if vendor.approval_status != _PENDING:
        raise _conflict(f"Application is already {vendor.approval_status}")
    return vendor


async def approve(db: AsyncSession, reviewer: User, vendor_id: uuid.UUID) -> AdminVendorApplicationRead:
    """Open the shop and make its owner a vendor (staff and admins keep their role).
    Needs payout bank details and both sides of the owner's CNIC."""
    repo = VendorRepository(db)
    vendor = await _pending_or_409(repo, vendor_id)
    gaps = [k.value.replace("_", " ") for k in _missing_documents(vendor)]
    if not vendor.bank_iban:
        gaps.insert(0, "bank details")
    if gaps:
        raise _conflict(f"Cannot approve yet; missing: {', '.join(gaps)}")
    await repo.update(
        vendor, approval_status=_APPROVED, is_active=True, review_note=None, reviewed_at=datetime.now(UTC)
    )
    owner = await UserRepository(db).get_by_id(vendor.owner_user_id)  # type: ignore[arg-type]
    if owner and owner.role == UserRole.customer:
        await UserRepository(db).update(owner, role=UserRole.vendor)

    await logger.ainfo("vendor_application_approved", vendor_id=str(vendor_id), reviewer_id=str(reviewer.id))
    refreshed = await repo.get_application(vendor_id)
    assert refreshed is not None
    return _admin_read(refreshed)


async def reject(
    db: AsyncSession, reviewer: User, vendor_id: uuid.UUID, note: str | None
) -> AdminVendorApplicationRead:
    repo = VendorRepository(db)
    vendor = await _pending_or_409(repo, vendor_id)
    await repo.update(
        vendor,
        approval_status=_REJECTED,
        is_active=False,
        review_note=(note or "").strip() or None,
        reviewed_at=datetime.now(UTC),
    )
    await logger.ainfo("vendor_application_rejected", vendor_id=str(vendor_id), reviewer_id=str(reviewer.id))
    refreshed = await repo.get_application(vendor_id)
    assert refreshed is not None
    return _admin_read(refreshed)


_EDITABLE = (_PENDING, _REJECTED)


async def _own_open_application(repo: VendorRepository, user: User) -> Vendor:
    vendor = await repo.get_application_by_owner(user.id)
    if not vendor:
        raise _not_found()
    if vendor.approval_status not in _EDITABLE:
        raise _conflict("Documents can only be changed while the application is open")
    return vendor


async def upload_document(
    db: AsyncSession, user: User, kind: VendorDocumentKind, file: UploadFile
) -> VendorApplicationRead:
    """Add a verification document; uploading a kind again replaces the earlier file."""
    repo = VendorRepository(db)
    vendor = await _own_open_application(repo, user)
    vendor_id = vendor.id
    data = await file.read()
    content_type = file.content_type or "application/octet-stream"
    document_id = uuid.uuid4()
    key = await s3_client.upload_vendor_document(str(vendor_id), str(document_id), data, content_type)

    replaced = [d for d in vendor.documents if d.kind == kind.value]
    old_keys = [d.object_key for d in replaced]
    for old in replaced:
        await repo.delete_document(old)
    await repo.add_document(
        id=document_id,
        vendor_id=vendor_id,
        kind=kind.value,
        object_key=key,
        content_type=content_type,
        filename=(file.filename or kind.value)[:255],
    )
    for key in old_keys:
        await s3_client.delete_object(key)

    await logger.ainfo("vendor_document_uploaded", vendor_id=str(vendor_id), kind=kind.value)
    refreshed = await repo.get_application(vendor_id)
    assert refreshed is not None
    return _read(refreshed)


async def delete_document(db: AsyncSession, user: User, document_id: uuid.UUID) -> VendorApplicationRead:
    repo = VendorRepository(db)
    vendor = await _own_open_application(repo, user)
    vendor_id = vendor.id
    doc = await repo.get_document(vendor_id, document_id)
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    key = doc.object_key
    await repo.delete_document(doc)
    await s3_client.delete_object(key)
    refreshed = await repo.get_application(vendor_id)
    assert refreshed is not None
    return _read(refreshed)
