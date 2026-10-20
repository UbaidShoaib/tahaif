"""Custom buckets: buyer-built hampers and bouquets, editable live by everyone
holding the share link (ADR 0014).

The server owns the bucket. Each edit is checked against the current state
(component allowed, limits respected), applied, and given the next version
number; prices always come from the database, never from the client.
"""

import hmac
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bucket import BucketStatus, BuilderComponent, CustomBucket
from app.models.catalog import Product
from app.repositories.bucket_repository import BucketRepository, BuilderRepository
from app.schemas.bucket import (
    AddOp,
    BucketOp,
    BucketPiece,
    BucketRead,
    BuilderComponentRead,
    BuilderRead,
    ClearOp,
    MoveOp,
    RemoveOp,
    SetQtyOp,
)
from app.schemas.cart import CartRead
from app.services import cart_service
from app.services.cart_service import CartOwner, hash_token

BUCKET_TTL = timedelta(days=30)

_NOT_FOUND = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bucket not found")
_BUILDER_NOT_FOUND = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Builder not found")


def _conflict(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


def _image(product: Product) -> str | None:
    primary = next((img for img in product.images if img.is_primary), None)
    chosen = primary or (product.images[0] if product.images else None)
    return chosen.url if chosen else None


@dataclass
class _Builder:
    base: Product
    components: dict[uuid.UUID, BuilderComponent]

    def usable(self, component_id: uuid.UUID) -> BuilderComponent | None:
        # The item's own switch decides; its product may be hidden from the catalog
        # (a single stem isn't sold on its own) and still go in buckets.
        c = self.components.get(component_id)
        return c if c and c.is_active else None

    def to_read(self) -> BuilderRead:
        return BuilderRead(
            product_id=self.base.id,
            slug=self.base.slug,
            name=self.base.name,
            kind=self.base.builder_kind or "",
            image=_image(self.base),
            base_price_pkr=self.base.base_price_pkr,
            min_items=self.base.builder_min_items or 1,
            max_items=self.base.builder_max_items,
            components=[
                BuilderComponentRead(
                    product_id=c.component_product_id,
                    name=c.component.name,
                    image=_image(c.component),
                    role=c.role,
                    price_pkr=c.component.base_price_pkr,
                    max_qty=c.max_qty,
                )
                for c in self.components.values()
                if self.usable(c.component_product_id)
            ],
        )


async def _load_builder(db: AsyncSession, base: Product) -> _Builder:
    components = await BuilderRepository(db).list_components(base.id)
    return _Builder(base=base, components={c.component_product_id: c for c in components})


def _bucket_to_read(bucket: CustomBucket, builder: _Builder, share_token: str | None = None) -> BucketRead:
    pieces: list[BucketPiece] = []
    for p in bucket.state:
        c = builder.components.get(uuid.UUID(p["component_id"]))
        if not c:
            continue
        pieces.append(BucketPiece(
            key=p["key"],
            component_id=c.component_product_id,
            qty=p["qty"],
            x=p["x"],
            y=p["y"],
            rotation=p.get("rotation", 0),
            z=p.get("z", 0),
            name=c.component.name,
            image=_image(c.component),
            unit_price_pkr=c.component.base_price_pkr,
        ))
    components_total = sum(p.unit_price_pkr * p.qty for p in pieces)
    return BucketRead(
        id=bucket.id,
        builder=builder.to_read(),
        status=bucket.status,
        version=bucket.version,
        pieces=pieces,
        item_count=sum(p.qty for p in pieces),
        components_total_pkr=components_total,
        total_pkr=builder.base.base_price_pkr + components_total,
        share_token=share_token,
    )


async def get_builder(db: AsyncSession, slug: str) -> BuilderRead:
    base = await BuilderRepository(db).get_base_by_slug(slug)
    if not base or not base.is_active:
        raise _BUILDER_NOT_FOUND
    return (await _load_builder(db, base)).to_read()


async def create_bucket(db: AsyncSession, owner: CartOwner, builder_slug: str) -> BucketRead:
    base = await BuilderRepository(db).get_base_by_slug(builder_slug)
    if not base or not base.is_active:
        raise _BUILDER_NOT_FOUND
    builder = await _load_builder(db, base)
    if not builder.to_read().components:
        raise _conflict("This builder isn't ready yet: it has nothing to put in it")
    token = secrets.token_urlsafe(24)
    bucket = await BucketRepository(db).create(
        builder_product_id=base.id,
        owner_user_id=owner.user_id,
        share_token_hash=hash_token(token),
        state=[],
        version=0,
        status=BucketStatus.DRAFT,
        expires_at=datetime.now(UTC) + BUCKET_TTL,
    )
    return _bucket_to_read(bucket, builder, share_token=token)


async def _authorized(
    db: AsyncSession, bucket_id: uuid.UUID, token: str, *, for_update: bool = False
) -> CustomBucket:
    bucket = await BucketRepository(db).get(bucket_id, for_update=for_update)
    if (
        not bucket
        or not hmac.compare_digest(bucket.share_token_hash, hash_token(token))
        or (bucket.expires_at is not None and bucket.expires_at < datetime.now(UTC))
    ):
        raise _NOT_FOUND
    return bucket


async def get_bucket(db: AsyncSession, bucket_id: uuid.UUID, token: str) -> BucketRead:
    bucket = await _authorized(db, bucket_id, token)
    return _bucket_to_read(bucket, await _load_builder(db, bucket.builder_product))


def _check_limits(builder: _Builder, state: list[dict[str, Any]], component_id: uuid.UUID) -> None:
    c = builder.components[component_id]
    of_this = sum(p["qty"] for p in state if p["component_id"] == str(component_id))
    if of_this > c.max_qty:
        raise _conflict(f"At most {c.max_qty} × {c.component.name}")
    max_items = builder.base.builder_max_items
    if max_items is not None and sum(p["qty"] for p in state) > max_items:
        raise _conflict(f"This {builder.base.builder_kind} holds at most {max_items} items")


def _find(state: list[dict[str, Any]], key: str) -> dict[str, Any]:
    piece = next((p for p in state if p["key"] == key), None)
    if piece is None:
        # Usually someone else removed it a moment earlier.
        raise _conflict("That piece is no longer in the bucket")
    return piece


def _apply(builder: _Builder, state: list[dict[str, Any]], edit: BucketOp) -> list[dict[str, Any]]:
    """The bucket's pieces after ``edit``, or an HTTP 409 if it isn't allowed."""
    state = [dict(p) for p in state]
    if isinstance(edit, AddOp):
        if not builder.usable(edit.component_id):
            raise _conflict("That item can't go in this bucket")
        state.append({
            "key": secrets.token_hex(4),
            "component_id": str(edit.component_id),
            "qty": edit.qty,
            "x": edit.x,
            "y": edit.y,
            "rotation": 0,
            "z": max((p.get("z", 0) for p in state), default=0) + 1,
        })
        _check_limits(builder, state, edit.component_id)
    elif isinstance(edit, MoveOp):
        piece = _find(state, edit.key)
        piece.update(x=edit.x, y=edit.y, rotation=edit.rotation, z=edit.z)
    elif isinstance(edit, SetQtyOp):
        piece = _find(state, edit.key)
        piece["qty"] = edit.qty
        _check_limits(builder, state, uuid.UUID(piece["component_id"]))
    elif isinstance(edit, RemoveOp):
        _find(state, edit.key)
        state = [p for p in state if p["key"] != edit.key]
    elif isinstance(edit, ClearOp):
        state = []
    return state


async def apply_edit(db: AsyncSession, bucket_id: uuid.UUID, token: str, edit: BucketOp) -> BucketRead:
    """Apply one edit and return the bucket as everyone should now see it."""
    bucket = await _authorized(db, bucket_id, token, for_update=True)
    if bucket.status != BucketStatus.DRAFT:
        raise _conflict("This bucket is already in a cart and can't be changed")
    if not bucket.builder_product.builder_kind or not bucket.builder_product.is_active:
        raise _conflict("This builder isn't available any more")
    builder = await _load_builder(db, bucket.builder_product)
    bucket.state = _apply(builder, bucket.state, edit)
    bucket.version += 1
    await db.flush()
    return _bucket_to_read(bucket, builder)


async def add_to_cart(db: AsyncSession, owner: CartOwner, bucket_id: uuid.UUID, token: str) -> CartRead:
    """Put the finished bucket in the caller's cart as one line, and lock it.

    One person pays: a bucket started by a signed-in buyer can only be checked out
    by them; a guest-started bucket by whoever holds the link.
    """
    bucket = await _authorized(db, bucket_id, token, for_update=True)
    if bucket.status != BucketStatus.DRAFT:
        raise _conflict("This bucket is already in a cart")
    if bucket.owner_user_id is not None and bucket.owner_user_id != owner.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the person who started this bucket can check it out",
        )
    builder = await _load_builder(db, bucket.builder_product)
    if not builder.base.is_active or not builder.base.builder_kind:
        raise _BUILDER_NOT_FOUND
    read = _bucket_to_read(bucket, builder)
    if any(not builder.usable(p.component_id) for p in read.pieces):
        raise _conflict("Some items in this bucket are no longer available")
    if read.item_count < builder.to_read().min_items:
        raise _conflict(f"Add at least {builder.to_read().min_items} items first")

    customization: dict[str, object] = {
        "bucket_id": str(bucket.id),
        "bucket_kind": builder.base.builder_kind,
        "components": [
            {"product_id": str(p.component_id), "name": p.name, "qty": p.qty, "unit_price_pkr": p.unit_price_pkr}
            for p in read.pieces
        ],
        "components_total_pkr": read.components_total_pkr,
    }
    cart = await cart_service.add_bucket_line(db, owner, builder.base, customization)
    bucket.status = BucketStatus.IN_CART
    await db.flush()
    return cart
