"""Admin reports: which Instagram reels/campaigns and channels actually sell (ADR 0009)."""

from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import OrderSource
from app.repositories.order_repository import OrderRepository
from app.schemas.report import CampaignSalesReport, CampaignSalesRow


async def campaign_sales(db: AsyncSession, days: int, now: datetime | None = None) -> CampaignSalesReport:
    since = (now or datetime.now(UTC)) - timedelta(days=days)
    rows = [
        CampaignSalesRow(
            source=OrderSource(source),
            campaign=campaign,
            orders=orders,
            paid_orders=paid,
            revenue_pkr=revenue,
            avg_order_pkr=revenue // paid if paid else 0,
        )
        for source, campaign, orders, paid, revenue in await OrderRepository(db).campaign_sales(since)
    ]
    rows.sort(key=lambda r: (-r.revenue_pkr, -r.orders, r.source, r.campaign or ""))
    return CampaignSalesReport(
        days=days,
        rows=rows,
        total_orders=sum(r.orders for r in rows),
        total_paid_orders=sum(r.paid_orders for r in rows),
        total_revenue_pkr=sum(r.revenue_pkr for r in rows),
    )
