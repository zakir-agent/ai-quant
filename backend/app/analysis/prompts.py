"""Prompt templates for AI analysis.

The output contract is defined in ``app.analysis.schemas`` and enforced via
LiteLLM's ``response_format`` (see ``app.services.ai_client``). However, not
all providers support strict JSON schema mode, so the prompts also describe the
expected output structure inline as a fallback.
"""

from __future__ import annotations

import json
from typing import Any

PROMPT_VERSION = "v6"

_OUTPUT_SCHEMA_DESC = """
输出必须是严格符合以下 JSON 结构的对象，不要返回任何额外文本或 markdown 包裹：
{
  "sentiment_score": <整数, -100到100, 正值看多负值看空>,
  "trend": <"bullish" | "bearish" | "neutral">,
  "risk_level": <"low" | "medium" | "high">,
  "summary": <字符串, 100-300字的分析总结>,
  "key_observations": [<字符串数组, 3-5条关键观察>],
  "recommendations": [
    {
      "symbol": <交易对如"BTC/USDT">,
      "action": <"buy" | "sell" | "hold" | "watch">,
      "reason": <推荐理由>,
      "entry_price": <入场价格, 数字或null>,
      "target_price": <目标价格, 数字或null>,
      "stop_loss": <止损价格, 数字或null>,
      "confidence": <"high" | "medium" | "low">
    }
  ],
  "risk_warnings": [<字符串数组, 风险提示>],
  "technical_analysis": {
    "trend_1h": <"up" | "down" | "sideways">,
    "trend_4h": <"up" | "down" | "sideways">,
    "trend_1d": <"up" | "down" | "sideways">,
    "support_levels": [<支撑位数组>],
    "resistance_levels": [<阻力位数组>],
    "key_observation": <技术面关键观察>
  }
}"""

SYSTEM_PROMPT = f"""你是一个专业的加密货币量化分析师。基于提供的市场数据进行综合分析，给出客观、有依据的判断和建议。

分析规则：
1. 所有判断必须基于提供的数据，不要编造数据
2. 特别关注永续合约数据：资金费率过高（>0.01%）暗示过度杠杆，多空比失衡暗示潜在反转
3. 结合恐惧贪婪指数判断市场情绪极端程度（<25 极度恐惧=潜在买入，>75 极度贪婪=潜在风险）
4. 风险提示要明确
5. 交易建议要具体、可执行
6. 使用中文回复
{_OUTPUT_SCHEMA_DESC}"""


SYMBOL_SYSTEM_PROMPT = f"""你是一个专业的加密货币量化分析师，专注于单币种深度分析。基于提供的多时间框架价格数据、技术指标、衍生品数据和相关新闻，对指定币种进行技术分析和交易建议。

分析规则：
1. 所有判断必须基于提供的数据和技术指标，不要编造数据
2. 结合多时间框架（1h/4h/1d）的技术指标进行趋势判断
3. 利用 RSI 判断超买超卖，MA 交叉判断趋势方向，MACD 判断动量变化，布林带判断波动率
4. 结合 ATR 给出合理的止损距离
5. 分析资金费率和多空比判断市场杠杆情绪（高资金费率 + 多头拥挤 = 潜在回调风险）
6. 结合恐惧贪婪指数评估市场情绪极端程度
7. 识别关键支撑位和阻力位，写入 technical_analysis 字段
8. 交易建议要具体、可执行，包含入场价、目标价和止损价
9. 风险提示要明确
10. 使用中文回复
{_OUTPUT_SCHEMA_DESC}"""


_INDICATOR_LEGEND = """技术指标说明：
- rsi_14/rsi_signal：RSI(14) 值及超买(>70)/超卖(<30)信号
- ma_7/ma_25/ma_50：简单移动平均线，ma_cross 为金叉/死叉信号
- macd/macd_signal/macd_histogram/macd_trend：MACD 指标及趋势方向
- bollinger_upper/middle/lower/pct：布林带及价格在带中的位置(0-1)
- atr_14：平均真实波幅，可用于评估止损距离
- volume_ratio：当前成交量/20 日均量比值"""


def _fmt(data: Any) -> str:
    """JSON-encode a snapshot fragment, with a friendly fallback."""
    if data in (None, [], {}, ""):
        return "暂无数据"
    return json.dumps(data, ensure_ascii=False, indent=2)


def build_market_prompt(snapshot: dict) -> str:
    """Build the user-side prompt for a market-wide analysis run."""
    return (
        "请基于以下市场数据进行综合分析：\n\n"
        f"## 市场概览\n{_fmt(snapshot.get('market_overview'))}\n\n"
        f"## 主要币种价格摘要 (24h)\n{_fmt(snapshot.get('price_summary'))}\n\n"
        f"## 永续合约数据（资金费率/持仓量/多空比）\n{_fmt(snapshot.get('futures_data'))}\n\n"
        f"## 市场恐惧贪婪指数\n{_fmt(snapshot.get('fear_greed'))}\n\n"
        f"## DEX 热门交易对\n{_fmt(snapshot.get('dex_top_pairs'))}\n\n"
        f"## DeFi 协议 TVL 排名\n{_fmt(snapshot.get('defi_top_protocols'))}\n\n"
        f"## 新闻信号（24h 加权）\n{_fmt(snapshot.get('news_signal'))}\n\n"
        f"## 最新新闻\n{_fmt(snapshot.get('recent_news'))}\n"
    )


def build_symbol_prompt(snapshot: dict) -> str:
    """Build the user-side prompt for a single-symbol deep dive."""
    symbol = snapshot.get("symbol", "UNKNOWN")
    return (
        f"请对 {symbol} 进行深度分析：\n\n"
        f"## 市场概览\n{_fmt(snapshot.get('market_overview'))}\n\n"
        f"## 永续合约数据\n{_fmt(snapshot.get('futures_data'))}\n\n"
        f"## 市场恐惧贪婪指数\n{_fmt(snapshot.get('fear_greed'))}\n\n"
        f"## 1 小时线摘要（最近 48 根 K 线）及技术指标\n{_fmt(snapshot.get('price_1h'))}\n\n"
        f"## 4 小时线摘要（最近 30 根 K 线）及技术指标\n{_fmt(snapshot.get('price_4h'))}\n\n"
        f"## 日线摘要（最近 30 根 K 线）及技术指标\n{_fmt(snapshot.get('price_1d'))}\n\n"
        f"{_INDICATOR_LEGEND}\n\n"
        f"## DEX 相关交易对\n{_fmt(snapshot.get('dex_pairs'))}\n\n"
        f"## 新闻信号（24h 加权）\n{_fmt(snapshot.get('news_signal'))}\n\n"
        f"## 相关新闻\n{_fmt(snapshot.get('recent_news'))}\n"
    )


# Backwards compat aliases so any callers outside the package keep working
# while we migrate. New code should import the build_*_prompt functions.
build_analysis_prompt = build_market_prompt
build_symbol_analysis_prompt = build_symbol_prompt
