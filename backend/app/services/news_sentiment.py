"""Batch AI sentiment tagging for news articles with sentiment=NULL."""

import json
import logging

from sqlalchemy import select, update

from app.config import get_settings
from app.database import async_session
from app.models.news import NewsArticle
from app.services.ai_client import ai_completion

logger = logging.getLogger(__name__)

SENTIMENT_SYSTEM_PROMPT = """你是一个加密货币新闻情感分析专家。你的任务是对新闻标题进行情感分类。

规则：
1. 只返回 JSON，不要有其他文字
2. 情感分类只有三种：positive（利好）、negative（利空）、neutral（中性）
3. 从加密货币投资者的角度判断情感"""

SENTIMENT_PROMPT_TEMPLATE = """请对以下新闻标题进行情感分类，返回 JSON 数组：

{news_list}

返回格式：
```json
[
  {{"id": <新闻ID>, "sentiment": "<positive|negative|neutral>"}}
]
```

请只返回 JSON，不要有��他文字。"""


async def tag_pending_news() -> int:
    """Find news articles without sentiment and tag them via AI in batches.

    Returns the number of articles tagged.
    """
    settings = get_settings()
    batch_size = settings.news_sentiment_batch_size
    tagged_total = 0

    async with async_session() as session:
        # Find articles with no sentiment
        stmt = (
            select(NewsArticle)
            .where(NewsArticle.sentiment.is_(None))
            .order_by(NewsArticle.published_at.desc())
            .limit(batch_size)
        )
        result = await session.execute(stmt)
        articles = result.scalars().all()

    if not articles:
        logger.debug("No news articles pending sentiment tagging")
        return 0

    # Build prompt with article IDs and titles
    news_items = [{"id": a.id, "title": a.title} for a in articles]
    news_list = json.dumps(news_items, ensure_ascii=False, indent=2)
    prompt = SENTIMENT_PROMPT_TEMPLATE.format(news_list=news_list)

    try:
        ai_result = await ai_completion(
            prompt=prompt,
            system=SENTIMENT_SYSTEM_PROMPT,
            temperature=0.1,
            max_tokens=1024,
        )
    except Exception:
        logger.exception("AI sentiment tagging call failed")
        return 0

    content = ai_result["content"]

    # Handle wrapped responses (e.g. {"results": [...]})
    if isinstance(content, dict):
        for key in ("results", "sentiments", "data", "articles"):
            if key in content and isinstance(content[key], list):
                content = content[key]
                break

    if not isinstance(content, list):
        logger.warning(
            "AI returned unexpected format for sentiment tagging: %s — %s",
            type(content),
            str(content)[:200],
        )
        return 0

    # Update articles in DB
    valid_sentiments = {"positive", "negative", "neutral"}
    article_ids = {a.id for a in articles}

    async with async_session() as session:
        for item in content:
            article_id = item.get("id")
            sentiment = item.get("sentiment", "").lower().strip()
            if article_id not in article_ids or sentiment not in valid_sentiments:
                continue
            stmt = (
                update(NewsArticle)
                .where(NewsArticle.id == article_id)
                .values(sentiment=sentiment)
            )
            await session.execute(stmt)
            tagged_total += 1
        await session.commit()

    cost = ai_result["usage"]["cost_usd"]
    logger.info(
        f"Sentiment tagging: tagged {tagged_total}/{len(articles)} articles, "
        f"cost=${cost}"
    )
    return tagged_total
