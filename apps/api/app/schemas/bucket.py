import uuid
from typing import Annotated, Literal

from pydantic import BaseModel, Field

# Positions are fractions of the canvas (0 = left/top, 1 = right/bottom), so every
# screen size shows the same arrangement.
Coord = Annotated[float, Field(ge=0, le=1)]


class BuilderComponentRead(BaseModel):
    product_id: uuid.UUID
    name: str
    image: str | None
    role: str
    price_pkr: int
    max_qty: int


class BuilderRead(BaseModel):
    product_id: uuid.UUID
    slug: str
    name: str
    kind: str
    image: str | None
    base_price_pkr: int
    min_items: int
    max_items: int | None
    components: list[BuilderComponentRead]


class BucketPiece(BaseModel):
    key: str
    component_id: uuid.UUID
    qty: int
    x: float
    y: float
    rotation: float = 0
    z: int = 0
    name: str
    image: str | None
    unit_price_pkr: int


class BucketRead(BaseModel):
    id: uuid.UUID
    builder: BuilderRead
    status: str
    version: int
    pieces: list[BucketPiece]
    item_count: int
    components_total_pkr: int
    total_pkr: int
    share_token: str | None = Field(
        default=None,
        description="Only returned when the bucket is created. It is the edit link's secret; "
        "anyone holding it can edit the bucket.",
    )


class BucketCreate(BaseModel):
    builder_slug: str = Field(max_length=255)


# ── Edits (sent over REST or the WebSocket) ───────────────────────────────────

class AddOp(BaseModel):
    op: Literal["add"]
    component_id: uuid.UUID
    qty: int = Field(default=1, ge=1, le=50)
    x: Coord = 0.5
    y: Coord = 0.5


class MoveOp(BaseModel):
    op: Literal["move"]
    key: str = Field(max_length=32)
    x: Coord
    y: Coord
    rotation: float = Field(default=0, ge=-360, le=360)
    z: int = Field(default=0, ge=0, le=1000)


class SetQtyOp(BaseModel):
    op: Literal["set_qty"]
    key: str = Field(max_length=32)
    qty: int = Field(ge=1, le=50)


class RemoveOp(BaseModel):
    op: Literal["remove"]
    key: str = Field(max_length=32)


class ClearOp(BaseModel):
    op: Literal["clear"]


BucketOp = Annotated[AddOp | MoveOp | SetQtyOp | RemoveOp | ClearOp, Field(discriminator="op")]


class BucketOpRequest(BaseModel):
    edit: BucketOp


# ── Admin: setting up builders ────────────────────────────────────────────────

BuilderKindValue = Literal["hamper", "bouquet"]
RoleValue = Literal["item", "stem", "filler", "wrap", "ribbon"]


class BuilderSettingsUpdate(BaseModel):
    builder_kind: BuilderKindValue | None = Field(
        description="null turns the product back into an ordinary one", examples=["bouquet"]
    )
    min_items: int = Field(default=1, ge=1, le=100)
    max_items: int | None = Field(default=None, ge=1, le=200, description="null = no limit")


class BuilderComponentCreate(BaseModel):
    component_product_id: uuid.UUID
    role: RoleValue = "item"
    max_qty: int = Field(default=10, ge=1, le=100)


class BuilderComponentUpdate(BaseModel):
    role: RoleValue | None = None
    max_qty: int | None = Field(default=None, ge=1, le=100)
    sort_order: int | None = Field(default=None, ge=0, le=1000)
    is_active: bool | None = None


class AdminBuilderComponentRead(BaseModel):
    id: uuid.UUID
    component_product_id: uuid.UUID
    name: str
    slug: str
    image: str | None
    price_pkr: int
    product_is_active: bool = Field(
        description="False = hidden from the catalog; buyers can still add it here while the item is switched on"
    )
    role: str
    max_qty: int
    sort_order: int
    is_active: bool


class AdminBuilderConfig(BaseModel):
    product_id: uuid.UUID
    vendor_id: uuid.UUID
    builder_kind: str | None
    min_items: int
    max_items: int | None
    components: list[AdminBuilderComponentRead]


class AdminBuilderSummary(BaseModel):
    product_id: uuid.UUID
    name: str
    slug: str
    vendor_name: str
    builder_kind: str
    is_active: bool
    base_price_pkr: int
    min_items: int
    max_items: int | None
    component_count: int = Field(description="Switched-on items buyers can add")
    bucket_count: int = Field(description="Buckets ever started from this builder")


class BuilderSummary(BaseModel):
    """A builder buyers can start, for listing on the storefront."""

    slug: str
    name: str
    kind: str
    image: str | None
    base_price_pkr: int
