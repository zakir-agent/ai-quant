"""CEX price collector using ccxt (Binance by default)."""

import asyncio
import logging
from datetime import UTC, datetime
from decimal import Decimal

import ccxt.async_support as ccxt
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.collectors.base import BaseCollector
from app.config import get_settings
from app.database import async_session
from app.models.market import OHLCVData

logger = logging.getLogger(__name__)

DEFAULT_SYMBOLS = [
    "BTC/USDT",
    "ETH/USDT",
    "BTC/USDC",
    "ETH/USDC",
    "SOL/USDT",
    "BNB/USDT",
]
DEFAULT_TIMEFRAMES = ["1h", "4h", "1d"]


class CEXCollector(BaseCollector):
    name = "cex"

    def __init__(
        self,
        symbols: list[str] | None = None,
        timeframes: list[str] | None = None,
        exchange_id: str = "binance",
    ):
        self.symbols = symbols or DEFAULT_SYMBOLS
        self.timeframes = timeframes or DEFAULT_TIMEFRAMES
        self.exchange_id = exchange_id
        settings = get_settings()
        exchange_class = getattr(ccxt, exchange_id)
        config = {"enableRateLimit": True, "timeout": 30000}
        if settings.binance_api_key:
            config["apiKey"] = settings.binance_api_key
            config["secret"] = settings.binance_api_secret
        self.exchange = exchange_class(config)

    async def collect(self) -> dict:
        """Fetch OHLCV data for all symbol/timeframe combinations."""
        results = {}
        try:
            for symbol in self.symbols:
                for tf in self.timeframes:
                    for attempt in range(3):
                        try:
                            ohlcv = await self.exchange.fetch_ohlcv(
                                symbol, tf, limit=100
                            )
                            results[(symbol, tf)] = ohlcv
                            logger.debug(
                                f"Fetched {len(ohlcv)} candles for {symbol} {tf}"
                            )
                            break
                        except ccxt.RequestTimeout:
                            if attempt < 2:
                                logger.warning(
                                    f"Timeout fetching {symbol} {tf}, retrying ({attempt + 1}/3)..."
                                )
                                await asyncio.sleep(2**attempt)
                            else:
                                logger.warning(
                                    f"Failed to fetch {symbol} {tf} after 3 attempts",
                                    exc_info=True,
                                )
                        except Exception:
                            logger.warning(
                                f"Failed to fetch {symbol} {tf}", exc_info=True
                            )
                            break
        finally:
            await self.exchange.close()
        return results

    async def transform(self, raw_data: dict) -> list[dict]:
        """Transform ccxt OHLCV arrays into dicts."""
        records = []
        for (symbol, tf), candles in raw_data.items():
            for candle in candles:
                ts, o, h, low, c, v = candle
                records.append(
                    {
                        "symbol": symbol,
                        "exchange": self.exchange_id,
                        "timeframe": tf,
                        "timestamp": datetime.fromtimestamp(ts / 1000, tz=UTC),
                        "open": Decimal(str(o)),
                        "high": Decimal(str(h)),
                        "low": Decimal(str(low)),
                        "close": Decimal(str(c)),
                        "volume": Decimal(str(v)),
                    }
                )
        return records

    async def store(self, records: list[dict]) -> int:
        """Upsert OHLCV records into the database."""
        if not records:
            return 0
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
        return len(records)
