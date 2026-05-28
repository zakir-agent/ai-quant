"""Prompt templates for AI analysis.

The output contract is defined in ``app.analysis.schemas`` and enforced via
LiteLLM's ``response_format`` (see ``app.services.ai_client``). However, not
all providers support strict JSON schema mode, so the prompts also describe the
expected output structure inline as a fallback.
"""

from __future__ import annotations

import json
from typing import Any

PROMPT_VERSION = "v7"

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
      "confidence": <"high" | "medium" | "low">,
      "time_horizon": <"IMMEDIATE" | "INTRADAY" | "SWING" | "LONG_TERM", 可选>
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
6. 为每个 buy/sell 建议标注 time_horizon：IMMEDIATE（2h）、INTRADAY（8h）、SWING（48h）、LONG_TERM（168h）
7. 使用中文回复
{_OUTPUT_SCHEMA_DESC}"""


_SYMBOL_FEW_SHOT = """
示例：
输入指标概要：ETH/USDT 当前价格 3850, RSI_14=35（超卖）, MA7 上穿 MA25（金叉）, MACD histogram 转正, 布林带 pct=0.15（接近下轨）, ATR_14=85, 资金费率 0.003%（中性偏低）, 恐惧贪婪指数 28（恐惧）, 1h/4h/1d 趋势分别为 down/up/up, 支撑位 [3750, 3600], 阻力位 [3950, 4100]。

分析：RSI 进入超卖区且价格接近布林带下轨，MA 金叉确认短期反转信号，MACD 柱状图转正增强多头动量。4h 和 1d 趋势向上说明中期格局偏多，1h 下跌仅为短期回调。资金费率中性说明无过度杠杆风险，恐惧指数偏低提供情绪面安全边际。支撑位 3750 与当前 ATR 距离合理。

输出：
{"sentiment_score":45,"trend":"bullish","risk_level":"medium","summary":"ETH 处于短期回调中的技术性买入窗口。RSI 超卖叠加布林带下轨支撑，MA 金叉与 MACD 转正确认反弹信号。4h/1d 趋势向上，中期偏多格局未变。","key_observations":["RSI(14)=35 进入超卖区域","MA7 上穿 MA25 形成金叉","MACD 柱状图由负转正","恐惧贪婪指数 28 处于恐惧区间"],"recommendations":[{"symbol":"ETH/USDT","action":"buy","reason":"RSI 超卖+布林带下轨+MA 金叉三重共振，MACD 动量转正确认","entry_price":3850,"target_price":4100,"stop_loss":3700,"confidence":"high","time_horizon":"SWING"}],"risk_warnings":["若跌破 3750 支撑位可能下探 3600","整体市场情绪偏恐惧需关注系统性风险"],"technical_analysis":{"trend_1h":"down","trend_4h":"up","trend_1d":"up","support_levels":[3750,3600],"resistance_levels":[3950,4100],"key_observation":"短期回调但中长期趋势向上，关键支撑 3750"}}
"""


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
11. 为每个交易建议选择合适的时间跨度（time_horizon）：IMMEDIATE（立即，适用于突发信号）、INTRADAY（日内）、SWING（1-7天波段）、LONG_TERM（周/月级别）
{_OUTPUT_SCHEMA_DESC}

{_SYMBOL_FEW_SHOT}"""


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
