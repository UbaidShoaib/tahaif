import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.loyalty import AuditLog


class AuditLogRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def add(self, **kwargs: Any) -> AuditLog:
        entry = AuditLog(**kwargs)
        self._db.add(entry)
        await self._db.flush()
        return entry

    async def search(
        self,
        *,
        entity: str | None = None,
        entity_id: str | None = None,
        actor_user_id: uuid.UUID | None = None,
        action_prefix: str | None = None,
        since: datetime | None = None,
        offset: int = 0,
        limit: int = 50,
    ) -> tuple[list[AuditLog], int]:
        """Newest first, with the total for paging."""
        q = select(AuditLog)
        if entity:
            q = q.where(AuditLog.entity == entity)
        if entity_id:
            q = q.where(AuditLog.entity_id == entity_id)
        if actor_user_id:
            q = q.where(AuditLog.actor_user_id == actor_user_id)
        if action_prefix:
            q = q.where(AuditLog.action.startswith(action_prefix))
        if since:
            q = q.where(AuditLog.created_at >= since)
        total = (await self._db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
        q = q.options(selectinload(AuditLog.actor)).order_by(AuditLog.created_at.desc(), AuditLog.id)
        rows = (await self._db.execute(q.offset(offset).limit(limit))).scalars().all()
        return list(rows), int(total)
