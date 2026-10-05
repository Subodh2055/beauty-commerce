"""Admin sales analytics over a date range.

Past days come from `analytics_daily` (written nightly by the beat rollup);
days the rollup hasn't covered yet — always today, plus any gap after an outage
— are computed live. The assembled response is cached in Redis per range:
briefly when the range includes today (still moving), for an hour otherwise.
"""

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from pydantic import TypeAdapter
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import cache
from app.core.exceptions import ValidationFailedError
from app.modules.analytics import repository as repo
from app.modules.analytics.repository import DayStats
from app.modules.analytics.schemas import (
    AdminAnalytics,
    AnalyticsSource,
    DayPoint,
    MethodSlice,
    Ranked,
    StatusSlice,
    Totals,
)
from app.modules.settings import service as settings_service

CACHE_NS = "analytics"
MAX_RANGE_DAYS = 366
OPEN_RANGE_TTL = 60
CLOSED_RANGE_TTL = 3600
BACKFILL_DAYS = 7
_ADAPTER = TypeAdapter(AdminAnalytics)
Q = Decimal("0.01")


def today_utc() -> date:
    return datetime.now(UTC).date()


def _totals(points: list[DayPoint]) -> Totals:
    revenue = sum((p.revenue for p in points), Decimal("0"))
    orders = sum(p.orders for p in points)
    return Totals(
        revenue=revenue,
        orders=orders,
        units=sum(p.units for p in points),
        aov=(revenue / orders).quantize(Q) if orders else Decimal("0"),
        new_customers=sum(p.new_customers for p in points),
        refunds=sum((p.refunds for p in points), Decimal("0")),
    )


async def _series(db: AsyncSession, start: date, end: date) -> tuple[list[DayPoint], int, int]:
    """Zero-filled daily points for [start, end] plus (rolled_up, live) day counts."""
    today = today_utc()
    stored = await repo.rolled_up(db, start, end)
    # Today is never final, so it is always live even if a row exists.
    stored.pop(today, None)
    need_live = [
        d
        for d in (start + timedelta(days=i) for i in range((end - start).days + 1))
        if d not in stored
    ]
    live: dict[date, DayStats] = {}
    if need_live:
        live = await repo.live_days(db, min(need_live), max(need_live))

    points: list[DayPoint] = []
    for i in range((end - start).days + 1):
        d = start + timedelta(days=i)
        if d in stored:
            r = stored[d]
            points.append(
                DayPoint(
                    date=d,
                    revenue=r.revenue,
                    orders=r.orders_count,
                    units=r.units,
                    new_customers=r.new_customers,
                    refunds=r.refunds,
                )
            )
        else:
            s = live.get(d, DayStats())
            points.append(
                DayPoint(
                    date=d,
                    revenue=s.revenue,
                    orders=s.orders,
                    units=s.units,
                    new_customers=s.new_customers,
                    refunds=s.refunds,
                )
            )
    return points, len(stored), len(need_live)


async def admin_analytics(db: AsyncSession, start: date, end: date) -> AdminAnalytics:
    today = today_utc()
    if end < start:
        raise ValidationFailedError("The end date is before the start date")
    if end > today:
        raise ValidationFailedError("The range can't end in the future")
    span = (end - start).days + 1
    if span > MAX_RANGE_DAYS:
        raise ValidationFailedError(f"Pick at most {MAX_RANGE_DAYS} days")
    prev_end = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=span - 1)

    async def load() -> AdminAnalytics:
        series, rolled, live = await _series(db, start, end)
        previous, _, _ = await _series(db, prev_start, prev_end)
        currency = (await settings_service.get_settings(db)).base_currency
        return AdminAnalytics(
            start=start,
            end=end,
            previous_start=prev_start,
            previous_end=prev_end,
            currency=currency,
            series=series,
            totals=_totals(series),
            previous=_totals(previous),
            by_status=[
                StatusSlice(status=s, count=n, value=v)
                for s, n, v in await repo.by_status(db, start, end)
            ],
            top_products=[
                Ranked(name=name, units=u, orders=n, revenue=v)
                for name, u, n, v in await repo.top_products(db, start, end)
            ],
            top_vendors=[
                Ranked(name=name, orders=n, revenue=rev, commission=com)
                for name, n, rev, com in await repo.top_vendors(db, start, end)
            ],
            payment_methods=[
                MethodSlice(method=m, orders=n, value=v)
                for m, n, v in await repo.payment_methods(db, start, end)
            ],
            source=AnalyticsSource(rolled_up_days=rolled, live_days=live),
            generated_at=datetime.now(UTC),
        )

    ttl = OPEN_RANGE_TTL if end >= today else CLOSED_RANGE_TTL
    return await cache.get_or_load(
        CACHE_NS, cache.make_key("range", start, end), _ADAPTER, load, ttl=ttl
    )


async def rollup(db: AsyncSession, day: date | None = None) -> list[date]:
    """Persist closed days: `day` (default yesterday) plus any day in the last
    week the rollup missed (worker down, first deploy). Returns the days written."""
    yesterday = today_utc() - timedelta(days=1)
    target = day or yesterday
    window_start = yesterday - timedelta(days=BACKFILL_DAYS - 1)
    days = set(await repo.missing_days(db, window_start, yesterday))
    days.add(target)
    stats = await repo.live_days(db, min(days), max(days))
    for d in sorted(days):
        await repo.upsert_day(db, d, stats.get(d, DayStats()))
    await db.commit()
    # Ranges ending on these days were cached from live numbers; drop them.
    await cache.invalidate(CACHE_NS)
    return sorted(days)
