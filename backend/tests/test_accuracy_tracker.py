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
