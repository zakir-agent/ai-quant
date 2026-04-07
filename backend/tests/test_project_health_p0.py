import asyncio
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from decimal import Decimal

from app.api.market import get_kline
from app.collectors.cex import CEXCollector
from app.main import health_check
from app.services.ws_manager import BinanceWSBridge


def test_cex_transform_converts_ccxt_rows_to_records():
    collector = object.__new__(CEXCollector)
    collector.exchange_id = "binance"

    raw_data = {
        ("BTC/USDT", "1h"): [
            [1710000000000, 50000.0, 51000.0, 49500.0, 50500.0, 123.45],
        ]
    }

    records = asyncio.run(collector.transform(raw_data))

    assert len(records) == 1
    first = records[0]
    assert first["symbol"] == "BTC/USDT"
    assert first["exchange"] == "binance"
    assert first["timeframe"] == "1h"
    assert first["timestamp"] == datetime.fromtimestamp(1710000000, tz=UTC)
    assert first["open"] == Decimal("50000.0")
    assert first["close"] == Decimal("50500.0")


def test_market_kline_returns_ascending_candles():
    class FakeResult:
        def __init__(self, rows):
            self._rows = rows

        def scalars(self):
            return self

        def all(self):
            return self._rows

    class FakeSession:
        async def execute(self, _stmt):
            newer = type(
                "Row",
                (),
                {
                    "timestamp": datetime(2026, 1, 1, 1, tzinfo=UTC),
                    "open": Decimal("101"),
                    "high": Decimal("102"),
                    "low": Decimal("100"),
                    "close": Decimal("101.5"),
                    "volume": Decimal("20"),
                },
            )()
            older = type(
                "Row",
                (),
                {
                    "timestamp": datetime(2026, 1, 1, 0, tzinfo=UTC),
                    "open": Decimal("100"),
                    "high": Decimal("101"),
                    "low": Decimal("99"),
                    "close": Decimal("100.5"),
                    "volume": Decimal("10"),
                },
            )()
            # DB query sorts DESC; endpoint reverses to ASC.
            return FakeResult([newer, older])

    payload = asyncio.run(
        get_kline(
            symbol="BTC/USDT",
            exchange="binance",
            timeframe="1h",
            limit=2,
            indicators=None,
            db=FakeSession(),
        )
    )

    assert payload["symbol"] == "BTC/USDT"
    assert len(payload["data"]) == 2
    assert payload["data"][0]["time"] < payload["data"][1]["time"]
    assert payload["data"][0]["open"] == 100.0
    assert payload["data"][1]["open"] == 101.0


def test_health_check_reports_ok_when_dependencies_work(monkeypatch):
    class DummySession:
        async def execute(self, _query):
            return None

    @asynccontextmanager
    async def fake_async_session():
        yield DummySession()

    async def fake_cache_ping():
        return True

    monkeypatch.setattr("app.database.async_session", fake_async_session)
    monkeypatch.setattr("app.services.cache.cache_ping", fake_cache_ping)

    result = asyncio.run(health_check())

    assert result["status"] == "ok"
    assert result["checks"]["api"] == "ok"
    assert result["checks"]["database"] == "ok"
    assert "ok" in result["checks"]["cache"]


def test_ws_ticker_handles_zero_open_price_without_crashing():
    bridge = BinanceWSBridge()

    captured = {}

    async def fake_broadcast(channel: str, data: dict):
        captured["channel"] = channel
        captured["data"] = data

    from app.services import ws_manager

    original_broadcast = ws_manager.manager.broadcast
    ws_manager.manager.broadcast = fake_broadcast
    try:
        asyncio.run(
            bridge._handle_ticker(
                {
                    "s": "BTCUSDT",
                    "c": "50000",
                    "o": "0",
                    "h": "51000",
                    "l": "49000",
                    "v": "123",
                }
            )
        )
    finally:
        ws_manager.manager.broadcast = original_broadcast

    assert captured["channel"] == "ticker:BTC/USDT"
    assert captured["data"]["type"] == "ticker"
    assert captured["data"]["change_pct"] == 0.0
