"""Prompt templates for AI analysis."""

PROMPT_VERSION = "v1"

SYSTEM_PROMPT = """你是一个专业的加密货币量化分析师。你的任务是基于提供的市场数据进行综合分析，给出客观、有依据的判断和建议。

分析规则：
1. 所有判断必须基于提供的数据，不要编造数据
2. 风险提示要明确
3. 交易建议要具体、可执行
4. 使用中文回复

你必须以 JSON 格式返回分析结果，严格遵循指定的 schema。"""

ANALYSIS_PROMPT_TEMPLATE = """请基于以下市场数据进行综合分析：

## 市场概览
{market_overview}

## 主要币种价格摘要 (24h)
{price_summary}

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
        dex_top_pairs=fmt(snapshot.get("dex_top_pairs", [])),
        defi_top_protocols=fmt(snapshot.get("defi_top_protocols", [])),
        recent_news=fmt(snapshot.get("recent_news", [])),
    )
