from datetime import UTC, datetime

from app.overview_analytics import build_window, fill_buckets


FIXED_NOW = datetime(2026, 8, 11, 2, 30, tzinfo=UTC)


def test_today_starts_at_customer_midnight_and_includes_current_hour():
    window = build_window("today", "Asia/Shanghai", now=FIXED_NOW)

    assert window.timezone_name == "Asia/Shanghai"
    assert window.start_utc == datetime(2026, 8, 10, 16, 0, tzinfo=UTC)
    assert window.end_utc == FIXED_NOW
    assert window.granularity == "hour"
    assert window.buckets[0] == "2026-08-11T00:00:00"
    assert window.buckets[-1] == "2026-08-11T10:00:00"
    assert len(window.buckets) == 11


def test_three_days_contains_72_hour_buckets():
    window = build_window("3d", "Asia/Shanghai", now=FIXED_NOW)

    assert window.granularity == "hour"
    assert len(window.buckets) == 72
    assert window.buckets[-1] == "2026-08-11T10:00:00"


def test_seven_days_uses_customer_natural_days():
    window = build_window("7d", "Asia/Shanghai", now=FIXED_NOW)

    assert window.start_utc == datetime(2026, 8, 4, 16, 0, tzinfo=UTC)
    assert window.buckets == (
        "2026-08-05",
        "2026-08-06",
        "2026-08-07",
        "2026-08-08",
        "2026-08-09",
        "2026-08-10",
        "2026-08-11",
    )


def test_history_uses_days_then_months_without_sampling_counts():
    daily = build_window(
        "all",
        "Asia/Shanghai",
        now=FIXED_NOW,
        earliest=datetime(2026, 8, 1, tzinfo=UTC),
    )
    monthly = build_window(
        "all",
        "Asia/Shanghai",
        now=FIXED_NOW,
        earliest=datetime(2025, 12, 1, tzinfo=UTC),
    )

    assert daily.granularity == "day"
    assert monthly.granularity == "month"
    assert monthly.buckets[0] == "2025-12"
    assert monthly.buckets[-1] == "2026-08"


def test_invalid_timezone_falls_back_and_missing_buckets_are_zero():
    window = build_window("7d", "not/a-timezone", now=FIXED_NOW)
    points = fill_buckets(window, {"2026-08-10": 4})

    assert window.timezone_name == "Asia/Shanghai"
    assert len(points) == 7
    assert sum(point.count for point in points) == 4
    assert next(point for point in points if point.start == "2026-08-10").count == 4
