"""Shared helper for per-day count stats endpoints."""

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def daily_count_stats(
    db: AsyncSession,
    table: str,
    ts_column: str,
    days: int,
    tz: str,
    extra_where: str = "",
) -> dict:
    """Return zero-filled per-day counts for the last *days* days in timezone *tz*."""
    cutoff = datetime.now(UTC) - timedelta(days=days)
    where = f"WHERE {ts_column} IS NOT NULL AND {ts_column} >= :cutoff"
    if extra_where:
        where += f" AND {extra_where}"

    result = await db.execute(
        text(
            f"SELECT date_trunc(:unit, {ts_column} AT TIME ZONE :tz)::date AS day, "
            f"count(id) AS count "
            f"FROM {table} "
            f"{where} "
            f"GROUP BY date_trunc(:unit, {ts_column} AT TIME ZONE :tz)::date"
        ),
        {"unit": "day", "tz": tz, "cutoff": cutoff},
    )
    rows = result.all()
    count_map = {str(r.day): r.count for r in rows}

    now_local = datetime.now(UTC).astimezone(ZoneInfo(tz))
    today_local = now_local.date()
    stats = []
    for i in range(days - 1, -1, -1):
        d = today_local - timedelta(days=i)
        stats.append({"date": d.isoformat(), "count": count_map.get(d.isoformat(), 0)})

    return {"days": days, "stats": stats}
