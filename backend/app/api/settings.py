"""Settings API — view/update runtime configuration and system status."""

import logging
from datetime import UTC

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models.analysis import AnalysisReport
from app.models.market import DefiMetric, DexVolume, OHLCVData
from app.models.news import NewsArticle
from app.models.news_analysis import NewsAnalysis
from app.models.telegram_message_log import TelegramMessageLog
from app.services.ai_quota import get_today_total_usage
from app.services.alerting import notify
from app.services.collector_health import get_all_health

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("/config")
async def get_config():
    """Get current system configuration (safe — no secrets exposed)."""
    s = get_settings()
    return {
        "ai": {
            "primary_model": s.ai_primary_model,
            "fallback_model": s.ai_fallback_model,
            "max_analyses_per_day": s.ai_max_analyses_per_day,
            "api_base": s.ai_api_base.strip() or None,
            "has_api_key": bool(
                s.ai_api_key
                or s.anthropic_api_key
                or s.openai_api_key
                or s.gemini_api_key
                or s.openrouter_api_key
            ),
        },
        "data_sources": {
            "has_binance_key": bool(s.binance_api_key),
        },
        "schedule": {
            "collect_interval_minutes": s.collect_interval_minutes,
            "news_collect_interval_minutes": s.news_collect_interval_minutes,
            "analysis_interval_hours": s.analysis_interval_hours,
            "news_analysis_interval_minutes": s.news_sentiment_interval_minutes,
        },
        "alert": {
            "enabled": s.alert_enabled,
            "telegram_configured": bool(s.telegram_bot_token and s.telegram_chat_id),
            "telegram_bot_token_set": bool(s.telegram_bot_token),
            "telegram_chat_id_masked": _mask_chat_id(s.telegram_chat_id),
            "webhook_configured": bool(s.alert_webhook_url),
            "price_change_pct": s.alert_price_change_pct,
            "sentiment_delta": s.alert_sentiment_delta,
            "cooldown_minutes": s.alert_cooldown_minutes,
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
    news_analysis_count = (
        await db.execute(select(func.count(NewsAnalysis.id)))
    ).scalar() or 0
    analysis_count = (
        await db.execute(select(func.count(AnalysisReport.id)))
    ).scalar() or 0

    # Last collection times
    last_ohlcv = (await db.execute(select(func.max(OHLCVData.timestamp)))).scalar()
    last_dex = (await db.execute(select(func.max(DexVolume.timestamp)))).scalar()
    last_defi = (await db.execute(select(func.max(DefiMetric.timestamp)))).scalar()
    last_news = (await db.execute(select(func.max(NewsArticle.collected_at)))).scalar()
    last_news_analysis = (
        await db.execute(select(func.max(NewsAnalysis.created_at)))
    ).scalar()
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
    today_news_analyses = (
        await db.execute(
            select(func.count(NewsAnalysis.id)).where(
                NewsAnalysis.created_at >= today_start
            )
        )
    ).scalar() or 0
    today_news_cost_result = await db.execute(
        text(
            "SELECT COALESCE(SUM((token_usage->>'cost_usd')::float), 0) "
            "FROM news_analysis WHERE created_at >= :start"
        ).bindparams(start=today_start)
    )
    today_news_cost = today_news_cost_result.scalar() or 0
    today_total_usage = await get_today_total_usage(db)
    daily_limit = get_settings().ai_max_analyses_per_day

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
            "news_analysis": news_analysis_count,
            "analysis_reports": analysis_count,
        },
        "last_collection": {
            "ohlcv": last_ohlcv.isoformat() if last_ohlcv else None,
            "dex": last_dex.isoformat() if last_dex else None,
            "defi": last_defi.isoformat() if last_defi else None,
            "news": last_news.isoformat() if last_news else None,
            "news_analysis": last_news_analysis.isoformat()
            if last_news_analysis
            else None,
            "analysis": last_analysis.isoformat() if last_analysis else None,
        },
        "ai_usage_today": {
            "quota": {
                "used_count": today_total_usage,
                "daily_limit": daily_limit,
            },
            "market_analysis": {
                "analyses_count": today_analyses,
                "total_cost_usd": round(today_cost, 4),
            },
            "news_analysis": {
                "analyses_count": today_news_analyses,
                "total_cost_usd": round(today_news_cost, 4),
            },
        },
        "database_size": db_size,
        "collector_health": _get_collector_health(),
    }


def _get_collector_health() -> list[dict]:
    """Get health status for all collectors."""
    return get_all_health()


def _mask_chat_id(chat_id: str | None) -> str:
    """Return a masked chat id, keeping only the last 4 digits."""
    if not chat_id:
        return ""
    sign = "-" if chat_id.startswith("-") else ""
    digits = chat_id[1:] if sign else chat_id
    if len(digits) <= 4:
        return f"{sign}***{digits}"
    return f"{sign}***{digits[-4:]}"


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


@router.post("/alert/test")
async def send_alert_test():
    """Send a test alert to configured channels (Telegram/Webhook)."""
    s = get_settings()
    telegram_configured = bool(s.telegram_bot_token and s.telegram_chat_id)
    webhook_configured = bool(s.alert_webhook_url)

    if not s.alert_enabled:
        return {"sent": False, "reason": "disabled"}
    if not telegram_configured and not webhook_configured:
        return {"sent": False, "reason": "not_configured"}

    try:
        sent = await notify(
            "alert_test",
            "Test alert",
            "This is a test notification from AI Quant settings page.",
            ignore_cooldown=True,
        )
    except Exception:
        return {"sent": False, "reason": "failed"}
    return {"sent": sent, "reason": "sent" if sent else "failed"}


@router.get("/telegram-logs")
async def list_telegram_logs(
    limit: int = Query(20, ge=1, le=100, description="Page size"),
    offset: int = Query(0, ge=0, description="Records to skip"),
    status: str | None = Query(
        None, description="Filter by status: 'sent' or 'failed'"
    ),
    event_type: str | None = Query(None, description="Filter by event_type"),
    db: AsyncSession = Depends(get_db),
):
    """Paginated audit log of outbound Telegram messages (newest first)."""
    base = select(TelegramMessageLog)
    if status in ("sent", "failed"):
        base = base.where(TelegramMessageLog.status == status)
    if event_type:
        base = base.where(TelegramMessageLog.event_type == event_type)

    try:
        total_stmt = select(func.count()).select_from(base.subquery())
        total = (await db.execute(total_stmt)).scalar() or 0

        rows = (
            (
                await db.execute(
                    base.order_by(TelegramMessageLog.created_at.desc())
                    .limit(limit)
                    .offset(offset)
                )
            )
            .scalars()
            .all()
        )
    except SQLAlchemyError as exc:
        logger.exception("Failed to query telegram_message_log")
        raise HTTPException(
            status_code=503, detail="telegram_message_log query failed"
        ) from exc

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [
            {
                "id": r.id,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "event_type": r.event_type,
                "title": r.title,
                "message_body": r.message_body,
                "status": r.status,
                "error_text": r.error_text,
                "telegram_message_id": r.telegram_message_id,
                "chat_id_masked": r.chat_id_masked,
            }
            for r in rows
        ],
    }
