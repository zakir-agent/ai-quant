"""Pure-Python technical indicator calculations for OHLCV data.

All functions accept plain lists (oldest-first order) and return dicts
with both numeric values and human-readable signal labels.
"""

from __future__ import annotations


def compute_indicators(
    closes: list[float],
    highs: list[float],
    lows: list[float],
    volumes: list[float],
) -> dict:
    """Compute a full set of technical indicators.

    Args:
        closes, highs, lows, volumes: price/volume lists in oldest-first order.

    Returns:
        Dict with indicator values and signal labels.
    """
    if len(closes) < 2:
        return {}

    result: dict = {}

    # RSI(14)
    rsi = _rsi(closes, 14)
    if rsi is not None:
        result["rsi_14"] = round(rsi, 1)
        if rsi > 70:
            result["rsi_signal"] = "overbought"
        elif rsi < 30:
            result["rsi_signal"] = "oversold"
        else:
            result["rsi_signal"] = "neutral"

    # Moving Averages
    for period in (7, 25, 50):
        ma = _sma(closes, period)
        if ma is not None:
            result[f"ma_{period}"] = round(ma, 2)

    # MA cross signal
    ma7 = result.get("ma_7")
    ma25 = result.get("ma_25")
    current = closes[-1]
    if ma7 is not None and ma25 is not None:
        if ma7 > ma25:
            result["ma_cross"] = "golden_cross"
        elif ma7 < ma25:
            result["ma_cross"] = "death_cross"
        else:
            result["ma_cross"] = "neutral"

    # Price vs MAs
    if ma7 is not None and ma25 is not None:
        above_all = current > ma7 and current > ma25
        below_all = current < ma7 and current < ma25
        if above_all:
            result["price_vs_ma"] = "above_all"
        elif below_all:
            result["price_vs_ma"] = "below_all"
        else:
            result["price_vs_ma"] = "mixed"

    # MACD (12, 26, 9)
    macd_line, signal_line, histogram = _macd(closes)
    if macd_line is not None and signal_line is not None and histogram is not None:
        result["macd"] = round(macd_line, 2)
        result["macd_signal"] = round(signal_line, 2)
        result["macd_histogram"] = round(histogram, 2)
        if histogram > 0:
            result["macd_trend"] = "bullish"
        elif histogram < 0:
            result["macd_trend"] = "bearish"
        else:
            result["macd_trend"] = "neutral"

    # Bollinger Bands (20, 2)
    bb = _bollinger(closes, 20, 2)
    if bb is not None:
        upper, middle, lower = bb
        result["bollinger_upper"] = round(upper, 2)
        result["bollinger_middle"] = round(middle, 2)
        result["bollinger_lower"] = round(lower, 2)
        band_width = upper - lower
        if band_width > 0:
            result["bollinger_pct"] = round((current - lower) / band_width, 2)

    # ATR(14)
    atr = _atr(highs, lows, closes, 14)
    if atr is not None:
        result["atr_14"] = round(atr, 2)

    # Volume MA ratio
    vol_ma = _sma(volumes, 20)
    if vol_ma is not None and vol_ma > 0:
        result["volume_ratio"] = round(volumes[-1] / vol_ma, 2)

    return result


# ---------------------------------------------------------------------------
# Internal helper functions
# ---------------------------------------------------------------------------


def _sma(data: list[float], period: int) -> float | None:
    """Simple Moving Average of the last `period` values."""
    if len(data) < period:
        return None
    return sum(data[-period:]) / period


def _ema(data: list[float], period: int) -> float | None:
    """Exponential Moving Average."""
    if len(data) < period:
        return None
    k = 2 / (period + 1)
    ema = sum(data[:period]) / period  # seed with SMA
    for val in data[period:]:
        ema = val * k + ema * (1 - k)
    return ema


def _ema_series(data: list[float], period: int) -> list[float]:
    """Full EMA series (returns list same length as input, first period-1 are SMA-seeded)."""
    if len(data) < period:
        return []
    k = 2 / (period + 1)
    result = []
    ema = sum(data[:period]) / period
    # Fill initial values
    for _ in range(period - 1):
        result.append(ema)
    result.append(ema)
    for val in data[period:]:
        ema = val * k + ema * (1 - k)
        result.append(ema)
    return result


def _rsi(closes: list[float], period: int = 14) -> float | None:
    """Relative Strength Index."""
    if len(closes) < period + 1:
        return None
    deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    gains = [d if d > 0 else 0 for d in deltas]
    losses = [-d if d < 0 else 0 for d in deltas]

    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period

    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period

    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def _macd(
    closes: list[float],
    fast: int = 12,
    slow: int = 26,
    signal: int = 9,
) -> tuple[float | None, float | None, float | None]:
    """MACD line, signal line, histogram."""
    if len(closes) < slow + signal:
        return None, None, None

    fast_ema = _ema_series(closes, fast)
    slow_ema = _ema_series(closes, slow)

    if not fast_ema or not slow_ema:
        return None, None, None

    # MACD line = fast EMA - slow EMA
    macd_line = [f - s for f, s in zip(fast_ema, slow_ema, strict=False)]

    # Signal line = EMA(9) of MACD line
    signal_ema = _ema_series(macd_line, signal)

    if not signal_ema:
        return None, None, None

    macd_val = macd_line[-1]
    signal_val = signal_ema[-1]
    hist = macd_val - signal_val
    return macd_val, signal_val, hist


def _bollinger(
    closes: list[float], period: int = 20, num_std: float = 2.0
) -> tuple[float, float, float] | None:
    """Bollinger Bands: (upper, middle, lower)."""
    if len(closes) < period:
        return None
    window = closes[-period:]
    middle = sum(window) / period
    variance = sum((x - middle) ** 2 for x in window) / period
    std = variance**0.5
    return middle + num_std * std, middle, middle - num_std * std


def _atr(
    highs: list[float], lows: list[float], closes: list[float], period: int = 14
) -> float | None:
    """Average True Range."""
    if len(closes) < period + 1:
        return None
    true_ranges = []
    for i in range(1, len(closes)):
        tr = max(
            highs[i] - lows[i],
            abs(highs[i] - closes[i - 1]),
            abs(lows[i] - closes[i - 1]),
        )
        true_ranges.append(tr)

    if len(true_ranges) < period:
        return None

    # Wilder's smoothing
    atr = sum(true_ranges[:period]) / period
    for tr in true_ranges[period:]:
        atr = (atr * (period - 1) + tr) / period
    return atr


# ---------------------------------------------------------------------------
# Series computation (for chart overlay)
# ---------------------------------------------------------------------------


def _sma_series(data: list[float], period: int) -> list[float | None]:
    """SMA series aligned with input length. None for insufficient data."""
    result: list[float | None] = [None] * len(data)
    if len(data) < period:
        return result
    window_sum = sum(data[:period])
    result[period - 1] = round(window_sum / period, 2)
    for i in range(period, len(data)):
        window_sum += data[i] - data[i - period]
        result[i] = round(window_sum / period, 2)
    return result


def _rsi_series(closes: list[float], period: int = 14) -> list[float | None]:
    """RSI series aligned with input length."""
    result: list[float | None] = [None] * len(closes)
    if len(closes) < period + 1:
        return result

    deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    gains = [d if d > 0 else 0 for d in deltas]
    losses = [-d if d < 0 else 0 for d in deltas]

    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period

    if avg_loss == 0:
        result[period] = 100.0
    else:
        result[period] = round(100 - (100 / (1 + avg_gain / avg_loss)), 1)

    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        if avg_loss == 0:
            result[i + 1] = 100.0
        else:
            result[i + 1] = round(100 - (100 / (1 + avg_gain / avg_loss)), 1)
    return result


def _bollinger_series(
    closes: list[float], period: int = 20, num_std: float = 2.0
) -> tuple[list[float | None], list[float | None], list[float | None]]:
    """Bollinger Bands series: (upper, middle, lower) aligned with input."""
    n = len(closes)
    upper: list[float | None] = [None] * n
    middle: list[float | None] = [None] * n
    lower: list[float | None] = [None] * n
    if n < period:
        return upper, middle, lower
    for i in range(period - 1, n):
        window = closes[i - period + 1 : i + 1]
        mean = sum(window) / period
        variance = sum((x - mean) ** 2 for x in window) / period
        std = variance**0.5
        middle[i] = round(mean, 2)
        upper[i] = round(mean + num_std * std, 2)
        lower[i] = round(mean - num_std * std, 2)
    return upper, middle, lower


def _macd_series(
    closes: list[float], fast: int = 12, slow: int = 26, signal: int = 9
) -> tuple[list[float | None], list[float | None], list[float | None]]:
    """MACD series: (macd_line, signal_line, histogram) aligned with input."""
    n = len(closes)
    empty: list[float | None] = [None] * n
    if n < slow + signal:
        return empty[:], empty[:], empty[:]

    fast_ema = _ema_series(closes, fast)
    slow_ema = _ema_series(closes, slow)
    macd_raw = [f - s for f, s in zip(fast_ema, slow_ema, strict=False)]
    signal_ema = _ema_series(macd_raw, signal)

    macd_out: list[float | None] = [None] * n
    signal_out: list[float | None] = [None] * n
    hist_out: list[float | None] = [None] * n

    # MACD line valid from index slow-1
    for i in range(slow - 1, n):
        macd_out[i] = round(macd_raw[i], 2)
    # Signal line valid from index slow-1+signal-1
    start_sig = slow - 1 + signal - 1
    for i in range(start_sig, n):
        signal_out[i] = round(signal_ema[i], 2)
        hist_out[i] = round(macd_raw[i] - signal_ema[i], 2)

    return macd_out, signal_out, hist_out


def compute_indicator_series(
    closes: list[float],
    highs: list[float],
    lows: list[float],
    volumes: list[float],
    indicators: set[str] | None = None,
) -> dict[str, list[float | None]]:
    """Compute full indicator time series for chart overlay.

    Args:
        closes, highs, lows, volumes: OHLCV data in oldest-first order.
        indicators: Set of indicator names to compute. None = all.
            Valid names: "ma", "rsi", "macd", "bollinger"

    Returns:
        Dict mapping series names to value arrays (same length as input).
    """
    all_indicators = {"ma", "rsi", "macd", "bollinger"}
    wanted = indicators or all_indicators
    result: dict[str, list[float | None]] = {}

    if "ma" in wanted:
        result["ma_7"] = _sma_series(closes, 7)
        result["ma_25"] = _sma_series(closes, 25)
        result["ma_50"] = _sma_series(closes, 50)

    if "rsi" in wanted:
        result["rsi"] = _rsi_series(closes, 14)

    if "macd" in wanted:
        macd, sig, hist = _macd_series(closes)
        result["macd"] = macd
        result["macd_signal"] = sig
        result["macd_histogram"] = hist

    if "bollinger" in wanted:
        upper, middle, lower = _bollinger_series(closes)
        result["bollinger_upper"] = upper
        result["bollinger_middle"] = middle
        result["bollinger_lower"] = lower

    return result
