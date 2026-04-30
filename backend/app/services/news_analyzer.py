"""Per-article structured AI analysis pipeline.

For every news article we haven't analyzed under the current
``NEWS_PROMPT_VERSION`` we run a fast-model batched LLM call and persist
the structured tags to ``news_analysis``.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from pydantic import ValidationError
from sqlalchemy import exists, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.analysis.news_prompts import NEWS_SYSTEM_PROMPT, build_news_batch_prompt
from app.analysis.news_schemas import (
    NEWS_PROMPT_VERSION,
    NewsAnalysisBatchOutput,
    NewsAnalysisOutput,
    news_batch_json_schema,
)
from app.config import get_settings
from app.database import async_session
from app.models.news import NewsArticle
from app.models.news_analysis import NewsAnalysis
from app.services.ai_client import AIError, ai_completion

logger = logging.getLogger(__name__)

MAX_AGE_DAYS = 3


async def analyze_pending_news() -> dict:
    """Analyze a single batch of pending articles. Returns counts dict."""
    settings = get_settings()
    batch_size = settings.news_sentiment_batch_size
    cutoff = datetime.now(UTC) - timedelta(days=MAX_AGE_DAYS)

    async with async_session() as session:
        existing = (
            select(NewsAnalysis.news_id)
            .where(NewsAnalysis.prompt_version == NEWS_PROMPT_VERSION)
            .where(NewsAnalysis.news_id == NewsArticle.id)
        )
        stmt = (
            select(NewsArticle)
            .where(NewsArticle.published_at >= cutoff)
            .where(~exists(existing))
            .order_by(NewsArticle.published_at.desc())
            .limit(batch_size)
        )
        articles = (await session.execute(stmt)).scalars().all()

    if not articles:
        return {"processed": 0, "succeeded": 0, "failed": 0}

    payload = [
        {
            "id": a.id,
            "source": a.source,
            "title": a.title,
            "summary": (a.summary or "")[:500],
            "published_at": a.published_at.isoformat() if a.published_at else None,
        }
        for a in articles
    ]
    prompt = build_news_batch_prompt(payload)

    try:
        ai_result = await ai_completion(
            prompt=prompt,
            system=NEWS_SYSTEM_PROMPT,
            model=settings.ai_fast_model,
            temperature=0.1,
            max_tokens=4096,
            json_schema=news_batch_json_schema(),
        )
    except AIError as e:
        logger.exception("News analyzer AI call failed: %s", e)
        return {"processed": 0, "succeeded": 0, "failed": 0}

    content = ai_result["content"]
    used_model = ai_result["model"]

    try:
        batch = NewsAnalysisBatchOutput.model_validate(content)
    except ValidationError:
        logger.warning(
            "News analyzer batch failed schema validation; writing failed rows"
        )
        await _persist_all_failed(articles, used_model, str(content)[:500])
        return {"processed": len(articles), "succeeded": 0, "failed": len(articles)}

    by_id = {item.news_id: item for item in batch.results}

    succeeded = 0
    failed = 0
    async with async_session() as session:
        for article in articles:
            item = by_id.get(article.id)
            if item is None:
                await _insert_failed(
                    session, article.id, used_model, "missing_in_batch"
                )
                failed += 1
                continue
            await _insert_done(session, item, used_model)
            succeeded += 1
        await session.commit()

    logger.info(
        "News analysis batch: processed=%s succeeded=%s failed=%s cost=$%s",
        len(articles),
        succeeded,
        failed,
        ai_result["usage"]["cost_usd"],
    )
    return {"processed": len(articles), "succeeded": succeeded, "failed": failed}


async def _insert_done(session, item: NewsAnalysisOutput, model_used: str) -> None:
    values = {
        "news_id": item.news_id,
        "prompt_version": NEWS_PROMPT_VERSION,
        "model_used": model_used,
        "status": "done",
        "is_actionable": item.is_actionable,
        "primary_asset": item.primary_asset(),
        "assets": [a.model_dump() for a in item.assets],
        "direction": item.direction,
        "magnitude": item.magnitude,
        "confidence": item.confidence,
        "confidence_reason": item.confidence_reason,
        "event_type": item.event_type,
        "time_horizon": item.time_horizon,
        "intensity": item.intensity,
        "relevance_score": item.relevance_score,
        "tags": item.tags,
        "raw_quote": item.raw_quote,
        "summary_zh": item.summary_zh,
        "raw_output": item.model_dump(),
    }
    stmt = (
        pg_insert(NewsAnalysis)
        .values(**values)
        .on_conflict_do_nothing(index_elements=["news_id", "prompt_version"])
    )
    await session.execute(stmt)


async def _insert_failed(session, news_id: int, model_used: str, error: str) -> None:
    stmt = (
        pg_insert(NewsAnalysis)
        .values(
            news_id=news_id,
            prompt_version=NEWS_PROMPT_VERSION,
            model_used=model_used,
            status="failed",
            error=error,
        )
        .on_conflict_do_nothing(index_elements=["news_id", "prompt_version"])
    )
    await session.execute(stmt)


async def _persist_all_failed(articles, model_used: str, error: str) -> None:
    async with async_session() as session:
        for a in articles:
            await _insert_failed(session, a.id, model_used, error)
        await session.commit()
