from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, Integer, Numeric
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AnalyticsDaily(Base):
    """One closed UTC day of platform sales, written by the nightly
    `analytics.daily_rollup` beat task. Admin analytics read these for past days
    and compute only the open day (today) and any not-yet-rolled-up gap live."""

    __tablename__ = "analytics_daily"

    day: Mapped[date] = mapped_column(Date, primary_key=True)
    orders_count: Mapped[int] = mapped_column(Integer, nullable=False)  # sales, see SALE_STATUSES
    revenue: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    units: Mapped[int] = mapped_column(Integer, nullable=False)
    new_customers: Mapped[int] = mapped_column(Integer, nullable=False)
    refunds: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    # {status: [count, value]} over every order placed that day, sales or not.
    by_status: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
