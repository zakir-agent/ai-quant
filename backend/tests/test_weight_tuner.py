"""Tests for composite signal weight auto-tuning."""

from __future__ import annotations

import asyncio
import json
from unittest.mock import patch

import pytest

from app.services import signal_aggregator, weight_tuner
from app.services.signal_aggregator import DEFAULT_WEIGHTS, generate_composite_signal
from app.services.weight_tuner import (
    _MIN_SCORED_ROWS,
    COMPONENTS,
    _component_hit_rates,
    _derive_weights,
    _tuning_result,
    get_tuned_weights,
)


def _row(scores: dict[str, float], change_pct: float) -> tuple[dict, dict]:
    """Build a (components, accuracy) pair like a scored composite_signal row."""
    components = {
        c: {"score": scores.get(c, 50.0), "weight": DEFAULT_WEIGHTS[c]}
        for c in COMPONENTS
    }
    accuracy = {"scored": True, "change_pct": change_pct, "correct": change_pct > 0}
    return components, accuracy


# ---------------------------------------------------------------- hit rates


def test_hit_rates_counts_hits_and_misses():
    rows = [
        _row({"technical": 50.0}, 2.0),  # bullish call, price up — hit
        _row({"technical": 50.0}, -2.0),  # bullish call, price down — miss
        _row({"technical": -50.0}, -2.0),  # bearish call, price down — hit
        _row({"technical": -50.0}, 2.0),  # bearish call, price up — miss
    ]
    stats = _component_hit_rates(rows)
    assert stats["technical"]["samples"] == 4
    assert stats["technical"]["hits"] == 2
    assert stats["technical"]["hit_rate"] == 0.5


def test_hit_rates_skips_neutral_scores():
    rows = [
        _row({"technical": 5.0}, 2.0),  # inside ±10 band — no directional call
        _row({"technical": 10.0}, 2.0),  # band edges are neutral too
        _row({"technical": -10.0}, -2.0),
        _row({"technical": 60.0}, 2.0),  # the only graded sample (hit)
    ]
    stats = _component_hit_rates(rows)
    assert stats["technical"]["samples"] == 1
    assert stats["technical"]["hits"] == 1
    assert stats["technical"]["hit_rate"] == 1.0


def test_hit_rates_none_when_no_samples():
    stats = _component_hit_rates([])
    for c in COMPONENTS:
        assert stats[c]["samples"] == 0
        assert stats[c]["hit_rate"] is None


# ------------------------------------------------------------ sample gating


def test_tuning_result_insufficient_total_rows():
    rows = [_row({}, 1.0) for _ in range(_MIN_SCORED_ROWS - 1)]
    result = _tuning_result(rows)
    assert result["weights"] is None
    assert result["reason"] == "insufficient_data"
    assert result["sample_count"] == _MIN_SCORED_ROWS - 1


def test_tuning_result_insufficient_component_samples():
    # Plenty of rows, but futures is always neutral — < 10 valid samples.
    rows = [_row({"futures": 0.0}, 1.0) for _ in range(40)]
    result = _tuning_result(rows)
    assert result["weights"] is None
    assert result["reason"] == "insufficient_data"
    assert result["component_hit_rates"]["futures"]["samples"] == 0


def test_tuning_result_returns_weights_when_data_sufficient():
    rows = [_row({}, 1.0) for _ in range(_MIN_SCORED_ROWS)]
    result = _tuning_result(rows)
    assert result["weights"] is not None
    assert set(result["weights"]) == set(DEFAULT_WEIGHTS)
    assert result["sample_count"] == _MIN_SCORED_ROWS
    for c in COMPONENTS:
        assert result["component_hit_rates"][c]["hit_rate"] == 1.0


def test_compute_tuned_weights_returns_none_on_insufficient_data():
    async def _few_rows():
        return [_row({}, 1.0) for _ in range(5)]

    with patch.object(weight_tuner, "_load_scored_rows", _few_rows):
        assert asyncio.run(weight_tuner.compute_tuned_weights()) is None


# -------------------------------------------------------- weight derivation


def test_derive_weights_normalized_and_bounded():
    # Extreme spread: technical perfect, the rest at baseline — exercises clamping.
    weights = _derive_weights(
        {"technical": 1.0, "ai_sentiment": 0.45, "fear_greed": 0.45, "futures": 0.45}
    )
    assert sum(weights.values()) == pytest.approx(1.0, abs=1e-3)
    for c, v in weights.items():
        assert 0.05 <= v <= 0.55 + 1e-9, f"{c} weight {v} out of bounds"


def test_derive_weights_higher_hit_rate_gets_higher_weight():
    # fear_greed has the lowest default (0.10) but the best hit rate — it must
    # overtake components with worse hit rates despite their higher defaults.
    weights = _derive_weights(
        {"technical": 0.45, "ai_sentiment": 0.45, "fear_greed": 0.9, "futures": 0.45}
    )
    assert weights["fear_greed"] > weights["technical"]
    assert weights["fear_greed"] > DEFAULT_WEIGHTS["fear_greed"]
    assert sum(weights.values()) == pytest.approx(1.0, abs=1e-3)


def test_derive_weights_floor_keeps_bad_components_alive():
    weights = _derive_weights(
        {"technical": 0.0, "ai_sentiment": 0.8, "fear_greed": 0.8, "futures": 0.8}
    )
    assert weights["technical"] >= 0.05
    assert sum(weights.values()) == pytest.approx(1.0, abs=1e-3)


# ----------------------------------------------------------- cache read path


def test_get_tuned_weights_reads_cache():
    payload = {"weights": {c: 0.25 for c in COMPONENTS}, "sample_count": 50}

    async def _hit(_key):
        return json.dumps(payload)

    with patch.object(weight_tuner, "cache_get", _hit):
        assert asyncio.run(get_tuned_weights()) == payload["weights"]


def test_get_tuned_weights_none_on_miss_or_null_weights():
    async def _miss(_key):
        return None

    async def _null_weights(_key):
        return json.dumps({"weights": None, "reason": "insufficient_data"})

    with patch.object(weight_tuner, "cache_get", _miss):
        assert asyncio.run(get_tuned_weights()) is None
    with patch.object(weight_tuner, "cache_get", _null_weights):
        assert asyncio.run(get_tuned_weights()) is None


# ------------------------------------------------- weights_source labelling


class _FakeResult:
    def scalars(self):
        return self

    def all(self):
        return []

    def scalar_one_or_none(self):
        return None


class _FakeSession:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def execute(self, stmt):
        return _FakeResult()


async def _no_cache(_key):
    return None


def _run_signal(tuned_weights_fn, weights=None):
    with (
        patch.object(signal_aggregator, "async_session", lambda: _FakeSession()),
        patch.object(signal_aggregator, "cache_get", _no_cache),
        patch.object(signal_aggregator, "get_tuned_weights", tuned_weights_fn),
    ):
        return asyncio.run(generate_composite_signal("BTC/USDT", weights=weights))


def test_generate_signal_weights_source_default():
    async def _no_tuned():
        return None

    result = _run_signal(_no_tuned)
    assert result["weights_source"] == "default"
    for c in COMPONENTS:
        assert result["components"][c]["weight"] == DEFAULT_WEIGHTS[c]


def test_generate_signal_weights_source_tuned():
    tuned = {"technical": 0.5, "ai_sentiment": 0.2, "fear_greed": 0.1, "futures": 0.2}

    async def _tuned():
        return tuned

    result = _run_signal(_tuned)
    assert result["weights_source"] == "tuned"
    for c in COMPONENTS:
        assert result["components"][c]["weight"] == tuned[c]


def test_generate_signal_weights_source_custom():
    async def _must_not_be_called():
        raise AssertionError("get_tuned_weights must not run for explicit weights")

    custom = {"technical": 0.4, "ai_sentiment": 0.3, "fear_greed": 0.2, "futures": 0.1}
    result = _run_signal(_must_not_be_called, weights=custom)
    assert result["weights_source"] == "custom"
    assert result["components"]["futures"]["weight"] == 0.1
