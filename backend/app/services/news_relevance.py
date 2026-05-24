"""Lightweight LLM relevance filtering for news articles."""

import json
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update

from app.config import get_settings
from app.database import async_session
from app.models.news import NewsArticle
from app.services.ai_client import ai_completion
from app.services.collector_health import record_failure, record_success

logger = logging.getLogger(__name__)

MAX_AGE_DAYS = 3

RELEVANCE_SYSTEM_PROMPT = """你是加密货币新闻相关性判断专家。判断每篇新闻是否与以下关注币种相关。

相关标准（满足任一即为 relevant）：
- 新闻主题围绕该币种的价格、技术、生态、链上数据
- 该币种是新闻事件的主要受影响方
- 直接提及该币种名称或 ticker
- 宏观/监管/ETF/交易所政策/大盘系统性风险，且合理影响关注列表中的任一币种

不相关标准：
- 仅在列表/举例中附带提及，非新闻主线
- 明确以其他加密项目为主体，与关注列表无关
- 纯娱乐、空投薅羊毛等与交易决策无关的内容

只返回 JSON，不要有其他文字。"""

RELEVANCE_PROMPT_TEMPLATE = """请判断以下新闻与 [{symbols}] 的相关性，返回 JSON 数组：

{news_list}

返回格式：
```json
[{{"id": <新闻ID>, "relevant": true/false}}]
```

请只返回 JSON，不要有其他文字。"""


def _resolve_model() -> str | None:
    """Resolve the lightweight model with fallback chain."""
    settings = get_settings()
    # Chain: lightweight → fallback → primary
    candidates = [
        settings.ai_lightweight_model,
        settings.ai_fallback_model,
        settings.ai_primary_model,
    ]
    for model in candidates:
        if model and model.strip():
            return model.strip()
    return None


def _parse_watchlist() -> list[str]:
    """Parse AI_ANALYSIS_SYMBOLS into normalized symbol list (e.g. BTC/USDT -> BTC)."""
    settings = get_settings()
    raw = settings.ai_analysis_symbols or ""
    symbols = [s.strip() for s in raw.split(",") if s.strip()]
    # Normalize: BTC/USDT -> BTC
    normalized = []
    for s in symbols:
        base = s.split("/")[0] if "/" in s else s
        if base:
            normalized.append(base.upper())
    return normalized


async def filter_relevant_news() -> int:
    """Filter news articles by relevance to watchlist using lightweight LLM.

    Returns the number of articles processed.
    """
    symbols = _parse_watchlist()
    cutoff = datetime.now(UTC) - timedelta(days=MAX_AGE_DAYS)
    batch_size = get_settings().news_sentiment_batch_size

    # If watchlist is empty, mark all pending as relevant (no LLM)
    if not symbols:
        async with async_session() as session:
            stmt = (
                update(NewsArticle)
                .where(NewsArticle.relevance.is_(None))
                .where(NewsArticle.published_at >= cutoff)
                .values(relevance="relevant")
            )
            result = await session.execute(stmt)
            await session.commit()
            count = result.rowcount
        if count:
            logger.info("Watchlist empty: marked %d articles as relevant", count)
        return count

    # Fetch pending articles
    async with async_session() as session:
        stmt = (
            select(NewsArticle)
            .where(NewsArticle.relevance.is_(None))
            .where(NewsArticle.published_at >= cutoff)
            .order_by(NewsArticle.published_at.desc())
            .limit(batch_size)
        )
        articles = (await session.execute(stmt)).scalars().all()

    if not articles:
        logger.debug("No news articles pending relevance filtering")
        return 0

    # Build prompt payload
    news_items = [
        {"id": a.id, "title": a.title, "summary": (a.summary or "")[:500]}
        for a in articles
    ]
    news_list = json.dumps(news_items, ensure_ascii=False, indent=2)
    symbols_str = ", ".join(symbols)
    prompt = RELEVANCE_PROMPT_TEMPLATE.format(symbols=symbols_str, news_list=news_list)

    # Call LLM with fallback chain
    model = _resolve_model()
    try:
        ai_result = await ai_completion(
            prompt=prompt,
            system=RELEVANCE_SYSTEM_PROMPT,
            model=model,
            temperature=0.1,
            max_tokens=1024,
        )
    except Exception:
        logger.exception("AI relevance filtering call failed")
        record_failure("news_relevance", "LLM call failed")
        return 0

    content = ai_result["content"]

    # Handle wrapped responses
    if isinstance(content, dict):
        for key in ("results", "relevances", "data", "articles"):
            if key in content and isinstance(content[key], list):
                content = content[key]
                break
        # Single relevance result — wrap in list
        if isinstance(content, dict) and "id" in content and "relevant" in content:
            content = [content]

    if not isinstance(content, list):
        logger.warning(
            "AI returned unexpected format for relevance filtering: %s — %s",
            type(content),
            str(content)[:200],
        )
        record_failure("news_relevance", "Unexpected response format")
        return 0

    # Parse results — default to relevant for safety
    valid_ids = {a.id for a in articles}
    relevant_ids: list[int] = []
    irrelevant_ids: list[int] = []

    for item in content:
        article_id = item.get("id")
        is_relevant = item.get("relevant", True)  # default True = safe
        if article_id not in valid_ids:
            continue
        if is_relevant:
            relevant_ids.append(article_id)
        else:
            irrelevant_ids.append(article_id)

    # Articles missing from LLM response default to relevant
    responded_ids = {item.get("id") for item in content if item.get("id") in valid_ids}
    for a in articles:
        if a.id not in responded_ids:
            relevant_ids.append(a.id)

    # Batch update DB
    processed = len(relevant_ids) + len(irrelevant_ids)
    if processed > 0:
        async with async_session() as session:
            if relevant_ids:
                stmt = (
                    update(NewsArticle)
                    .where(NewsArticle.id.in_(relevant_ids))
                    .values(relevance="relevant")
                )
                await session.execute(stmt)
            if irrelevant_ids:
                stmt = (
                    update(NewsArticle)
                    .where(NewsArticle.id.in_(irrelevant_ids))
                    .values(relevance="irrelevant")
                )
                await session.execute(stmt)
            await session.commit()

    cost = ai_result["usage"]["cost_usd"]
    logger.info(
        "Relevance filtering: %d total, %d relevant, %d irrelevant, cost=$%.4f",
        len(articles),
        len(relevant_ids),
        len(irrelevant_ids),
        cost,
    )
    record_success("news_relevance")
    return processed
