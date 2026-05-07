"""APScheduler job definitions for data collection."""

import asyncio
import json
import logging
import time

from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.analysis.engine import run_analysis
from app.collectors.cex import CEXCollector
from app.collectors.coingecko import CoinGeckoCollector
from app.collectors.defillama import DefiLlamaCollector
from app.collectors.dexscreener import DexScreenerCollector
from app.collectors.fear_greed import FearGreedCollector
from app.collectors.futures import FuturesCollector
from app.collectors.news import NewsCollector
from app.collectors.newsapi import NewsAPICollector
from app.config import get_settings
from app.scheduler.retention import purge_old_ohlcv
from app.services.accuracy_tracker import (
    score_matured_news,
    score_matured_recommendations,
)
from app.services.alerting import notify
from app.services.cache import cache_get
from app.services.collector_health import record_failure, record_success
from app.services.kline_aggregator import aggregate_recent
from app.services.news_analyzer import (
    analyze_pending_news,
    delete_retryable_failures,
)
from app.services.news_sentiment import tag_pending_news

logger = logging.getLogger(__name__)
scheduler: AsyncIOScheduler | None = None


async def _run_with_timeout(job_name: str, coro):
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
    try:
        collector = CEXCollector()
        count = await _run_with_timeout("collect_cex", collector.run())
        if count is not None:
            logger.info("Scheduled CEX collection: %s records", count)
    except Exception:
        logger.exception("Scheduled CEX collection failed")


async def collect_coingecko():
    """Scheduled job: collect CoinGecko market overview."""
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
    try:
        collector = DexScreenerCollector()
        count = await _run_with_timeout("collect_dexscreener", collector.run())
        if count is not None:
            logger.info("Scheduled DexScreener collection: %s records", count)
    except Exception:
        logger.exception("Scheduled DexScreener collection failed")


async def collect_defillama():
    """Scheduled job: collect DefiLlama protocol data."""
    try:
        collector = DefiLlamaCollector()
        count = await _run_with_timeout("collect_defillama", collector.run())
        if count is not None:
            logger.info("Scheduled DefiLlama collection: %s records", count)
    except Exception:
        logger.exception("Scheduled DefiLlama collection failed")


async def collect_futures():
    """Scheduled job: collect Binance Futures data (funding rate, OI, long/short)."""
    try:
        collector = FuturesCollector()
        count = await _run_with_timeout("collect_futures", collector.run())
        if count is not None:
            logger.info("Scheduled Futures collection: %s records", count)
    except Exception:
        logger.exception("Scheduled Futures collection failed")


async def collect_fear_greed():
    """Scheduled job: collect Fear & Greed Index."""
    try:
        collector = FearGreedCollector()
        count = await _run_with_timeout("collect_fear_greed", collector.run())
        if count is not None:
            logger.info("Scheduled Fear & Greed collection: %s records", count)
    except Exception:
        logger.exception("Scheduled Fear & Greed collection failed")


async def run_data_retention():
    """Scheduled job: purge old fine-grained OHLCV data."""
    try:
        deleted = await _run_with_timeout("data_retention", purge_old_ohlcv())
        if deleted is not None:
            logger.info("Scheduled data retention: purged %s rows", deleted)
    except Exception:
        logger.exception("Scheduled data retention failed")


async def run_ai_analysis():
    """Scheduled job: run market-wide AI analysis plus any configured symbols."""
    settings = get_settings()
    scopes: list[str] = ["market"]
    extra = [
        s.strip() for s in (settings.ai_analysis_symbols or "").split(",") if s.strip()
    ]
    scopes.extend(extra)

    failures: list[tuple[str, str]] = []  # (scope, error)
    alerts: list[str] = []

    for scope in scopes:
        result, error = await _run_ai_analysis_for(scope)
        if error:
            failures.append((scope, error))
        elif result is not None:
            risk = result.get("risk_level", "")
            score = result.get("sentiment_score", 0)
            trend = result.get("trend", "neutral")
            if risk == "high" or abs(score) >= settings.alert_sentiment_delta:
                alerts.append(
                    f"  {scope}: {trend.upper()} (score: {score}) — Risk: {risk}"
                )

    if failures:
        failed_scopes = ", ".join(s for s, _ in failures)
        error_summary = failures[0][1][:200]
        await notify(
            "ai_analysis_down",
            f"AI Analysis failed ({len(failures)}/{len(scopes)})",
            f"Failed scopes: {failed_scopes}\nError: {error_summary}",
        )

    for alert_line in alerts:
        await notify("analysis_alert", "AI Analysis Alert", alert_line)


async def _run_ai_analysis_for(scope: str) -> tuple[dict | None, str | None]:
    """Run analysis for one scope. Returns (result, error_message)."""
    job_name = "ai_analysis" if scope == "market" else f"ai_analysis:{scope}"
    try:
        result = await _run_with_timeout(job_name, run_analysis(scope=scope))
        if result is None:
            return None, None
        logger.info(
            "Scheduled AI analysis complete: scope=%s sentiment=%s trend=%s",
            scope,
            result["sentiment_score"],
            result["trend"],
        )
        record_success(job_name)
        return result, None
    except ValueError as e:
        logger.warning("Scheduled AI analysis skipped (scope=%s): %s", scope, e)
        return None, None
    except Exception as e:
        logger.exception("Scheduled AI analysis failed (scope=%s)", scope)
        return None, str(e)


async def collect_news():
    """Scheduled job: collect crypto news."""
    try:
        collector = NewsCollector()
        count = await _run_with_timeout("collect_news", collector.run())
        if count is not None:
            logger.info("Scheduled news collection: %s records", count)
    except Exception:
        logger.exception("Scheduled news collection failed")


async def collect_newsapi():
    """Scheduled job: collect mainstream-media news from NewsAPI.org.

    Runs on a slow cadence (hour-level) because the free tier caps at
    100 requests/day. The collector itself no-ops when NEWSAPI_KEY is
    empty, so this job is safe to register unconditionally.
    """
    try:
        collector = NewsAPICollector()
        count = await _run_with_timeout("collect_newsapi", collector.run())
        if count is not None:
            logger.info("Scheduled NewsAPI collection: %s records", count)
    except Exception:
        logger.exception("Scheduled NewsAPI collection failed")


async def score_accuracy():
    """Scheduled job: evaluate matured AI recommendations and update accuracy scores."""
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

    try:
        news_scored = await _run_with_timeout(
            "score_news_accuracy", score_matured_news()
        )
        if news_scored and news_scored > 0:
            logger.info("Scored accuracy for %s matured news analyses", news_scored)
    except Exception:
        logger.exception("Scheduled news accuracy scoring failed")


async def tag_news_sentiment():
    """Scheduled job: AI sentiment tagging for untagged news."""
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


async def aggregate_fine_klines():
    """Scheduled job: aggregate 1m candles into 5m and 15m."""
    try:
        count = await _run_with_timeout("aggregate_fine_klines", aggregate_recent())
        if count is not None and count > 0:
            logger.info("Kline aggregation: upserted %s records", count)
    except Exception:
        logger.exception("Kline aggregation failed")


async def analyze_news_articles():
    """Scheduled job: structured per-article AI tagging with backlog catch-up."""
    settings = get_settings()
    max_rounds = settings.news_analysis_max_rounds
    timeout_seconds = settings.scheduler_job_timeout_seconds
    started_at = time.perf_counter()

    try:
        await delete_retryable_failures()

        total = {"processed": 0, "succeeded": 0, "failed": 0}
        for round_num in range(1, max_rounds + 1):
            elapsed = time.perf_counter() - started_at
            if timeout_seconds - elapsed < 10:
                logger.warning(
                    "News analyzer stopping: timeout approaching "
                    "(elapsed=%.1fs, limit=%ds, rounds=%d)",
                    elapsed,
                    timeout_seconds,
                    round_num - 1,
                )
                break

            try:
                result = await asyncio.wait_for(
                    analyze_pending_news(),
                    timeout=timeout_seconds - elapsed,
                )
            except TimeoutError:
                logger.error(
                    "News analyzer batch %d timed out after %.1fs",
                    round_num,
                    time.perf_counter() - started_at,
                )
                record_failure("news_analyzer", "timeout")
                return

            if result is None:
                break

            total["processed"] += result["processed"]
            total["succeeded"] += result["succeeded"]
            total["failed"] += result["failed"]

            if result["processed"] == 0:
                break

            logger.info(
                "News analyzer round %d/%d: processed=%d succeeded=%d failed=%d",
                round_num,
                max_rounds,
                result["processed"],
                result["succeeded"],
                result["failed"],
            )

        if total["processed"]:
            logger.info(
                "News analyzer totals: processed=%(processed)s "
                "succeeded=%(succeeded)s failed=%(failed)s",
                total,
            )
        record_success("news_analyzer")
    except Exception as e:
        logger.exception("Scheduled news analyzer failed")
        record_failure("news_analyzer", str(e))


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
        trigger=IntervalTrigger(hours=settings.fear_greed_interval_hours),
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

    # NewsAPI collection disabled — low freshness, high noise
    # scheduler.add_job(
    #     collect_newsapi,
    #     trigger=IntervalTrigger(hours=settings.newsapi_collect_interval_hours),
    #     id="collect_newsapi",
    #     name="Collect NewsAPI mainstream news",
    #     replace_existing=True,
    # )

    scheduler.add_job(
        run_ai_analysis,
        trigger=IntervalTrigger(hours=settings.analysis_interval_hours),
        id="ai_analysis",
        name="Run AI analysis",
        replace_existing=True,
    )

    scheduler.add_job(
        score_accuracy,
        trigger=IntervalTrigger(hours=settings.accuracy_interval_hours),
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
        analyze_news_articles,
        trigger=IntervalTrigger(minutes=settings.news_sentiment_interval_minutes),
        id="news_analyzer",
        name="AI per-article news analysis",
        replace_existing=True,
    )

    scheduler.add_job(
        aggregate_fine_klines,
        trigger=IntervalTrigger(minutes=settings.kline_aggregation_interval_minutes),
        id="aggregate_fine_klines",
        name="Aggregate 1m klines into 5m/15m",
        replace_existing=True,
    )

    scheduler.add_job(
        run_data_retention,
        trigger=IntervalTrigger(hours=settings.data_retention_interval_hours),
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
