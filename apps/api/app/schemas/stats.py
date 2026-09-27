from pydantic import BaseModel, Field


class OnTimeStats(BaseModel):
    on_time_percent: int | None = Field(
        description="Whole-number % delivered on or before the chosen day; null until there are enough deliveries",
        examples=[97],
    )
    delivered_count: int = Field(description="Deliveries in the window", examples=[312])
    window_days: int = Field(examples=[90])
    min_sample: int = Field(description="Deliveries needed before a rate is published", examples=[20])
