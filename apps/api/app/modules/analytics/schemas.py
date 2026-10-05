from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


class DayPoint(BaseModel):
    date: date
    revenue: Decimal
    orders: int
    units: int
    new_customers: int
    refunds: Decimal


class Totals(BaseModel):
    revenue: Decimal
    orders: int
    units: int
    aov: Decimal  # average order value
    new_customers: int
    refunds: Decimal


class StatusSlice(BaseModel):
    status: str
    count: int
    value: Decimal


class Ranked(BaseModel):
    name: str
    revenue: Decimal
    units: int = 0
    orders: int = 0
    # Vendors: platform commission earned on those sales.
    commission: Decimal | None = None


class MethodSlice(BaseModel):
    method: str
    orders: int
    value: Decimal


class AnalyticsSource(BaseModel):
    """Where the series came from: nightly rollup rows vs computed on request."""

    rolled_up_days: int
    live_days: int


class AdminAnalytics(BaseModel):
    start: date
    end: date  # inclusive
    previous_start: date
    previous_end: date
    currency: str
    series: list[DayPoint]  # one per day, zero-filled, oldest first
    totals: Totals
    previous: Totals
    by_status: list[StatusSlice]
    top_products: list[Ranked]
    top_vendors: list[Ranked]
    payment_methods: list[MethodSlice]
    source: AnalyticsSource
    generated_at: datetime
