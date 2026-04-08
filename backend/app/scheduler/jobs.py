"""APScheduler job definitions for data collection."""

import asyncio
import logging
import time

from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.config import get_settings

logger = logging.getLogger(__name__)
scheduler: AsyncIOScheduler | None = None


async def _run_with_timeout(job_name: str, coro):
    from app.services.collector_health import record_failure

    timeout_seconds = get_settings().scheduler_job_timeout_seconds
    started_at = time.perf_counter()
    try:
        result = await asyncio.wait_for(coro, timeout=timeout_seconds)
        elapsed_ms = (time.perf_counter() - started_at) * 1000
        logger.info(
            "Scheduled job succeeded job=%s timeout_s=%s elapsed_ms=%.2f",
            job_name,
            timeout_seconds,
            elapsed_ms,
        )
        return result
    except TimeoutError:
        elapsed_ms = (time.perf_counter() - started_at) * 1000
        logger.error(
            "Scheduled job timeout job=%s timeout_s=%s elapsed_ms=%.2f",
            job_name,
            timeout_seconds,
            elapsed_ms,
        )
        record_failure(job_name, "timeout")
        return None


async def collect_cex():
    """Scheduled job: collect CEX price data."""
    from app.collectors.cex import CEXCollector

    try:
        collector = CEXCollector()
        count = await _run_with_timeout("collect_cex", collector.run())
        if count is not None:
            logger.info("Scheduled CEX collection: %s records", count)
    except Exception:
        logger.exception("Scheduled CEX collection failed")


async def collect_coingecko():
    """Scheduled job: collect CoinGecko market overview."""
    from app.collectors.coingecko import CoinGeckoCollector

    try:
        collector = CoinGeckoCollector()
        count = await _run_with_timeout("collect_coingecko", collector.run())
        if count is not None:
            logger.info("Scheduled CoinGecko collection: %s records", count)
            await _check_price_alerts()
    except Exception:
        logger.exception("Scheduled CoinGecko collection failed")


async def _check_price_alerts():
    """Check for significant price changes and send alerts."""
    import json

    from app.config import get_settings
    from app.services.alerting import notify
    from app.services.cache import cache_get

    settings = get_settings()
    threshold = settings.alert_price_change_pct

    data = await cache_get("market:overview")
    if not data:
        return

    coins = json.loads(data)
    for coin in coins:
        symbol = coin.get("symbol", "").upper()
        change_24h = coin.get("price_change_24h") or 0
        price = coin.get("current_price", 0)

        if abs(change_24h) >= threshold:
            direction = "up" if change_24h > 0 else "down"
            await notify(
                f"price_{symbol}_{direction}",
                f"{symbol} price {'surge' if change_24h > 0 else 'drop'}: {change_24h:+.1f}%",
                f"Price: ${price:,.2f}\n24h change: {change_24h:+.1f}%",
            )


async def collect_dexscreener():
    """Scheduled job: collect DexScreener DEX data."""
    from app.collectors.dexscreener import DexScreenerCollector

    try:
        collector = DexScreenerCollector()
        count = await _run_with_timeout("collect_dexscreener", collector.run())
        if count is not None:
            logger.info("Scheduled DexScreener collection: %s records", count)
    except Exception:
        logger.exception("Scheduled DexScreener collection failed")


async def collect_defillama():
    """Scheduled job: collect DefiLlama protocol data."""
    from app.collectors.defillama import DefiLlamaCollector

    try:
        collector = DefiLlamaCollector()
        count = await _run_with_timeout("collect_defillama", collector.run())
        if count is not None:
            logger.info("Scheduled DefiLlama collection: %s records", count)
    except Exception:
        logger.exception("Scheduled DefiLlama collection failed")


async def collect_futures():
    """Scheduled job: collect Binance Futures data (funding rate, OI, long/short)."""
    from app.collectors.futures import FuturesCollector

    try:
        collector = FuturesCollector()
        count = await _run_with_timeout("collect_futures", collector.run())
        if count is not None:
            logger.info("Scheduled Futures collection: %s records", count)
    except Exception:
        logger.exception("Scheduled Futures collection failed")


async def collect_fear_greed():
    """Scheduled job: collect Fear & Greed Index."""
    from app.collectors.fear_greed import FearGreedCollector

    try:
        collector = FearGreedCollector()
        count = await _run_with_timeout("collect_fear_greed", collector.run())
        if count is not None:
            logger.info("Scheduled Fear & Greed collection: %s records", count)
    except Exception:
        logger.exception("Scheduled Fear & Greed collection failed")


async def run_data_retention():
    """Scheduled job: purge old fine-grained OHLCV data."""
    from app.scheduler.retention import purge_old_ohlcv

    try:
        deleted = await _run_with_timeout("data_retention", purge_old_ohlcv())
        if deleted is not None:
            logger.info("Scheduled data retention: purged %s rows", deleted)
    except Exception:
        logger.exception("Scheduled data retention failed")


async def run_ai_analysis():
    """Scheduled job: run AI analysis."""
    from app.analysis.engine import run_analysis
    from app.services.collector_health import record_failure, record_success

    try:
        result = await _run_with_timeout("ai_analysis", run_analysis())
        if result is None:
            return
        logger.info(
            f"Scheduled AI analysis complete: sentiment={result['sentiment_score']}, trend={result['trend']}"
        )
        record_success("ai_analysis")

        # Alert on high risk or extreme sentiment
        from app.config import get_settings
        from app.services.alerting import notify

        risk = result.get("risk_level", "")
        score = result.get("sentiment_score", 0)
        trend = result.get("trend", "neutral")
        if risk == "high" or abs(score) >= get_settings().alert_sentiment_delta:
            await notify(
                "analysis_alert",
                f"AI Analysis: {trend.upper()} (score: {score})",
                f"Risk: {risk}\nSummary: {result.get('summary', '')[:200]}",
            )
    except ValueError as e:
        logger.warning(f"Scheduled AI analysis skipped: {e}")
    except Exception as e:
        logger.exception("Scheduled AI analysis failed")
        record_failure("ai_analysis", str(e))


async def collect_news():
    """Scheduled job: collect crypto news."""
    from app.collectors.news import NewsCollector

    try:
        collector = NewsCollector()
        count = await _run_with_timeout("collect_news", collector.run())
        if count is not None:
            logger.info("Scheduled news collection: %s records", count)
    except Exception:
        logger.exception("Scheduled news collection failed")


async def score_accuracy():
    """Scheduled job: evaluate matured AI recommendations and update accuracy scores."""
    from app.services.accuracy_tracker import score_matured_recommendations

    try:
        scored = await _run_with_timeout(
            "score_accuracy", score_matured_recommendations()
        )
        if scored is None:
            return
        if scored:
            logger.info("Scored accuracy for %s matured reports", scored)
    except Exception:
        logger.exception("Scheduled accuracy scoring failed")


async def tag_news_sentiment():
    """Scheduled job: AI sentiment tagging for untagged news."""
    from app.services.collector_health import record_failure, record_success
    from app.services.news_sentiment import tag_pending_news

    try:
        tagged = await _run_with_timeout("news_sentiment", tag_pending_news())
        if tagged is None:
            return
        if tagged:
            logger.info("Scheduled sentiment tagging: %s articles tagged", tagged)
        record_success("news_sentiment")
    except Exception as e:
        logger.exception("Scheduled sentiment tagging failed")
        record_failure("news_sentiment", str(e))


def start_scheduler():
    """Initialize and start the scheduler."""
    global scheduler
    settings = get_settings()

    # Use sync DB URL for APScheduler job store
    sync_db_url = settings.database_url.replace("+asyncpg", "").replace(
        "asyncpg://", "postgresql://"
    )
    # Remote databases (e.g. Supabase) require SSL
    if "localhost" not in sync_db_url and "127.0.0.1" not in sync_db_url:
        sep = "&" if "?" in sync_db_url else "?"
        sync_db_url += f"{sep}sslmode=require"

    scheduler = AsyncIOScheduler(
        jobstores={"default": SQLAlchemyJobStore(url=sync_db_url)},
        job_defaults={"coalesce": True, "max_instances": 1, "misfire_grace_time": 300},
    )

    scheduler.add_job(
        collect_cex,
        trigger=IntervalTrigger(minutes=settings.collect_interval_minutes),
        id="collect_cex",
        name="Collect CEX price data",
        replace_existing=True,
    )

    scheduler.add_job(
        collect_coingecko,
        trigger=IntervalTrigger(minutes=settings.collect_interval_minutes),
        id="collect_coingecko",
        name="Collect CoinGecko overview",
        replace_existing=True,
    )

    scheduler.add_job(
        collect_dexscreener,
        trigger=IntervalTrigger(minutes=settings.collect_interval_minutes),
        id="collect_dexscreener",
        name="Collect DexScreener DEX data",
        replace_existing=True,
    )

    scheduler.add_job(
        collect_defillama,
        trigger=IntervalTrigger(minutes=settings.collect_interval_minutes),
        id="collect_defillama",
        name="Collect DefiLlama protocol data",
        replace_existing=True,
    )

    scheduler.add_job(
        collect_futures,
        trigger=IntervalTrigger(minutes=settings.collect_interval_minutes),
        id="collect_futures",
        name="Collect Binance Futures data",
        replace_existing=True,
    )

    scheduler.add_job(
        collect_fear_greed,
        trigger=IntervalTrigger(hours=1),
        id="collect_fear_greed",
        name="Collect Fear & Greed Index",
        replace_existing=True,
    )

    scheduler.add_job(
        collect_news,
        trigger=IntervalTrigger(minutes=settings.news_collect_interval_minutes),
        id="collect_news",
        name="Collect crypto news",
        replace_existing=True,
    )

    scheduler.add_job(
        run_ai_analysis,
        trigger=IntervalTrigger(hours=settings.analysis_interval_hours),
        id="ai_analysis",
        name="Run AI analysis",
        replace_existing=True,
    )

    scheduler.add_job(
        score_accuracy,
        trigger=IntervalTrigger(hours=6),
        id="score_accuracy",
        name="Score AI recommendation accuracy",
        replace_existing=True,
    )

    scheduler.add_job(
        tag_news_sentiment,
        trigger=IntervalTrigger(minutes=settings.news_sentiment_interval_minutes),
        id="news_sentiment",
        name="AI news sentiment tagging",
        replace_existing=True,
    )

    scheduler.add_job(
        run_data_retention,
        trigger=IntervalTrigger(hours=24),
        id="data_retention",
        name="Purge old OHLCV data",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("Scheduler started with %d jobs", len(scheduler.get_jobs()))


def stop_scheduler():
    """Shutdown the scheduler."""
    global scheduler
    if scheduler:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")
