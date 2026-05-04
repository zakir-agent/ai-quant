"""Historical kline backfill with conservative Binance rate limiting.

Usage:
    cd backend
    python -m app.scripts.backfill_klines --timeframes 1m --days 7
    python -m app.scripts.backfill_klines --timeframes 1m,5m,15m --days 30 --symbols BTC/USDT,ETH/USDT
    python -m app.scripts.backfill_klines --timeframes 1m --days 3 --delay 1.0
"""

import argparse
import asyncio
import logging
import time
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import ccxt.async_support as ccxt
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.config import get_settings
from app.database import async_session
from app.models.market import OHLCVData
from app.services.rate_limiter import BinanceRateLimiter

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


async def backfill(
    timeframes: list[str],
    days: int,
    symbols: list[str] | None = None,
    delay: float = 0.5,
    batch_size: int = 1000,
):
    settings = get_settings()
    symbols = symbols or [
        s.strip() for s in settings.cex_default_symbols.split(",") if s.strip()
    ]
    limiter = BinanceRateLimiter(max_weight_per_minute=60)

    config = {
        "enableRateLimit": True,
        "timeout": settings.http_timeout_default * 1000,
    }
    if settings.binance_api_key:
        config["apiKey"] = settings.binance_api_key
        config["secret"] = settings.binance_api_secret
    exchange = ccxt.binance(config)  # type: ignore[arg-type]

    total_requests = 0
    total_records = 0
    start_time = time.monotonic()

    try:
        for symbol in symbols:
            for tf in timeframes:
                since = datetime.now(UTC) - timedelta(days=days)
                existing_max = await _get_latest_timestamp(symbol, "binance", tf)
                if existing_max and existing_max > since:
                    since = existing_max
                    logger.info("Resuming %s %s from %s", symbol, tf, since.isoformat())

                since_ms = int(since.timestamp() * 1000)

                while since_ms < int(datetime.now(UTC).timestamp() * 1000):
                    await limiter.acquire(weight=1)
                    try:
                        ohlcv = await exchange.fetch_ohlcv(
                            symbol, tf, since=since_ms, limit=batch_size
                        )
                    except Exception:
                        logger.warning(
                            "Failed to fetch %s %s since %s",
                            symbol,
                            tf,
                            since_ms,
                            exc_info=True,
                        )
                        break

                    total_requests += 1

                    if not ohlcv:
                        break

                    records = [
                        {
                            "symbol": symbol,
                            "exchange": "binance",
                            "timeframe": tf,
                            "timestamp": datetime.fromtimestamp(c[0] / 1000, tz=UTC),
                            "open": Decimal(str(c[1])),
                            "high": Decimal(str(c[2])),
                            "low": Decimal(str(c[3])),
                            "close": Decimal(str(c[4])),
                            "volume": Decimal(str(c[5])),
                        }
                        for c in ohlcv
                    ]

                    async with async_session() as session:
                        stmt = pg_insert(OHLCVData).values(records)
                        stmt = stmt.on_conflict_do_update(
                            constraint="uq_ohlcv",
                            set_={
                                "open": stmt.excluded.open,
                                "high": stmt.excluded.high,
                                "low": stmt.excluded.low,
                                "close": stmt.excluded.close,
                                "volume": stmt.excluded.volume,
                            },
                        )
                        await session.execute(stmt)
                        await session.commit()

                    total_records += len(records)
                    since_ms = ohlcv[-1][0] + 1

                    elapsed = time.monotonic() - start_time
                    logger.info(
                        "[%s %s] +%d candles (total: %d records, %d requests, %.1fs elapsed)",
                        symbol,
                        tf,
                        len(records),
                        total_records,
                        total_requests,
                        elapsed,
                    )

                    await asyncio.sleep(delay)

    finally:
        await exchange.close()

    elapsed = time.monotonic() - start_time
    logger.info(
        "Backfill complete: %d records, %d API requests, %.1fs elapsed",
        total_records,
        total_requests,
        elapsed,
    )


async def _get_latest_timestamp(
    symbol: str, exchange: str, timeframe: str
) -> datetime | None:
    async with async_session() as session:
        result = await session.execute(
            select(func.max(OHLCVData.timestamp)).where(
                OHLCVData.symbol == symbol,
                OHLCVData.exchange == exchange,
                OHLCVData.timeframe == timeframe,
            )
        )
        return result.scalar_one_or_none()


def main():
    parser = argparse.ArgumentParser(
        description="Backfill historical kline data from Binance"
    )
    parser.add_argument(
        "--timeframes", default="1m", help="Comma-separated timeframes (default: 1m)"
    )
    parser.add_argument(
        "--days", type=int, default=7, help="Days of history to fetch (default: 7)"
    )
    parser.add_argument(
        "--symbols", default=None, help="Comma-separated symbols (default: from config)"
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=0.5,
        help="Seconds between API calls (default: 0.5)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=1000,
        help="Candles per request (default: 1000)",
    )
    args = parser.parse_args()

    timeframes = [t.strip() for t in args.timeframes.split(",")]
    symbols = [s.strip() for s in args.symbols.split(",")] if args.symbols else None

    asyncio.run(backfill(timeframes, args.days, symbols, args.delay, args.batch_size))


if __name__ == "__main__":
    main()
