"""Time windows and database bucket expressions for overview analytics."""

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta, timezone, tzinfo
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

OverviewRange = Literal["today", "3d", "7d", "all"]
Granularity = Literal["hour", "day", "month"]
DEFAULT_TIMEZONE = "Asia/Shanghai"


@dataclass(frozen=True)
class TrendPoint:
    start: str
    count: int


@dataclass(frozen=True)
class TrendWindow:
    range_name: OverviewRange
    timezone_name: str
    granularity: Granularity
    start_utc: datetime
    end_utc: datetime
    buckets: tuple[str, ...]


def _timezone(name: str) -> tuple[str, tzinfo]:
    try:
        return name, ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        return DEFAULT_TIMEZONE, timezone(timedelta(hours=8), DEFAULT_TIMEZONE)


def _aware_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def _key(value: datetime, granularity: Granularity) -> str:
    if granularity == "hour":
        return value.strftime("%Y-%m-%dT%H:00:00")
    if granularity == "day":
        return value.strftime("%Y-%m-%d")
    return value.strftime("%Y-%m")


def _next(value: datetime, granularity: Granularity) -> datetime:
    if granularity == "hour":
        return value + timedelta(hours=1)
    if granularity == "day":
        return value + timedelta(days=1)
    year, month = value.year, value.month + 1
    if month == 13:
        year, month = year + 1, 1
    return value.replace(year=year, month=month, day=1)


def build_window(
    range_name: OverviewRange,
    timezone_name: str,
    *,
    now: datetime | None = None,
    earliest: datetime | None = None,
) -> TrendWindow:
    resolved_name, customer_timezone = _timezone(timezone_name)
    end_utc = _aware_utc(now or datetime.now(UTC))
    local_now = end_utc.astimezone(customer_timezone)

    if range_name == "today":
        granularity: Granularity = "hour"
        first = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif range_name == "3d":
        granularity = "hour"
        current = local_now.replace(minute=0, second=0, microsecond=0)
        first = current - timedelta(hours=71)
    elif range_name == "7d":
        granularity = "day"
        first = local_now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=6)
    else:
        first_record = _aware_utc(earliest or end_utc).astimezone(customer_timezone)
        age = local_now.date() - first_record.date()
        granularity = "day" if age.days < 90 else "month"
        first = first_record.replace(hour=0, minute=0, second=0, microsecond=0)
        if granularity == "month":
            first = first.replace(day=1)

    last = local_now.replace(minute=0, second=0, microsecond=0)
    if granularity == "day":
        last = last.replace(hour=0)
    elif granularity == "month":
        last = last.replace(day=1, hour=0)

    buckets: list[str] = []
    cursor = first
    while cursor <= last:
        buckets.append(_key(cursor, granularity))
        cursor = _next(cursor, granularity)

    return TrendWindow(
        range_name=range_name,
        timezone_name=resolved_name,
        granularity=granularity,
        start_utc=first.astimezone(UTC),
        end_utc=end_utc,
        buckets=tuple(buckets),
    )


def bucket_expression(column, window: TrendWindow, dialect_name: str):
    if dialect_name == "postgresql":
        local_value = func.timezone(window.timezone_name, column)
        pattern = {
            "hour": 'YYYY-MM-DD"T"HH24:00:00',
            "day": "YYYY-MM-DD",
            "month": "YYYY-MM",
        }[window.granularity]
        return func.to_char(func.date_trunc(window.granularity, local_value), pattern)

    customer_timezone = _timezone(window.timezone_name)[1]
    offset = window.start_utc.astimezone(customer_timezone).utcoffset() or timedelta()
    modifier = f"{int(offset.total_seconds() / 60):+d} minutes"
    pattern = {
        "hour": "%Y-%m-%dT%H:00:00",
        "day": "%Y-%m-%d",
        "month": "%Y-%m",
    }[window.granularity]
    return func.strftime(pattern, column, modifier)


def fill_buckets(window: TrendWindow, counts: Mapping[object, int]) -> list[TrendPoint]:
    normalized = {str(key): int(value) for key, value in counts.items()}
    return [TrendPoint(start=key, count=normalized.get(key, 0)) for key in window.buckets]


async def aggregate_trend(
    session: AsyncSession,
    model,
    org_id,
    range_name: OverviewRange,
    timezone_name: str,
) -> tuple[TrendWindow, list[TrendPoint]]:
    earliest = None
    if range_name == "all":
        earliest = await session.scalar(
            select(func.min(model.created_at)).where(model.org_id == org_id)
        )
    window = build_window(
        range_name,
        timezone_name,
        earliest=earliest,
    )
    bucket = bucket_expression(
        model.created_at,
        window,
        session.get_bind().dialect.name,
    ).label("bucket")
    rows = (
        await session.execute(
            select(bucket, func.count())
            .where(
                model.org_id == org_id,
                model.created_at >= window.start_utc,
                model.created_at < window.end_utc,
            )
            .group_by(bucket)
            .order_by(bucket)
        )
    ).all()
    return window, fill_buckets(window, {key: count for key, count in rows if key})
