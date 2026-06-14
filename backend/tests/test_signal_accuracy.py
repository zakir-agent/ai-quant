"""Tests for composite signal accuracy scoring and bucket stats."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from app.services.signal_accuracy import (
    _NO_PRICE_GRACE_HOURS,
    _compute_bucket_stats,
    _score_signal,
)

WINDOW_HOURS = 24
CREATED_AT = datetime(2025, 1, 1, 0, 0, tzinfo=UTC)
EVAL_TIME = CREATED_AT + timedelta(hours=WINDOW_HOURS)


def _row(signal: str, symbol: str = "BTC/USDT") -> SimpleNamespace:
    return SimpleNamespace(symbol=symbol, signal=signal, created_at=CREATED_AT)


def _prices(price_then: float, price_after: float) -> dict:
    return {
        ("BTC/USDT", CREATED_AT): price_then,
        ("BTC/USDT", EVAL_TIME): price_after,
    }


def test_buy_correct_when_price_rises():
    now = EVAL_TIME + timedelta(hours=1)
    result = _score_signal(_row("buy"), _prices(100.0, 105.0), now, WINDOW_HOURS)
    assert result is not None
    assert result["scored"] is True
    assert result["correct"] is True
    assert result["price_at_signal"] == 100.0
    assert result["price_after"] == 105.0
    assert result["change_pct"] == 5.0


def test_strong_buy_incorrect_when_price_falls():
    now = EVAL_TIME + timedelta(hours=1)
    result = _score_signal(_row("strong_buy"), _prices(100.0, 95.0), now, WINDOW_HOURS)
    assert result is not None
    assert result["correct"] is False
    assert result["change_pct"] == -5.0


def test_sell_correct_when_price_falls():
    now = EVAL_TIME + timedelta(hours=1)
    result = _score_signal(_row("sell"), _prices(100.0, 90.0), now, WINDOW_HOURS)
    assert result is not None
    assert result["correct"] is True


def test_strong_sell_incorrect_when_price_rises():
    now = EVAL_TIME + timedelta(hours=1)
    result = _score_signal(_row("strong_sell"), _prices(100.0, 110.0), now, WINDOW_HOURS)
    assert result is not None
    assert result["correct"] is False


def test_neutral_never_scored():
    now = EVAL_TIME + timedelta(hours=100)
    assert _score_signal(_row("neutral"), _prices(100.0, 110.0), now, WINDOW_HOURS) is None


def test_not_matured_returns_none():
    now = EVAL_TIME - timedelta(hours=1)
    assert _score_signal(_row("buy"), _prices(100.0, 105.0), now, WINDOW_HOURS) is None


def test_missing_price_within_grace_retries():
    now = EVAL_TIME + timedelta(hours=_NO_PRICE_GRACE_HOURS - 1)
    assert _score_signal(_row("buy"), {}, now, WINDOW_HOURS) is None


def test_missing_price_beyond_grace_writes_terminal_skip():
    now = EVAL_TIME + timedelta(hours=_NO_PRICE_GRACE_HOURS + 1)
    result = _score_signal(_row("buy"), {}, now, WINDOW_HOURS)
    assert result == {"scored": True, "skipped": "no_price_data"}


def test_bucket_stats_groups_by_signal_strength():
    rows = [
        ("strong_buy", {"scored": True, "correct": True}),
        ("strong_buy", {"scored": True, "correct": False}),
        ("buy", {"scored": True, "correct": True}),
        ("sell", {"scored": True, "correct": True}),
        ("strong_sell", {"scored": True, "correct": False}),
    ]
    stats = _compute_bucket_stats(rows)
    assert stats["total_scored"] == 5
    assert stats["accuracy_pct"] == 60.0
    assert stats["by_signal"]["strong_buy"] == {"accuracy_pct": 50.0, "count": 2}
    assert stats["by_signal"]["buy"] == {"accuracy_pct": 100.0, "count": 1}
    assert stats["by_signal"]["sell"] == {"accuracy_pct": 100.0, "count": 1}
    assert stats["by_signal"]["strong_sell"] == {"accuracy_pct": 0.0, "count": 1}


def test_bucket_stats_excludes_skipped_rows():
    rows = [
        ("buy", {"scored": True, "correct": True}),
        ("buy", {"scored": True, "skipped": "no_price_data"}),
    ]
    stats = _compute_bucket_stats(rows)
    assert stats["total_scored"] == 1
    assert stats["accuracy_pct"] == 100.0
    assert stats["by_signal"]["buy"]["count"] == 1


def test_bucket_stats_empty_returns_none_accuracy():
    stats = _compute_bucket_stats([])
    assert stats["total_scored"] == 0
    assert stats["accuracy_pct"] is None
    assert stats["by_signal"]["buy"] == {"accuracy_pct": None, "count": 0}
