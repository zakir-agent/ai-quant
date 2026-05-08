"""Shared daily AI quota accounting across analysis pipelines."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.analysis import AnalysisReport
from app.models.news_analysis import NewsAnalysis


def _today_start() -> datetime:
    return datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)


async def get_today_total_usage(session: AsyncSession) -> int:
    """Return today's total AI analysis count (market + news)."""
    today_start = _today_start()
    market_count = (
        await session.execute(
            select(func.count(AnalysisReport.id)).where(
                AnalysisReport.created_at >= today_start
            )
        )
    ).scalar() or 0
    news_count = (
        await session.execute(
            select(func.count(NewsAnalysis.id)).where(NewsAnalysis.created_at >= today_start)
        )
    ).scalar() or 0
    return int(market_count + news_count)


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
