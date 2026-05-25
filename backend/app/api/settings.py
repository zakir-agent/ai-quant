"""Settings API — view/update runtime configuration and system status."""

import logging
from datetime import UTC

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import distinct, func, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models.telegram_message_log import TelegramMessageLog
from app.services.ai_quota import get_today_total_usage
from app.services.alerting import _mask_chat_id, notify
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
    from datetime import datetime

    today_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)

    # Single combined query for all counts and max timestamps
    counts_stmt = text("""
        SELECT
            (SELECT count(*) FROM ohlcv_data) AS ohlcv_count,
            (SELECT count(*) FROM dex_volume) AS dex_count,
            (SELECT count(*) FROM defi_metric) AS defi_count,
            (SELECT count(*) FROM news_article) AS news_count,
            (SELECT count(*) FROM news_analysis) AS news_analysis_count,
            (SELECT count(*) FROM analysis_report) AS analysis_count,
            (SELECT max(timestamp) FROM ohlcv_data) AS last_ohlcv,
            (SELECT max(timestamp) FROM dex_volume) AS last_dex,
            (SELECT max(timestamp) FROM defi_metric) AS last_defi,
            (SELECT max(collected_at) FROM news_article) AS last_news,
            (SELECT max(created_at) FROM news_analysis) AS last_news_analysis,
            (SELECT max(created_at) FROM analysis_report) AS last_analysis,
            (SELECT count(*) FROM analysis_report WHERE created_at >= :today) AS today_analyses,
            (SELECT COALESCE(SUM((token_usage->>'cost_usd')::float), 0) FROM analysis_report WHERE created_at >= :today) AS today_cost,
            (SELECT count(*) FROM news_analysis WHERE created_at >= :today) AS today_news_analyses,
            (SELECT COALESCE(SUM((token_usage->>'cost_usd')::float), 0) FROM news_analysis WHERE created_at >= :today) AS today_news_cost,
            (SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size)
    """)
    row = (await db.execute(counts_stmt.bindparams(today=today_start))).one()

    today_total_usage = await get_today_total_usage(db)
    daily_limit = get_settings().ai_max_analyses_per_day

    return {
        "data_counts": {
            "ohlcv": row.ohlcv_count or 0,
            "dex_pairs": row.dex_count or 0,
            "defi_protocols": row.defi_count or 0,
            "news_articles": row.news_count or 0,
            "news_analysis": row.news_analysis_count or 0,
            "analysis_reports": row.analysis_count or 0,
        },
        "last_collection": {
            "ohlcv": row.last_ohlcv.isoformat() if row.last_ohlcv else None,
            "dex": row.last_dex.isoformat() if row.last_dex else None,
            "defi": row.last_defi.isoformat() if row.last_defi else None,
            "news": row.last_news.isoformat() if row.last_news else None,
            "news_analysis": row.last_news_analysis.isoformat()
            if row.last_news_analysis
            else None,
            "analysis": row.last_analysis.isoformat() if row.last_analysis else None,
        },
        "ai_usage_today": {
            "quota": {
                "used_count": today_total_usage,
                "daily_limit": daily_limit,
            },
            "market_analysis": {
                "analyses_count": row.today_analyses or 0,
                "total_cost_usd": round(float(row.today_cost or 0), 4),
            },
            "news_analysis": {
                "analyses_count": row.today_news_analyses or 0,
                "total_cost_usd": round(float(row.today_news_cost or 0), 4),
            },
        },
        "database_size": row.db_size,
        "collector_health": _get_collector_health(),
    }


def _get_collector_health() -> list[dict]:
    """Get health status for all collectors."""
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


@router.get("/telegram-logs/event-types")
async def list_event_types(db: AsyncSession = Depends(get_db)):
    """Return all distinct event_type values from telegram_message_log."""
    try:
        rows = (
            (
                await db.execute(
                    select(distinct(TelegramMessageLog.event_type))
                    .where(TelegramMessageLog.event_type.isnot(None))
                    .order_by(TelegramMessageLog.event_type)
                )
            )
            .scalars()
            .all()
        )
    except SQLAlchemyError as exc:
        logger.exception("Failed to query distinct event_types")
        raise HTTPException(status_code=503, detail="event_type query failed") from exc
    return {"event_types": rows}
