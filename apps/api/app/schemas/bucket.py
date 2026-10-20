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
