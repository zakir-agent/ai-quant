"""Prompt templates for AI analysis."""

PROMPT_VERSION = "v3"

SYSTEM_PROMPT = """你是一个专业的加密货币量化分析师。你的任务是基于提供的市场数据进行综合分析，给出客观、有依据的判断和建议。

分析规则：
1. 所有判断必须基于提供的数据，不要编造数据
2. 特别关注永续合约数据：资金费率过高(>0.01%)暗示过度杠杆，多空比失衡暗示潜在反转
3. 结合恐惧贪婪指数判断市场情绪极端程度（<25极度恐惧=潜在买入，>75极度贪婪=潜在风险）
4. 风险提示要明确
5. 交易建议要具体、可执行
6. 使用中文回复

你必须以 JSON 格式返回分析结果，严格遵循指定的 schema。"""

ANALYSIS_PROMPT_TEMPLATE = """请基于以下市场数据进行综合分析：

## 市场概览
{market_overview}

## 主要币种价格摘要 (24h)
{price_summary}

## 永续合约数据（资金费率/持仓量/多空比）
{futures_data}

## 市场恐惧贪婪指数
{fear_greed}

## DEX 热门交易对
{dex_top_pairs}

## DeFi 协议 TVL 排名
{defi_top_protocols}

## 最新新闻
{recent_news}

请以以下 JSON 格式返回分析结果：
```json
{{
  "sentiment_score": <-100到+100的整数, 负数看空, 正数看多>,
  "trend": "<bullish|bearish|neutral>",
  "risk_level": "<low|medium|high>",
  "summary": "<200字以内的市场整体分析摘要>",
  "key_observations": [
    "<关键观察1>",
    "<关键观察2>",
    "<关键观察3>"
  ],
  "recommendations": [
    {{
      "symbol": "<币种>",
      "action": "<buy|sell|hold|watch>",
      "reason": "<简要理由>",
      "target_price": <目标价格或null>,
      "stop_loss": <止损价格或null>,
      "confidence": "<high|medium|low>"
    }}
  ],
  "risk_warnings": [
    "<风险提示1>",
    "<风险提示2>"
  ]
}}
```

请只返回 JSON，不要有其他文字。"""


SYMBOL_SYSTEM_PROMPT = """你是一个专业的加密货币量化分析师，专注于单币种深度分析。你的任务是基于提供的多时间框架价格数据、技术指标、衍生品数据和相关新闻，对指定币种进行技术分析和交易建议。

分析规则：
1. 所有判断必须基于提供的数据和技术指标，不要编造数据
2. 结合多时间框架（1h/4h/1d）的技术指标进行趋势判断
3. 利用 RSI 判断超买超卖，MA 交叉判断趋势方向，MACD 判断动量变化，布林带判断波动率
4. 结合 ATR 给出合理的止损距离
5. 分析资金费率和多空比判断市场杠杆情绪（高资金费率+多头拥挤=潜在回调风险）
6. 结合恐惧贪婪指数评估市场情绪极端程度
7. 识别关键支撑位和阻力位
8. 交易建议要具体、可执行，包含入场价、目标价和止损价
9. 风险提示要明确
10. 使用中文回复

你必须以 JSON 格式返回分析结果，严格遵循指定的 schema。"""

SYMBOL_ANALYSIS_PROMPT_TEMPLATE = """请对 {symbol} 进行深度分析：

## 市场概览
{market_overview}

## 永续合约数据
{futures_data}

## 市场恐惧贪婪指数
{fear_greed}

## 1小时线摘要（最近48根K线）及技术指标
{price_1h}

## 4小时线摘要（最近30根K线）及技术指标
{price_4h}

## 日线摘要（最近30根K线）及技术指标
{price_1d}

技术指标说明：
- rsi_14/rsi_signal: RSI(14) 值及超买(>70)/超卖(<30)信号
- ma_7/ma_25/ma_50: 简单移动平均线，ma_cross 为金叉/死叉信号
- macd/macd_signal/macd_histogram/macd_trend: MACD 指标及趋势方向
- bollinger_upper/middle/lower/pct: 布林带及价格在带中的位置(0-1)
- atr_14: 平均真实波幅，可用于评估止损距离
- volume_ratio: 当前成交量/20日均量比值

## DEX 相关交易对
{dex_pairs}

## 相关新闻
{recent_news}

请以以下 JSON 格式返回分析结果：
```json
{{
  "sentiment_score": <-100到+100的整数, 负数看空, 正数看多>,
  "trend": "<bullish|bearish|neutral>",
  "risk_level": "<low|medium|high>",
  "summary": "<200字以内的该币种深度分析摘要>",
  "technical_analysis": {{
    "trend_1h": "<up|down|sideways>",
    "trend_4h": "<up|down|sideways>",
    "trend_1d": "<up|down|sideways>",
    "support_levels": [<支撑价位1>, <支撑价位2>],
    "resistance_levels": [<阻力价位1>, <阻力价位2>],
    "key_observation": "<关键技术面观察>"
  }},
  "key_observations": [
    "<关键观察1>",
    "<关键观察2>",
    "<关键观察3>"
  ],
  "recommendations": [
    {{
      "action": "<buy|sell|hold|watch>",
      "reason": "<简要理由>",
      "entry_price": <建议入场价格或null>,
      "target_price": <目标价格或null>,
      "stop_loss": <止损价格或null>,
      "confidence": "<high|medium|low>"
    }}
  ],
  "risk_warnings": [
    "<风险提示1>",
    "<风险提示2>"
  ]
}}
```

请只返回 JSON，不要有其他文字。"""


def build_symbol_analysis_prompt(snapshot: dict) -> str:
    """Build the analysis prompt for a single symbol from its snapshot."""
    import json

    def fmt(data, indent=2):
        if not data:
            return "暂无数据"
        return json.dumps(data, ensure_ascii=False, indent=indent)

    return SYMBOL_ANALYSIS_PROMPT_TEMPLATE.format(
        symbol=snapshot.get("symbol", "UNKNOWN"),
        market_overview=fmt(snapshot.get("market_overview")),
        futures_data=fmt(snapshot.get("futures_data")),
        fear_greed=fmt(snapshot.get("fear_greed")),
        price_1h=fmt(snapshot.get("price_1h")),
        price_4h=fmt(snapshot.get("price_4h")),
        price_1d=fmt(snapshot.get("price_1d")),
        dex_pairs=fmt(snapshot.get("dex_pairs")),
        recent_news=fmt(snapshot.get("recent_news")),
    )


def build_analysis_prompt(snapshot: dict) -> str:
    """Build the analysis prompt from a data snapshot."""
    import json

    def fmt(data, indent=2):
        if not data:
            return "暂无数据"
        return json.dumps(data, ensure_ascii=False, indent=indent)

    return ANALYSIS_PROMPT_TEMPLATE.format(
        market_overview=fmt(snapshot.get("market_overview", [])),
        price_summary=fmt(snapshot.get("price_summary", [])),
        futures_data=fmt(snapshot.get("futures_data", [])),
        fear_greed=fmt(snapshot.get("fear_greed")),
        dex_top_pairs=fmt(snapshot.get("dex_top_pairs", [])),
        defi_top_protocols=fmt(snapshot.get("defi_top_protocols", [])),
        recent_news=fmt(snapshot.get("recent_news", [])),
    )
