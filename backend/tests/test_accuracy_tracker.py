"""Tests for time_horizon-aware accuracy scoring."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch

from app.config import get_settings, get_time_horizon_hours
from app.services import accuracy_tracker


def test_get_eval_window_hours_uses_mapping():
    get_settings.cache_clear()
    get_time_horizon_hours.cache_clear()
    assert accuracy_tracker._get_eval_window_hours("IMMEDIATE") == 2
    assert accuracy_tracker._get_eval_window_hours("SWING") == 48
    assert accuracy_tracker._get_eval_window_hours("LONG_TERM") == 168


def test_get_eval_window_hours_falls_back_for_unknown():
    get_settings.cache_clear()
    get_time_horizon_hours.cache_clear()
    fallback = get_settings().accuracy_eval_window_hours
    assert accuracy_tracker._get_eval_window_hours("UNKNOWN") == fallback
    assert accuracy_tracker._get_eval_window_hours(None) == fallback


def test_score_one_defers_when_long_horizon_still_pending():
    created_at = datetime(2025, 1, 1, 0, 0, tzinfo=UTC)
    immediate_future = created_at + timedelta(hours=2)
    report = SimpleNamespace(
        scope="BTC/USDT",
        created_at=created_at,
        recommendations=[
            {
                "symbol": "BTC/USDT",
                "action": "buy",
                "time_horizon": "IMMEDIATE",
            },
            {
                "symbol": "BTC/USDT",
                "action": "sell",
                "time_horizon": "LONG_TERM",
            },
        ],
    )
    price_cache = {
        ("BTC/USDT", created_at): 100.0,
        ("BTC/USDT", immediate_future): 101.0,
    }
    fixed_now = created_at + timedelta(hours=30)

    async def run():
        with patch.object(accuracy_tracker, "_utc_now", return_value=fixed_now):
            return await accuracy_tracker._score_one(None, report, price_cache)

    assert asyncio.run(run()) is None


def test_score_one_scores_when_all_horizons_mature():
    created_at = datetime(2025, 1, 1, 0, 0, tzinfo=UTC)
    immediate_future = created_at + timedelta(hours=2)
    long_future = created_at + timedelta(hours=168)
    report = SimpleNamespace(
        scope="BTC/USDT",
        created_at=created_at,
        recommendations=[
            {
                "symbol": "BTC/USDT",
                "action": "buy",
                "time_horizon": "IMMEDIATE",
            },
            {
                "symbol": "BTC/USDT",
                "action": "sell",
                "time_horizon": "LONG_TERM",
            },
        ],
    )
    price_cache = {
        ("BTC/USDT", created_at): 100.0,
        ("BTC/USDT", immediate_future): 101.0,
        ("BTC/USDT", long_future): 99.0,
    }
    fixed_now = created_at + timedelta(hours=200)

    async def run():
        with patch.object(accuracy_tracker, "_utc_now", return_value=fixed_now):
            return await accuracy_tracker._score_one(None, report, price_cache)

    result = asyncio.run(run())
    assert result is not None
    assert result["scored"] is True
    assert result["accuracy_pct"] == 100.0
    assert len(result["details"]) == 2
    assert "window_hours" not in result


def _make_report(recs: list[dict], created_at: datetime) -> SimpleNamespace:
    return SimpleNamespace(
        scope="BTC/USDT", created_at=created_at, recommendations=recs
    )


def _run_score_one(report, price_cache, candles=None, now_offset_hours=10):
    fixed_now = report.created_at + timedelta(hours=now_offset_hours)

    async def run():
        with patch.object(accuracy_tracker, "_utc_now", return_value=fixed_now):
            return await accuracy_tracker._score_one(
                None, report, price_cache, candles
            )

    return asyncio.run(run())


CREATED = datetime(2025, 1, 1, 0, 0, tzinfo=UTC)


def test_path_scoring_stop_hit_first():
    report = _make_report(
        [
            {
                "symbol": "BTC/USDT",
                "action": "buy",
                "time_horizon": "IMMEDIATE",
                "target_price": 105.0,
                "stop_loss": 95.0,
                "confidence": "high",
            }
        ],
        CREATED,
    )
    price_cache = {("BTC/USDT", CREATED): 100.0}
    candles = {
        "BTC/USDT": [
            (CREATED, 103.0, 98.0, 101.0),
            (CREATED + timedelta(hours=1), 102.0, 94.0, 96.0),  # stop touched
            (CREATED + timedelta(hours=2), 106.0, 100.0, 105.0),  # target later
        ]
    }
    result = _run_score_one(report, price_cache, candles)
    assert result is not None
    d = result["details"][0]
    assert d["exit_reason"] == "stop"
    assert d["correct"] is False
    assert d["stop_hit"] is True
    assert d["target_hit"] is False
    assert d["return_pct"] == -5.0
    assert result["accuracy_pct"] == 0.0


def test_path_scoring_target_hit_first():
    report = _make_report(
        [
            {
                "symbol": "BTC/USDT",
                "action": "buy",
                "time_horizon": "IMMEDIATE",
                "target_price": 105.0,
                "stop_loss": 95.0,
            }
        ],
        CREATED,
    )
    price_cache = {("BTC/USDT", CREATED): 100.0}
    candles = {
        "BTC/USDT": [
            (CREATED, 106.0, 99.0, 104.0),  # target touched, stop untouched
            (CREATED + timedelta(hours=1), 101.0, 94.0, 95.0),  # stop later
        ]
    }
    result = _run_score_one(report, price_cache, candles)
    assert result is not None
    d = result["details"][0]
    assert d["exit_reason"] == "target"
    assert d["correct"] is True
    assert d["target_hit"] is True
    assert d["stop_hit"] is False
    assert d["return_pct"] == 5.0
    assert result["accuracy_pct"] == 100.0


def test_path_scoring_same_candle_counts_as_stop():
    report = _make_report(
        [
            {
                "symbol": "BTC/USDT",
                "action": "buy",
                "time_horizon": "IMMEDIATE",
                "target_price": 105.0,
                "stop_loss": 95.0,
            }
        ],
        CREATED,
    )
    price_cache = {("BTC/USDT", CREATED): 100.0}
    candles = {"BTC/USDT": [(CREATED, 106.0, 94.0, 100.0)]}  # both levels touched
    result = _run_score_one(report, price_cache, candles)
    assert result is not None
    d = result["details"][0]
    assert d["exit_reason"] == "stop"
    assert d["correct"] is False


def test_path_scoring_sell_directions_are_inverted():
    report = _make_report(
        [
            {
                "symbol": "BTC/USDT",
                "action": "sell",
                "time_horizon": "IMMEDIATE",
                "target_price": 95.0,
                "stop_loss": 105.0,
            }
        ],
        CREATED,
    )
    price_cache = {("BTC/USDT", CREATED): 100.0}
    candles = {"BTC/USDT": [(CREATED, 106.0, 99.0, 102.0)]}  # high >= stop
    result = _run_score_one(report, price_cache, candles)
    assert result is not None
    d = result["details"][0]
    assert d["exit_reason"] == "stop"
    assert d["correct"] is False
    assert d["return_pct"] == -5.0


def test_window_end_flat_when_below_min_move():
    future = CREATED + timedelta(hours=2)
    report = _make_report(
        [{"symbol": "BTC/USDT", "action": "buy", "time_horizon": "IMMEDIATE"}],
        CREATED,
    )
    price_cache = {
        ("BTC/USDT", CREATED): 100.0,
        ("BTC/USDT", future): 100.2,  # +0.2% < 0.3% threshold
    }
    result = _run_score_one(report, price_cache)
    assert result is not None
    d = result["details"][0]
    assert d["exit_reason"] == "window_end"
    assert d["correct"] is None
    assert d["flat"] is True
    assert result["accuracy_pct"] is None  # only flat entries -> no denominator


def test_window_end_applies_when_no_level_touched():
    future = CREATED + timedelta(hours=2)
    report = _make_report(
        [
            {
                "symbol": "BTC/USDT",
                "action": "buy",
                "time_horizon": "IMMEDIATE",
                "target_price": 110.0,
                "stop_loss": 90.0,
                "confidence": "Medium",
            }
        ],
        CREATED,
    )
    price_cache = {
        ("BTC/USDT", CREATED): 100.0,
        ("BTC/USDT", future): 102.0,
    }
    candles = {
        "BTC/USDT": [
            (CREATED, 103.0, 99.0, 101.0),
            (CREATED + timedelta(hours=1), 104.0, 100.0, 102.0),
        ]
    }
    result = _run_score_one(report, price_cache, candles)
    assert result is not None
    d = result["details"][0]
    assert d["exit_reason"] == "window_end"
    assert d["correct"] is True
    assert d["target_hit"] is False
    assert d["stop_hit"] is False
    assert d["confidence"] == "medium"  # written into details, lowercased


def test_score_one_skips_report_without_actionable_recs():
    report = _make_report([{"action": "hold"}], CREATED)
    result = _run_score_one(report, {})
    assert result == {
        "scored": True,
        "skipped": "no_actionable_recommendations",
        "evaluated_at": (CREATED + timedelta(hours=10)).isoformat(),
    }


def test_score_one_missing_price_within_grace_retries():
    report = _make_report(
        [{"symbol": "BTC/USDT", "action": "buy", "time_horizon": "IMMEDIATE"}],
        CREATED,
    )
    # Window ended 8h ago, still within the 48h grace period -> retry (None)
    assert _run_score_one(report, {}, now_offset_hours=10) is None


def test_score_one_missing_price_beyond_grace_is_terminal():
    report = _make_report(
        [{"symbol": "BTC/USDT", "action": "buy", "time_horizon": "IMMEDIATE"}],
        CREATED,
    )
    result = _run_score_one(report, {}, now_offset_hours=60)  # 2h window + 48h grace
    assert result is not None
    assert result["skipped"] == "missing_price_data"
    assert result["scored"] is True


def test_summarize_rec_details_buckets_by_confidence():
    details = [
        {"confidence": "high", "correct": True, "return_pct": 5.0},
        {"confidence": "high", "correct": False, "return_pct": -2.0},
        {"confidence": "low", "correct": None, "flat": True, "return_pct": 0.2},
        {"confidence": "medium", "correct": True, "return_pct": 1.0},
    ]
    summary = accuracy_tracker._summarize_rec_details(details)
    assert summary["total"] == 4
    assert summary["flat_count"] == 1
    assert summary["accuracy_pct"] == 66.7  # 2 correct / 3 decided
    assert summary["avg_return_pct"] == 1.05  # over all 4 entries
    by_conf = summary["by_confidence"]
    assert by_conf["high"] == {
        "accuracy_pct": 50.0,
        "avg_return_pct": 1.5,
        "count": 2,
    }
    assert by_conf["medium"]["accuracy_pct"] == 100.0
    assert by_conf["medium"]["count"] == 1
    assert by_conf["low"]["accuracy_pct"] is None  # only a flat entry
    assert by_conf["low"]["count"] == 1


def test_compute_baseline_buy_btc_hit_rate():
    t0 = CREATED
    t1 = CREATED + timedelta(hours=4)
    t2 = CREATED + timedelta(hours=8)
    windows = [(t0, 2), (t1, 2), (t2, 2)]
    btc_prices = {
        ("BTC/USDT", t0): 100.0,
        ("BTC/USDT", t0 + timedelta(hours=2)): 102.0,  # +2% -> correct
        ("BTC/USDT", t1): 100.0,
        ("BTC/USDT", t1 + timedelta(hours=2)): 99.9,  # -0.1% -> flat, excluded
        ("BTC/USDT", t2): 100.0,
        ("BTC/USDT", t2 + timedelta(hours=2)): 95.0,  # -5% -> incorrect
    }
    baseline = accuracy_tracker._compute_baseline(windows, btc_prices, 0.3)
    assert baseline == 50.0


def test_compute_baseline_returns_none_without_data():
    assert accuracy_tracker._compute_baseline([(CREATED, 2)], {}, 0.3) is None


def test_score_one_accuracy_uses_scored_details_only():
    created_at = datetime(2025, 1, 1, 0, 0, tzinfo=UTC)
    immediate_future = created_at + timedelta(hours=2)
    report = SimpleNamespace(
        scope="BTC/USDT",
        created_at=created_at,
        recommendations=[
            {
                "symbol": "BTC/USDT",
                "action": "buy",
                "time_horizon": "IMMEDIATE",
            },
            {
                "symbol": "ETH/USDT",
                "action": "sell",
                "time_horizon": "IMMEDIATE",
            },
        ],
    )
    price_cache = {
        ("BTC/USDT", created_at): 100.0,
        ("BTC/USDT", immediate_future): 99.0,
    }
    fixed_now = created_at + timedelta(hours=10)

    async def run():
        with patch.object(accuracy_tracker, "_utc_now", return_value=fixed_now):
            return await accuracy_tracker._score_one(None, report, price_cache)

    result = asyncio.run(run())
    assert result is not None
    assert len(result["details"]) == 1
    assert result["accuracy_pct"] == 0.0
