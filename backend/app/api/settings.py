"""Settings API — view/update runtime configuration and system status."""

import os
from datetime import UTC

from fastapi import APIRouter, Depends
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models.analysis import AnalysisReport
from app.models.market import DefiMetric, DexVolume, OHLCVData
from app.models.news import NewsArticle

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("/config")
async def get_config():
    """Get current system configuration (safe — no secrets exposed)."""
    s = get_settings()
    return {
        "ai": {
            "primary_model": s.ai_primary_model,
            "fallback_model": s.ai_fallback_model,
            "fast_model": s.ai_fast_model,
            "max_analyses_per_day": s.ai_max_analyses_per_day,
            "has_api_key": bool(
                os.environ.get("ANTHROPIC_API_KEY")
                or os.environ.get("OPENAI_API_KEY")
                or os.environ.get("GEMINI_API_KEY")
                or os.environ.get("OPENROUTER_API_KEY")
            ),
        },
        "data_sources": {
            "has_binance_key": bool(s.binance_api_key),
            "has_cryptopanic_key": bool(s.cryptopanic_api_key),
        },
        "schedule": {
            "collect_interval_minutes": s.collect_interval_minutes,
            "news_collect_interval_minutes": s.news_collect_interval_minutes,
            "analysis_interval_hours": s.analysis_interval_hours,
        },
    }


@router.get("/status")
async def get_system_status(db: AsyncSession = Depends(get_db)):
    """Get system status — data counts, last collection times, AI usage."""
    # Data counts
    ohlcv_count = (await db.execute(select(func.count(OHLCVData.id)))).scalar() or 0
    dex_count = (await db.execute(select(func.count(DexVolume.id)))).scalar() or 0
    defi_count = (await db.execute(select(func.count(DefiMetric.id)))).scalar() or 0
    news_count = (await db.execute(select(func.count(NewsArticle.id)))).scalar() or 0
    analysis_count = (
        await db.execute(select(func.count(AnalysisReport.id)))
    ).scalar() or 0

    # Last collection times
    last_ohlcv = (await db.execute(select(func.max(OHLCVData.timestamp)))).scalar()
    last_dex = (await db.execute(select(func.max(DexVolume.timestamp)))).scalar()
    last_defi = (await db.execute(select(func.max(DefiMetric.timestamp)))).scalar()
    last_news = (await db.execute(select(func.max(NewsArticle.collected_at)))).scalar()
    last_analysis = (
        await db.execute(select(func.max(AnalysisReport.created_at)))
    ).scalar()

    # AI usage today
    from datetime import datetime

    today_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    today_analyses = (
        await db.execute(
            select(func.count(AnalysisReport.id)).where(
                AnalysisReport.created_at >= today_start
            )
        )
    ).scalar() or 0

    today_cost_result = await db.execute(
        text(
            "SELECT COALESCE(SUM((token_usage->>'cost_usd')::float), 0) "
            "FROM analysis_report WHERE created_at >= :start"
        ).bindparams(start=today_start)
    )
    today_cost = today_cost_result.scalar() or 0

    # DB size
    db_size_result = await db.execute(
        text("SELECT pg_size_pretty(pg_database_size(current_database()))")
    )
    db_size = db_size_result.scalar()

    return {
        "data_counts": {
            "ohlcv": ohlcv_count,
            "dex_pairs": dex_count,
            "defi_protocols": defi_count,
            "news_articles": news_count,
            "analysis_reports": analysis_count,
        },
        "last_collection": {
            "ohlcv": last_ohlcv.isoformat() if last_ohlcv else None,
            "dex": last_dex.isoformat() if last_dex else None,
            "defi": last_defi.isoformat() if last_defi else None,
            "news": last_news.isoformat() if last_news else None,
            "analysis": last_analysis.isoformat() if last_analysis else None,
        },
        "ai_usage_today": {
            "analyses_count": today_analyses,
            "total_cost_usd": round(today_cost, 4),
            "daily_limit": get_settings().ai_max_analyses_per_day,
        },
        "database_size": db_size,
        "collector_health": _get_collector_health(),
    }


def _get_collector_health() -> list[dict]:
    """Get health status for all collectors."""
    from app.services.collector_health import get_all_health

    return get_all_health()


@router.get("/scheduler")
async def get_scheduler_status():
    """Get scheduler job status."""
    from app.scheduler.jobs import scheduler

    if not scheduler:
        return {"running": False, "jobs": []}

    jobs = []
    for job in scheduler.get_jobs():
        jobs.append(
            {
                "id": job.id,
                "name": job.name,
                "next_run": job.next_run_time.isoformat()
                if job.next_run_time
                else None,
            }
        )
    return {"running": scheduler.running, "jobs": jobs}
