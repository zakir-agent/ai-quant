"""Shared daily AI quota accounting across analysis pipelines."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.ai_usage_log import AiUsageLog


def _today_start() -> datetime:
    return datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)


async def get_today_total_usage(session: AsyncSession) -> int:
    """Return today's total AI API call count."""
    today_start = _today_start()
    count = (
        await session.execute(
            select(func.count(AiUsageLog.id)).where(
                AiUsageLog.created_at >= today_start
            )
        )
    ).scalar() or 0
    return int(count)


async def assert_under_daily_limit(session: AsyncSession) -> None:
    """Raise ValueError when combined daily usage reaches configured limit."""
    settings = get_settings()
    used_today = await get_today_total_usage(session)
    if used_today >= settings.ai_max_analyses_per_day:
        raise ValueError(
            f"Daily analysis limit reached ({settings.ai_max_analyses_per_day}). "
            f"Already used {used_today} analyses today (market + news)."
        )


async def get_remaining_quota(session: AsyncSession) -> int:
    """Return how many analyses can still run today."""
    settings = get_settings()
    used_today = await get_today_total_usage(session)
    return max(settings.ai_max_analyses_per_day - used_today, 0)
