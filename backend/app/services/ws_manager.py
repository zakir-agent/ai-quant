"""WebSocket connection manager and Binance real-time data bridge.

Architecture:
- Binance WebSocket streams → Backend processing → Broadcast to all connected clients
- Supports multiple channels: kline, ticker, trade
- Clients subscribe to specific symbols/channels via JSON messages
"""

import asyncio
import json
import logging
from datetime import UTC, datetime

from fastapi import WebSocket

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


class BinanceWSBridge:
    """Connect to Binance WebSocket streams and relay data to our clients.

    Uses Binance's combined streams endpoint to multiplex multiple symbols.
    """

    BINANCE_WS_BASE = "wss://stream.binance.com:9443/stream"

    def __init__(self):
        self._task: asyncio.Task | None = None
        self._running = False
        self._symbols = ["btcusdt", "ethusdt", "solusdt", "bnbusdt"]
        self._timeframes = ["1m", "1h"]  # 1m for real-time, 1h for chart updates

    def start(self):
        """Start the Binance WebSocket bridge in background."""
        if self._task is not None:
            return
        self._running = True
        self._task = asyncio.create_task(self._run())
        logger.info("Binance WS bridge started")

    def stop(self):
        """Stop the bridge."""
        self._running = False
        if self._task:
            self._task.cancel()
            self._task = None
        logger.info("Binance WS bridge stopped")

    async def _run(self):
        """Main loop: connect to Binance, process messages, reconnect on failure."""
        import websockets

        while self._running:
            try:
                streams = []
                for sym in self._symbols:
                    for tf in self._timeframes:
                        streams.append(f"{sym}@kline_{tf}")
                    streams.append(f"{sym}@miniTicker")

                url = f"{self.BINANCE_WS_BASE}?streams={'/'.join(streams)}"
                logger.info(f"Connecting to Binance WS with {len(streams)} streams")

                async with websockets.connect(url, ping_interval=20) as ws:
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
                        "Binance WS disconnected, reconnecting in 5s...", exc_info=True
                    )
                    await asyncio.sleep(5)

    async def _process_message(self, msg: dict):
        """Parse Binance combined stream message and broadcast to our clients."""
        stream = msg.get("stream", "")
        data = msg.get("data", {})

        if "@kline_" in stream:
            await self._handle_kline(data)
        elif "@miniTicker" in stream:
            await self._handle_ticker(data)

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

    async def _handle_ticker(self, data: dict):
        """Handle Binance 24hr mini ticker event."""
        symbol_raw = data.get("s", "")
        base = symbol_raw.replace("USDT", "")
        symbol = f"{base}/USDT"

        ticker = {
            "symbol": symbol,
            "price": float(data.get("c", 0)),
            "open": float(data.get("o", 0)),
            "high": float(data.get("h", 0)),
            "low": float(data.get("l", 0)),
            "volume": float(data.get("v", 0)),
            "change_pct": round(
                (float(data.get("c", 0)) - float(data.get("o", 0)))
                / float(data.get("o", 1))
                * 100,
                2,
            ),
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
