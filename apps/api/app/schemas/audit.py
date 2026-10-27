import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class AuditEntryRead(BaseModel):
    id: uuid.UUID
    at: datetime
    action: str = Field(examples=["order.status_changed"])
    label: str = Field(examples=["Changed order status"])
    entity: str = Field(examples=["order"])
    entity_id: str | None
    actor_user_id: uuid.UUID | None
    actor_name: str | None = Field(description="Name, else email; null for system or deleted accounts")
    before: dict[str, Any] | None = Field(default=None, examples=[{"status": "paid"}])
    after: dict[str, Any] | None = Field(default=None, examples=[{"status": "preparing"}])
    ip_address: str | None


class AuditPage(BaseModel):
    items: list[AuditEntryRead]
    total: int
    offset: int
    limit: int
