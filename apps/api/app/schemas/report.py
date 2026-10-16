from pydantic import BaseModel, Field

from app.models.order import OrderSource


class CampaignSalesRow(BaseModel):
    source: OrderSource
    campaign: str | None = Field(description="Reel/post tag; null = not attributed", examples=["eid-reel"])
    orders: int = Field(description="Orders placed, excluding cancelled/refunded")
    paid_orders: int = Field(description="Of those, orders that moved past payment")
    revenue_pkr: int = Field(description="Total of the paid orders, in paisa")
    avg_order_pkr: int = Field(description="revenue_pkr / paid_orders (0 when none)")


class CampaignSalesReport(BaseModel):
    days: int
    rows: list[CampaignSalesRow] = Field(description="Highest revenue first")
    total_orders: int
    total_paid_orders: int
    total_revenue_pkr: int
