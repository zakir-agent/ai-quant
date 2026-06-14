"""Composite signal aggregator — combines technical indicator signals with AI analysis.

Instead of relying solely on the AI black box, this module:
1. Generates independent technical signals from indicators
2. Merges them with the latest AI sentiment/recommendation
3. Produces a weighted composite score with confidence level

Weights can be tuned based on backtesting accuracy results.
"""

import asyncio
import json
import logging
from datetime import UTC, datetime

from sqlalchemy import select

from app.config import get_settings
from app.database import async_session
from app.models.analysis import AnalysisReport
from app.models.composite_signal import CompositeSignal
from app.models.market import OHLCVData
from app.services.cache import cache_get
from app.services.technical_indicators import compute_indicators
from app.services.weight_tuner import get_tuned_weights

logger = logging.getLogger(__name__)

# Default weights (sum to 1.0) — tunable based on backtest accuracy
DEFAULT_WEIGHTS = {
    "technical": 0.45,  # Technical indicator composite
    "ai_sentiment": 0.30,  # AI analysis sentiment score
    "fear_greed": 0.10,  # Market-wide fear & greed
    "futures": 0.15,  # Derivatives positioning
}


def _technical_score(indicators: dict) -> tuple[float, list[str]]:
    """Convert technical indicators into a normalized score (-100 to +100).

    Returns (score, list of signal reasons).
    """
    signals: list[float] = []
    reasons: list[str] = []

    # RSI signal
    rsi = indicators.get("rsi_14")
    if rsi is not None:
        if rsi < 30:
            signals.append(60)
            reasons.append(f"RSI({rsi:.0f}) 超卖")
        elif rsi < 40:
            signals.append(30)
            reasons.append(f"RSI({rsi:.0f}) 偏低")
        elif rsi > 70:
            signals.append(-60)
            reasons.append(f"RSI({rsi:.0f}) 超买")
        elif rsi > 60:
            signals.append(-30)
            reasons.append(f"RSI({rsi:.0f}) 偏高")
        else:
            signals.append(0)

    # MA cross
    ma_cross = indicators.get("ma_cross")
    if ma_cross == "golden_cross":
        signals.append(50)
        reasons.append("MA7/25 金叉")
    elif ma_cross == "death_cross":
        signals.append(-50)
        reasons.append("MA7/25 死叉")

    # Price vs MA
    price_vs_ma = indicators.get("price_vs_ma")
    if price_vs_ma == "above_all":
        signals.append(30)
        reasons.append("价格在所有均线之上")
    elif price_vs_ma == "below_all":
        signals.append(-30)
        reasons.append("价格在所有均线之下")

    # MACD
    macd_trend = indicators.get("macd_trend")
    histogram = indicators.get("macd_histogram", 0)
    if macd_trend == "bullish":
        strength = min(40, abs(histogram) * 10) if histogram else 20
        signals.append(strength)
        reasons.append(f"MACD 看多(柱值{histogram})")
    elif macd_trend == "bearish":
        strength = min(40, abs(histogram) * 10) if histogram else 20
        signals.append(-strength)
        reasons.append(f"MACD 看空(柱值{histogram})")

    # Bollinger position
    bb_pct = indicators.get("bollinger_pct")
    if bb_pct is not None:
        if bb_pct < 0.1:
            signals.append(40)
            reasons.append(f"布林带底部({bb_pct:.0%})")
        elif bb_pct > 0.9:
            signals.append(-40)
            reasons.append(f"布林带顶部({bb_pct:.0%})")

    # Volume confirmation
    vol_ratio = indicators.get("volume_ratio")
    if vol_ratio is not None and vol_ratio > 2.0:
        reasons.append(f"放量({vol_ratio:.1f}x)")

    if not signals:
        return 0.0, []

    score = sum(signals) / len(signals)
    return max(-100, min(100, score)), reasons


def _futures_score(futures_data: dict | None) -> tuple[float, list[str]]:
    """Score based on derivatives data (-100 to +100).

    High funding rate + crowded longs = bearish signal (contrarian)
    Negative funding rate + crowded shorts = bullish signal (contrarian)
    """
    if not futures_data:
        return 0.0, []

    score = 0.0
    reasons = []

    funding = futures_data.get("funding_rate")
    if funding is not None:
        if funding > 0.0001:  # > 0.01%
            score -= 30
            reasons.append(f"资金费率偏高({funding:.4%})，多头杠杆过度")
        elif funding < -0.0001:
            score += 30
            reasons.append(f"资金费率为负({funding:.4%})，空头付费")

    ls_ratio = futures_data.get("long_short_ratio")
    if ls_ratio is not None:
        if ls_ratio > 2.5:
            score -= 30
            reasons.append(f"多空比极高({ls_ratio:.2f})，多头拥挤")
        elif ls_ratio > 2.0:
            score -= 15
            reasons.append(f"多空比偏高({ls_ratio:.2f})")
        elif ls_ratio < 0.8:
            score += 30
            reasons.append(f"多空比偏低({ls_ratio:.2f})，空头拥挤")
        elif ls_ratio < 1.0:
            score += 15
            reasons.append(f"多空比偏低({ls_ratio:.2f})")

    return max(-100, min(100, score)), reasons


def _fear_greed_score(fg_data: dict | None) -> tuple[float, list[str]]:
    """Score from Fear & Greed Index (-100 to +100). Contrarian signal."""
    if not fg_data:
        return 0.0, []

    value = fg_data.get("value", 50)
    classification = fg_data.get("classification", "")

    # Contrarian: extreme fear = bullish, extreme greed = bearish
    # Map 0-100 to +100 to -100 (inverted)
    score = (50 - value) * 2
    reasons = [f"恐惧贪婪指数 {value}（{classification}）"]

    return max(-100, min(100, score)), reasons


async def generate_composite_signal(
    symbol: str = "BTC/USDT",
    weights: dict | None = None,
) -> dict:
    """Generate a weighted composite trading signal for a symbol.

    Returns:
        {
            "symbol": str,
            "composite_score": float (-100 to +100),
            "signal": "strong_buy|buy|neutral|sell|strong_sell",
            "confidence": "high|medium|low",
            "components": {
                "technical": {"score": float, "weight": float, "reasons": [...]},
                "ai_sentiment": {"score": float, "weight": float, "source": str},
                "fear_greed": {"score": float, "weight": float, "reasons": [...]},
                "futures": {"score": float, "weight": float, "reasons": [...]},
            },
            "weights_source": "tuned|default|custom",
            "timestamp": str
        }
    """
    if weights is not None:
        w = weights
        weights_source = "custom"
    else:
        tuned = await get_tuned_weights()
        if tuned is not None:
            w = tuned
            weights_source = "tuned"
        else:
            w = DEFAULT_WEIGHTS
            weights_source = "default"
    base = symbol.split("/")[0] if "/" in symbol else symbol

    async def _fetch_fear_greed():
        try:
            raw = await cache_get("market:fear_greed")
            if raw:
                return json.loads(raw)
        except Exception:
            logger.warning("Failed to get Fear & Greed data", exc_info=True)
        return None

    # Cache fetch runs concurrently with DB session
    fg_coro = _fetch_fear_greed()

    async with async_session() as session:
        from app.models.market import FuturesMetric

        ohlcv_stmt = (
            select(OHLCVData)
            .where(OHLCVData.symbol == symbol, OHLCVData.timeframe == "1h")
            .order_by(OHLCVData.timestamp.desc())
            .limit(50)
        )
        ohlcv_rows = list((await session.execute(ohlcv_stmt)).scalars().all())

        ai_report = None
        for scope in [symbol, base, "market"]:
            ai_stmt = (
                select(AnalysisReport)
                .where(AnalysisReport.scope == scope)
                .order_by(AnalysisReport.created_at.desc())
                .limit(1)
            )
            ai_report = (await session.execute(ai_stmt)).scalar_one_or_none()
            if ai_report:
                break

        fut_stmt = (
            select(FuturesMetric)
            .where(FuturesMetric.symbol == symbol)
            .order_by(FuturesMetric.timestamp.desc())
            .limit(1)
        )
        fut_row = (await session.execute(fut_stmt)).scalar_one_or_none()

    fg_data = await fg_coro

    # 1. Technical indicators
    tech_score = 0.0
    tech_reasons: list[str] = []
    rows = list(reversed(ohlcv_rows))
    if len(rows) >= 15:
        closes = [float(r.close) for r in rows]
        highs = [float(r.high) for r in rows]
        lows = [float(r.low) for r in rows]
        volumes = [float(r.volume) for r in rows]
        indicators = compute_indicators(closes, highs, lows, volumes)
        tech_score, tech_reasons = _technical_score(indicators)

    # 2. AI sentiment
    ai_score = 0.0
    ai_source = "none"
    if ai_report:
        ai_score = float(ai_report.sentiment_score)
        ai_source = f"{ai_report.scope} (model: {ai_report.model_used})"

    # 3. Fear & Greed
    fg_score = 0.0
    fg_reasons: list[str] = []
    if fg_data:
        fg_score, fg_reasons = _fear_greed_score(fg_data)

    # 4. Futures
    fut_score = 0.0
    fut_reasons: list[str] = []
    if fut_row:
        fut_data = {
            "funding_rate": float(fut_row.funding_rate)
            if fut_row.funding_rate
            else None,
            "long_short_ratio": float(fut_row.long_short_ratio)
            if fut_row.long_short_ratio
            else None,
        }
        fut_score, fut_reasons = _futures_score(fut_data)

    # 5. Weighted composite
    composite = (
        tech_score * w["technical"]
        + ai_score * w["ai_sentiment"]
        + fg_score * w["fear_greed"]
        + fut_score * w["futures"]
    )
    composite = max(-100, min(100, composite))

    # Determine signal and confidence
    if composite >= 50:
        signal = "strong_buy"
    elif composite >= 20:
        signal = "buy"
    elif composite <= -50:
        signal = "strong_sell"
    elif composite <= -20:
        signal = "sell"
    else:
        signal = "neutral"

    # Confidence: based on component agreement
    component_signs = [
        1 if s > 10 else (-1 if s < -10 else 0)
        for s in [tech_score, ai_score, fg_score, fut_score]
    ]
    non_zero = [s for s in component_signs if s != 0]
    if len(non_zero) >= 3 and len(set(non_zero)) == 1:
        confidence = "high"
    elif len(non_zero) >= 2 and len(set(non_zero)) == 1:
        confidence = "medium"
    else:
        confidence = "low"

    return {
        "symbol": symbol,
        "composite_score": round(composite, 1),
        "signal": signal,
        "confidence": confidence,
        "components": {
            "technical": {
                "score": round(tech_score, 1),
                "weight": w["technical"],
                "reasons": tech_reasons,
            },
            "ai_sentiment": {
                "score": round(ai_score, 1),
                "weight": w["ai_sentiment"],
                "source": ai_source,
            },
            "fear_greed": {
                "score": round(fg_score, 1),
                "weight": w["fear_greed"],
                "reasons": fg_reasons,
            },
            "futures": {
                "score": round(fut_score, 1),
                "weight": w["futures"],
                "reasons": fut_reasons,
            },
        },
        "weights_source": weights_source,
        "timestamp": datetime.now(UTC).isoformat(),
    }


# Fallback when AI_ANALYSIS_SYMBOLS is empty (legacy market-only setups)
_DEFAULT_SIGNAL_SYMBOLS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT"]


def _tracked_symbols() -> list[str]:
    """Symbols to generate signals for, from AI_ANALYSIS_SYMBOLS (comma-separated)."""
    settings = get_settings()
    symbols = [
        s.strip() for s in (settings.ai_analysis_symbols or "").split(",") if s.strip()
    ]
    return symbols or _DEFAULT_SIGNAL_SYMBOLS


async def generate_all_signals() -> list[dict]:
    """Generate composite signals for all tracked symbols."""
    symbols = _tracked_symbols()

    async def _safe(sym: str) -> dict | None:
        try:
            return await generate_composite_signal(sym)
        except Exception:
            logger.warning("Failed to generate signal for %s", sym, exc_info=True)
            return None

    results = await asyncio.gather(*[_safe(s) for s in symbols])
    return [r for r in results if r is not None]


async def persist_all_signals() -> int:
    """Generate composite signals for all tracked symbols and store one row each.

    Returns the number of rows written. The weights column records the weights
    used for this run so re-tuning DEFAULT_WEIGHTS doesn't rewrite history.
    """
    results = await generate_all_signals()
    if not results:
        return 0

    async with async_session() as session:
        for r in results:
            session.add(
                CompositeSignal(
                    symbol=r["symbol"],
                    composite_score=r["composite_score"],
                    signal=r["signal"],
                    confidence=r["confidence"],
                    components=r["components"],
                    # Actual weights used this run (tuned or default), pulled
                    # from the components so history stays interpretable.
                    weights={k: v["weight"] for k, v in r["components"].items()},
                )
            )
        await session.commit()

    logger.info("Persisted %s composite signals", len(results))
    return len(results)
