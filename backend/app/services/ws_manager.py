"""WebSocket connection manager and Binance real-time data bridge.

Architecture:
- Binance WebSocket streams → Backend processing → Broadcast to all connected clients
- Supports multiple channels: kline, ticker, trade
- Clients subscribe to specific symbols/channels via JSON messages
- Closed 1m/1h kline candles are persisted to DB via buffered batch upsert
"""

import asyncio
import json
import logging
from datetime import UTC, datetime
from decimal import Decimal

import websockets
from fastapi import WebSocket
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import SQLAlchemyError

from app.config import get_settings
from app.database import async_session
from app.models.market import OHLCVData

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manage WebSocket client connections and channel subscriptions."""

    def __init__(self):
        # websocket -> set of subscribed channels (e.g., "kline:BTC/USDT:1h")
        self.connections: dict[WebSocket, set[str]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        async with self._lock:
            self.connections[ws] = set()
        logger.info(f"WS client connected. Total: {len(self.connections)}")

    async def disconnect(self, ws: WebSocket):
        async with self._lock:
            self.connections.pop(ws, None)
        logger.info(f"WS client disconnected. Total: {len(self.connections)}")

    async def subscribe(self, ws: WebSocket, channel: str):
        """Subscribe a client to a channel."""
        async with self._lock:
            if ws in self.connections:
                self.connections[ws].add(channel)
                logger.debug(f"Client subscribed to {channel}")

    async def unsubscribe(self, ws: WebSocket, channel: str):
        async with self._lock:
            if ws in self.connections:
                self.connections[ws].discard(channel)

    async def broadcast(self, channel: str, data: dict):
        """Send data to all clients subscribed to a channel."""
        message = json.dumps({"channel": channel, "data": data})
        dead = []
        async with self._lock:
            targets = [
                ws for ws, channels in self.connections.items() if channel in channels
            ]

        for ws in targets:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)

        for ws in dead:
            await self.disconnect(ws)

    async def broadcast_all(self, data: dict):
        """Send data to ALL connected clients regardless of subscription."""
        message = json.dumps(data)
        dead = []
        async with self._lock:
            targets = list(self.connections.keys())

        for ws in targets:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)

        for ws in dead:
            await self.disconnect(ws)

    @property
    def client_count(self) -> int:
        return len(self.connections)


# Global singleton
manager = ConnectionManager()


_COINGECKO_ID_TO_BINANCE = {
    "bitcoin": "btcusdt",
    "ethereum": "ethusdt",
    "solana": "solusdt",
    "binancecoin": "bnbusdt",
    "ripple": "xrpusdt",
    "cardano": "adausdt",
    "dogecoin": "dogeusdt",
    "tron": "trxusdt",
    "chainlink": "linkusdt",
    "polkadot": "dotusdt",
    "hyperliquid": "hypeusdt",
}


def _symbols_from_config() -> list[str]:
    """Derive Binance WS symbol list from coingecko_coin_ids setting."""
    ids = [
        cid.strip()
        for cid in get_settings().coingecko_coin_ids.split(",")
        if cid.strip()
    ]
    symbols = []
    for cid in ids:
        binance_sym = _COINGECKO_ID_TO_BINANCE.get(cid)
        if binance_sym:
            symbols.append(binance_sym)
        else:
            logger.warning(
                "No Binance mapping for CoinGecko id '%s', skipping WS ticker", cid
            )
    return symbols or ["btcusdt", "ethusdt"]


class BinanceWSBridge:
    """Connect to Binance WebSocket streams and relay data to our clients.

    Uses Binance's combined streams endpoint to multiplex multiple symbols.
    Closed kline candles are buffered and batch-written to the database.
    """

    def __init__(self):
        self._task: asyncio.Task | None = None
        self._flush_task: asyncio.Task | None = None
        self._running = False
        self._symbols = _symbols_from_config()
        settings = get_settings()
        self._timeframes = settings.binance_ws_timeframes.split(",")
        self._ws_base_url = settings.binance_ws_base_url
        self._ping_interval = settings.binance_ws_ping_interval
        self._reconnect_delay = settings.binance_ws_reconnect_delay
        self._persist_enabled = settings.kline_ws_persist
        self._flush_interval = settings.kline_ws_flush_interval
        self._flush_batch_size = settings.kline_ws_flush_batch_size
        self._kline_buffer: list[dict] = []
        self._buffer_lock = asyncio.Lock()

    def start(self):
        """Start the Binance WebSocket bridge in background."""
        if self._task is not None:
            return
        self._running = True
        self._task = asyncio.create_task(self._run())
        if self._persist_enabled:
            self._flush_task = asyncio.create_task(self._flush_loop())
        logger.info("Binance WS bridge started (persist=%s)", self._persist_enabled)

    async def _stop_flush(self):
        """Cancel flush task and do a final flush."""
        if self._flush_task:
            self._flush_task.cancel()
            self._flush_task = None
        if self._persist_enabled:
            async with self._buffer_lock:
                await self._flush_buffer()

    def stop(self):
        """Stop the bridge."""
        self._running = False
        if self._flush_task:
            self._flush_task.cancel()
            self._flush_task = None
        if self._task:
            self._task.cancel()
            self._task = None
        logger.info("Binance WS bridge stopped")

    async def _run(self):
        """Main loop: connect to Binance, process messages, reconnect on failure."""
        while self._running:
            try:
                streams = []
                for sym in self._symbols:
                    for tf in self._timeframes:
                        streams.append(f"{sym}@kline_{tf}")
                    streams.append(f"{sym}@miniTicker")

                url = f"{self._ws_base_url}?streams={'/'.join(streams)}"
                logger.info(f"Connecting to Binance WS with {len(streams)} streams")

                async with websockets.connect(
                    url, ping_interval=self._ping_interval
                ) as ws:
                    async for raw_msg in ws:
                        if not self._running:
                            break
                        try:
                            msg = json.loads(raw_msg)
                            await self._process_message(msg)
                        except Exception:
                            logger.debug(
                                "Failed to process Binance WS message", exc_info=True
                            )

            except asyncio.CancelledError:
                break
            except Exception:
                if self._running:
                    logger.warning(
                        "Binance WS disconnected, reconnecting in %ds...",
                        self._reconnect_delay,
                        exc_info=True,
                    )
                    await asyncio.sleep(self._reconnect_delay)

    async def _process_message(self, msg: dict):
        """Parse Binance combined stream message and broadcast to our clients."""
        stream = msg.get("stream", "")
        data = msg.get("data", {})

        if "@kline_" in stream:
            await self._handle_kline(data)
        elif "@miniTicker" in stream:
            await self._handle_ticker(data)

    async def _flush_loop(self):
        """Periodically flush buffered kline records to the database."""
        while self._running:
            await asyncio.sleep(self._flush_interval)
            async with self._buffer_lock:
                await self._flush_buffer()

    async def _flush_buffer(self):
        """Write buffered kline records to DB. Must be called under _buffer_lock."""
        if not self._kline_buffer:
            return
        records = self._kline_buffer[:]
        self._kline_buffer.clear()
        try:
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
            logger.debug("Flushed %d WS kline records to DB", len(records))
        except SQLAlchemyError:
            logger.warning(
                "Failed to flush WS kline buffer (%d records)",
                len(records),
                exc_info=True,
            )
            async with self._buffer_lock:
                self._kline_buffer = records + self._kline_buffer

    async def _handle_kline(self, data: dict):
        """Handle Binance kline/candlestick event."""
        k = data.get("k", {})
        if not k:
            return

        symbol_raw = k.get("s", "")  # "BTCUSDT"
        interval = k.get("i", "")  # "1h"
        is_closed = k.get("x", False)  # True if candle is closed

        # Convert BTCUSDT -> BTC/USDT
        base = symbol_raw.replace("USDT", "")
        symbol = f"{base}/USDT"

        candle = {
            "time": k["t"] // 1000,  # Open time in seconds
            "open": float(k["o"]),
            "high": float(k["h"]),
            "low": float(k["l"]),
            "close": float(k["c"]),
            "volume": float(k["v"]),
            "closed": is_closed,
        }

        channel = f"kline:{symbol}:{interval}"
        await manager.broadcast(
            channel,
            {
                "type": "kline",
                "symbol": symbol,
                "timeframe": interval,
                "candle": candle,
            },
        )

        if is_closed and self._persist_enabled:
            record = {
                "symbol": symbol,
                "exchange": "binance",
                "timeframe": interval,
                "timestamp": datetime.fromtimestamp(k["t"] / 1000, tz=UTC),
                "open": Decimal(str(k["o"])),
                "high": Decimal(str(k["h"])),
                "low": Decimal(str(k["l"])),
                "close": Decimal(str(k["c"])),
                "volume": Decimal(str(k["v"])),
            }
            async with self._buffer_lock:
                self._kline_buffer.append(record)
                if len(self._kline_buffer) >= self._flush_batch_size:
                    await self._flush_buffer()

    async def _handle_ticker(self, data: dict):
        """Handle Binance 24hr mini ticker event."""
        symbol_raw = data.get("s", "")
        base = symbol_raw.replace("USDT", "")
        symbol = f"{base}/USDT"
        open_price = float(data.get("o", 0))
        close_price = float(data.get("c", 0))

        if open_price > 0:
            change_pct = round((close_price - open_price) / open_price * 100, 2)
        else:
            # Defensive fallback for malformed upstream data.
            change_pct = 0.0

        ticker = {
            "symbol": symbol,
            "price": close_price,
            "open": open_price,
            "high": float(data.get("h", 0)),
            "low": float(data.get("l", 0)),
            "volume": float(data.get("v", 0)),
            "change_pct": change_pct,
            "timestamp": datetime.now(UTC).isoformat(),
        }

        channel = f"ticker:{symbol}"
        await manager.broadcast(
            channel,
            {
                "type": "ticker",
                **ticker,
            },
        )


# Global singleton
binance_bridge = BinanceWSBridge()
