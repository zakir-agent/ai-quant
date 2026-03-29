"""APScheduler job definitions for data collection."""

import logging

from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.config import get_settings

logger = logging.getLogger(__name__)
scheduler: AsyncIOScheduler | None = None


async def collect_cex():
    """Scheduled job: collect CEX price data."""
    from app.collectors.cex import CEXCollector

    try:
        collector = CEXCollector()
        count = await collector.run()
        logger.info(f"Scheduled CEX collection: {count} records")
    except Exception:
        logger.exception("Scheduled CEX collection failed")


async def collect_coingecko():
    """Scheduled job: collect CoinGecko market overview."""
    from app.collectors.coingecko import CoinGeckoCollector

    try:
        collector = CoinGeckoCollector()
        count = await collector.run()
        logger.info(f"Scheduled CoinGecko collection: {count} records")
    except Exception:
        logger.exception("Scheduled CoinGecko collection failed")


async def collect_dexscreener():
    """Scheduled job: collect DexScreener DEX data."""
    from app.collectors.dexscreener import DexScreenerCollector

    try:
        collector = DexScreenerCollector()
        count = await collector.run()
        logger.info(f"Scheduled DexScreener collection: {count} records")
    except Exception:
        logger.exception("Scheduled DexScreener collection failed")


async def collect_defillama():
    """Scheduled job: collect DefiLlama protocol data."""
    from app.collectors.defillama import DefiLlamaCollector

    try:
        collector = DefiLlamaCollector()
        count = await collector.run()
        logger.info(f"Scheduled DefiLlama collection: {count} records")
    except Exception:
        logger.exception("Scheduled DefiLlama collection failed")


async def run_data_retention():
    """Scheduled job: purge old fine-grained OHLCV data."""
    from app.scheduler.retention import purge_old_ohlcv

    try:
        deleted = await purge_old_ohlcv()
        logger.info(f"Scheduled data retention: purged {deleted} rows")
    except Exception:
        logger.exception("Scheduled data retention failed")


async def run_ai_analysis():
    """Scheduled job: run AI analysis."""
    from app.analysis.engine import run_analysis
    from app.services.collector_health import record_failure, record_success

    try:
        result = await run_analysis()
        logger.info(
            f"Scheduled AI analysis complete: sentiment={result['sentiment_score']}, trend={result['trend']}"
        )
        record_success("ai_analysis")
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
        count = await collector.run()
        logger.info(f"Scheduled news collection: {count} records")
    except Exception:
        logger.exception("Scheduled news collection failed")


async def tag_news_sentiment():
    """Scheduled job: AI sentiment tagging for untagged news."""
    from app.services.collector_health import record_failure, record_success
    from app.services.news_sentiment import tag_pending_news

    try:
        tagged = await tag_pending_news()
        if tagged:
            logger.info(f"Scheduled sentiment tagging: {tagged} articles tagged")
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
