"""Binance Futures collector — funding rates, open interest, long/short ratio."""

import asyncio
import logging
from datetime import UTC, datetime
from decimal import Decimal

import httpx
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.collectors.base import BaseCollector
from app.config import get_settings
from app.database import async_session
from app.models.market import FuturesMetric
from app.services.rate_limiter import rate_limiter

logger = logging.getLogger(__name__)


class FuturesCollector(BaseCollector):
    def name(self) -> str:
        return "futures"

    def __init__(self, symbols: list[str] | None = None):
        settings = get_settings()
        self.symbols = symbols or settings.binance_futures_symbols.split(",")

    async def collect(self) -> dict:
        """Fetch funding rate, open interest, and long/short ratio from Binance Futures."""
        settings = get_settings()
        base_url = settings.binance_futures_base_url
        results: dict[str, dict] = {}
        async with httpx.AsyncClient(timeout=settings.http_timeout_default) as client:
            for symbol in self.symbols:
                data: dict = {"symbol": symbol}
                # Funding rate (latest)
                try:
                    await rate_limiter.acquire(weight=1)
                    resp = await client.get(
                        f"{base_url}/fapi/v1/fundingRate",
                        params={"symbol": symbol, "limit": 1},
                    )
                    resp.raise_for_status()
                    items = resp.json()
                    if items:
                        data["funding_rate"] = float(items[-1]["fundingRate"])
                        data["funding_time"] = items[-1]["fundingTime"]
                except (httpx.HTTPStatusError, httpx.RequestError):
                    logger.warning(
                        f"Failed to fetch funding rate for {symbol}", exc_info=True
                    )
                    data["funding_rate"] = None

                # Open interest
                try:
                    await rate_limiter.acquire(weight=1)
                    resp = await client.get(
                        f"{base_url}/fapi/v1/openInterest",
                        params={"symbol": symbol},
                    )
                    resp.raise_for_status()
                    oi = resp.json()
                    data["open_interest"] = float(oi["openInterest"])
                except (httpx.HTTPStatusError, httpx.RequestError):
                    logger.warning(
                        f"Failed to fetch open interest for {symbol}", exc_info=True
                    )
                    data["open_interest"] = None

                # Long/short ratio (top traders, 5min period)
                try:
                    await rate_limiter.acquire(weight=1)
                    resp = await client.get(
                        f"{base_url}/futures/data/topLongShortAccountRatio",
                        params={"symbol": symbol, "period": "1h", "limit": 1},
                    )
                    resp.raise_for_status()
                    items = resp.json()
                    if items:
                        data["long_short_ratio"] = float(items[-1]["longShortRatio"])
                        data["long_account"] = float(items[-1]["longAccount"])
                        data["short_account"] = float(items[-1]["shortAccount"])
                except (httpx.HTTPStatusError, httpx.RequestError):
                    logger.warning(
                        f"Failed to fetch long/short ratio for {symbol}", exc_info=True
                    )
                    data["long_short_ratio"] = None

                results[symbol] = data
                await asyncio.sleep(settings.binance_rate_limit_delay)

        return results

    async def transform(self, raw_data: dict) -> list[dict]:
        """Transform raw futures data into DB records."""
        now = datetime.now(UTC)
        records = []
        for symbol, data in raw_data.items():
            # Convert BTCUSDT -> BTC/USDT for consistency
            base = symbol.replace("USDT", "")
            pair = f"{base}/USDT"
            records.append(
                {
                    "symbol": pair,
                    "exchange": "binance",
                    "funding_rate": Decimal(str(data["funding_rate"]))
                    if data.get("funding_rate") is not None
                    else None,
                    "open_interest": Decimal(str(data["open_interest"]))
                    if data.get("open_interest") is not None
                    else None,
                    "long_short_ratio": Decimal(str(data["long_short_ratio"]))
                    if data.get("long_short_ratio") is not None
                    else None,
                    "long_account_pct": Decimal(str(data["long_account"]))
                    if data.get("long_account") is not None
                    else None,
                    "short_account_pct": Decimal(str(data["short_account"]))
                    if data.get("short_account") is not None
                    else None,
                    "timestamp": now,
                }
            )
        return records

    async def store(self, records: list[dict]) -> int:
        """Upsert futures metrics into the database."""
        if not records:
            return 0
        async with async_session() as session:
            stmt = pg_insert(FuturesMetric).values(records)
            stmt = stmt.on_conflict_do_update(
                constraint="uq_futures_metric",
                set_={
                    "funding_rate": stmt.excluded.funding_rate,
                    "open_interest": stmt.excluded.open_interest,
                    "long_short_ratio": stmt.excluded.long_short_ratio,
                    "long_account_pct": stmt.excluded.long_account_pct,
                    "short_account_pct": stmt.excluded.short_account_pct,
                },
            )
            await session.execute(stmt)
            await session.commit()
        return len(records)
