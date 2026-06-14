"""Auto-tuning of composite signal weights from historical accuracy.

Looks at recent scored ``composite_signal`` rows and measures, per component
(technical / ai_sentiment / fear_greed / futures), how often the component's
directional call (score > +10 bullish, < -10 bearish, otherwise neutral and
skipped) matched the realized price direction (``accuracy.change_pct``).

Hit rates are turned into weights with smoothing and bounds so small samples
can't swing the composite violently:

    raw      = max(hit_rate - 0.45, 0.05)          # baseline excess, floored
    blended  = 0.5 * (raw / sum(raw)) + 0.5 * DEFAULT_WEIGHTS
    weights  = clamp each to [0.05, 0.55], redistributing the residual so
               the result still sums to 1.0

The tuned weights are cached under ``signals:tuned_weights`` (7-day TTL) by a
daily scheduler job; the read path (``get_tuned_weights``) never recomputes.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select

from app.config import get_settings
from app.database import async_session
from app.models.composite_signal import CompositeSignal
from app.services.cache import cache_get, cache_set

logger = logging.getLogger(__name__)

_CACHE_KEY = "signals:tuned_weights"
_CACHE_TTL = 7 * 24 * 3600  # tuned weights expire if the daily job stops running

COMPONENTS = ("technical", "ai_sentiment", "fear_greed", "futures")

# Minimum data before tuning kicks in — below these we keep DEFAULT_WEIGHTS.
_MIN_SCORED_ROWS = 30
_MIN_COMPONENT_SAMPLES = 10

# Component scores within ±band are neutral: no directional call to grade.
_NEUTRAL_BAND = 10.0

_HIT_RATE_BASELINE = 0.45  # roughly "coin flip minus fees" — excess drives weight
_RAW_FLOOR = 0.05  # keep every component alive even on a bad streak
_BLEND_FACTOR = 0.5  # 50/50 mix with DEFAULT_WEIGHTS for smoothing
_WEIGHT_MIN = 0.05
_WEIGHT_MAX = 0.55


def _component_hit_rates(rows: list[tuple[dict, dict]]) -> dict[str, dict[str, Any]]:
    """Per-component directional hit stats from (components, accuracy) pairs.

    Returns {component: {"hits": int, "samples": int, "hit_rate": float | None}}.
    Neutral component scores (|score| <= band) are skipped for that component.
    """
    stats: dict[str, dict[str, Any]] = {
        c: {"hits": 0, "samples": 0} for c in COMPONENTS
    }
    for components, accuracy in rows:
        change_pct = accuracy.get("change_pct")
        if change_pct is None:
            continue
        for name in COMPONENTS:
            comp = (components or {}).get(name) or {}
            score = comp.get("score")
            if score is None or -_NEUTRAL_BAND <= score <= _NEUTRAL_BAND:
                continue
            hit = change_pct > 0 if score > _NEUTRAL_BAND else change_pct < 0
            stats[name]["samples"] += 1
            if hit:
                stats[name]["hits"] += 1

    for s in stats.values():
        s["hit_rate"] = round(s["hits"] / s["samples"], 4) if s["samples"] else None
    return stats


def _clamp_and_renormalize(weights: dict[str, float]) -> dict[str, float]:
    """Clamp each weight to [_WEIGHT_MIN, _WEIGHT_MAX] while keeping sum == 1.

    Plain divide-by-sum after clamping can push a capped weight back out of
    bounds, so the residual is redistributed among unsaturated components
    instead (converges in a few passes for 4 components).
    """
    w = dict(weights)
    for _ in range(8):
        w = {c: min(max(v, _WEIGHT_MIN), _WEIGHT_MAX) for c, v in w.items()}
        residual = 1.0 - sum(w.values())
        if abs(residual) < 1e-9:
            break
        if residual > 0:
            adjustable = [c for c, v in w.items() if v < _WEIGHT_MAX - 1e-12]
        else:
            adjustable = [c for c, v in w.items() if v > _WEIGHT_MIN + 1e-12]
        if not adjustable:
            break
        delta = residual / len(adjustable)
        for c in adjustable:
            w[c] += delta
    return w


def _derive_weights(hit_rates: dict[str, float]) -> dict[str, float]:
    """Turn per-component hit rates into a weights dict summing to 1.0."""
    # Deferred import: signal_aggregator imports get_tuned_weights from here.
    from app.services.signal_aggregator import DEFAULT_WEIGHTS

    raw = {c: max(hit_rates[c] - _HIT_RATE_BASELINE, _RAW_FLOOR) for c in COMPONENTS}
    raw_total = sum(raw.values())
    blended = {
        c: _BLEND_FACTOR * (raw[c] / raw_total)
        + (1 - _BLEND_FACTOR) * DEFAULT_WEIGHTS[c]
        for c in COMPONENTS
    }
    total = sum(blended.values())
    weights = _clamp_and_renormalize({c: v / total for c, v in blended.items()})
    return {c: round(v, 4) for c, v in weights.items()}


def _tuning_result(rows: list[tuple[dict, dict]]) -> dict[str, Any]:
    """Pure tuning computation: weights (or None) plus metadata."""
    stats = _component_hit_rates(rows)
    result: dict[str, Any] = {
        "sample_count": len(rows),
        "component_hit_rates": {
            c: {"hit_rate": s["hit_rate"], "samples": s["samples"]}
            for c, s in stats.items()
        },
    }
    if len(rows) < _MIN_SCORED_ROWS or any(
        s["samples"] < _MIN_COMPONENT_SAMPLES for s in stats.values()
    ):
        result["weights"] = None
        result["reason"] = "insufficient_data"
        return result

    result["weights"] = _derive_weights(
        {c: s["hit_rate"] for c, s in stats.items()}
    )
    return result


async def _load_scored_rows() -> list[tuple[dict, dict]]:
    """Scored, non-skipped (components, accuracy) pairs within the lookback window."""
    lookback_days = get_settings().weight_tuning_lookback_days
    cutoff = datetime.now(UTC) - timedelta(days=lookback_days)

    async with async_session() as session:
        stmt = (
            select(CompositeSignal.components, CompositeSignal.accuracy)
            .where(CompositeSignal.created_at >= cutoff)
            .where(CompositeSignal.accuracy.isnot(None))
        )
        rows = (await session.execute(stmt)).all()

    return [
        (components, accuracy)
        for components, accuracy in rows
        if accuracy and accuracy.get("scored") and "change_pct" in accuracy
    ]


async def compute_tuned_weights() -> dict | None:
    """Compute tuned weights from recent accuracy history.

    Returns a dict shaped like DEFAULT_WEIGHTS, or None when there isn't
    enough scored data to tune safely.
    """
    rows = await _load_scored_rows()
    return _tuning_result(rows)["weights"]


async def update_tuned_weights() -> dict:
    """Recompute tuned weights and cache the full payload. Returns the payload."""
    rows = await _load_scored_rows()
    payload = _tuning_result(rows)
    payload["computed_at"] = datetime.now(UTC).isoformat()

    await cache_set(_CACHE_KEY, json.dumps(payload), ttl=_CACHE_TTL)

    if payload["weights"] is None:
        logger.info(
            "Weight tuning skipped: insufficient data (scored rows=%s)", len(rows)
        )
    else:
        logger.info("Tuned signal weights updated: %s", payload["weights"])
    return payload


async def get_tuning_info() -> dict | None:
    """Return the cached tuning payload (weights + metadata), or None."""
    raw = await cache_get(_CACHE_KEY)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return None


async def get_tuned_weights() -> dict | None:
    """Cached tuned weights, or None when absent/insufficient data.

    Read-only: recomputation happens exclusively in the scheduled
    ``update_tuned_weights`` job, never on the signal read path.
    """
    info = await get_tuning_info()
    if info and info.get("weights"):
        return info["weights"]
    return None
