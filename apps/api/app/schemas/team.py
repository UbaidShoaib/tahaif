import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

from app.models.user import UserRole


class TeamMemberRead(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str | None
    role: UserRole = Field(examples=["staff"])
    is_active: bool = Field(description="False once deactivated: they can't sign in or use the back office")
    created_at: datetime


class TeamMemberAdd(BaseModel):
    email: EmailStr = Field(description="An existing, verified account; they sign up on the site first")
    role: Literal["staff", "admin", "super_admin"] = "staff"


class TeamMemberUpdate(BaseModel):
    role: Literal["customer", "staff", "admin", "super_admin"] | None = Field(
        default=None, description="`customer` takes them off the team. Only a super admin sets or changes admins."
    )
    is_active: bool | None = None
