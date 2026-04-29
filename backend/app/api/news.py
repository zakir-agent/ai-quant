from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.analysis.news_schemas import NEWS_PROMPT_VERSION
from app.database import get_db
from app.models.news import NewsArticle
from app.models.news_analysis import NewsAnalysis

router = APIRouter(prefix="/api/news", tags=["news"])


# 前端 4-Tab 分组 → DB 端 source 字段匹配规则
# - coingecko: source 等于 "coingecko_news"
# - rss:       source 以 "_rss" 结尾（cointelegraph_rss / coindesk_rss / ...）
# - newsapi:   source 以 "newsapi_" 开头（newsapi_coindesk / newsapi_bloomberg / ...）
# - all:       不过滤
SOURCE_GROUPS = {"all", "coingecko", "rss", "newsapi"}


@router.get("/latest")
async def get_latest_news(
    source: str | None = Query(None, description="Filter by exact source string"),
    source_group: str = Query(
        "all",
        description="Filter by source group: all | coingecko | rss | newsapi",
    ),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Get latest crypto news, optionally filtered by source or source_group."""
    if source_group not in SOURCE_GROUPS:
        source_group = "all"

    stmt = (
        select(NewsArticle, NewsAnalysis)
        .outerjoin(
            NewsAnalysis,
            (NewsAnalysis.news_id == NewsArticle.id)
            & (NewsAnalysis.prompt_version == NEWS_PROMPT_VERSION),
        )
        .order_by(NewsArticle.published_at.desc())
        .limit(limit)
    )
    if source:
        stmt = stmt.where(NewsArticle.source == source)
    elif source_group == "coingecko":
        stmt = stmt.where(NewsArticle.source == "coingecko_news")
    elif source_group == "rss":
        stmt = stmt.where(
            NewsArticle.source.like("%_rss"),
            ~NewsArticle.source.like("newsapi_%"),
        )
    elif source_group == "newsapi":
        stmt = stmt.where(NewsArticle.source.like("newsapi_%"))

    result = await db.execute(stmt)
    rows = result.all()
    return {
        "articles": [
            {
                "id": article.id,
                "source": article.source,
                "title": article.title,
                "summary": article.summary,
                "url": article.url,
                "sentiment": article.sentiment,
                "published_at": article.published_at.isoformat(),
                "analysis": _na_brief(na) if na else None,
            }
            for article, na in rows
        ]
    }


@router.post("/collect")
async def trigger_news_collection():
    """Manually trigger news collection."""
    from app.collectors.news import NewsCollector

    collector = NewsCollector()
    count = await collector.run()
    return {"status": "ok", "records": count}


@router.post("/tag-sentiment")
async def trigger_sentiment_tagging():
    """Manually trigger AI sentiment tagging for untagged news."""
    from app.services.news_sentiment import tag_pending_news

    tagged = await tag_pending_news()
    return {"status": "ok", "tagged": tagged}


@router.get("/aggregate")
async def aggregate_news_signal(
    asset: str | None = Query(None),
    hours: int = Query(24, ge=1, le=168),
    db: AsyncSession = Depends(get_db),
):
    """Confidence-weighted directional signal per (asset, event_type)."""
    cutoff = datetime.now(UTC) - timedelta(hours=hours)
    weighted = NewsAnalysis.direction * NewsAnalysis.magnitude * NewsAnalysis.confidence

    stmt = (
        select(
            NewsAnalysis.primary_asset.label("asset"),
            NewsAnalysis.event_type,
            func.count(NewsAnalysis.id).label("count"),
            func.sum(weighted).label("weighted_score"),
            func.avg(NewsAnalysis.intensity).label("avg_intensity"),
            func.avg(NewsAnalysis.confidence).label("avg_confidence"),
        )
        .where(NewsAnalysis.created_at >= cutoff)
        .where(NewsAnalysis.status == "done")
        .group_by(NewsAnalysis.primary_asset, NewsAnalysis.event_type)
    )
    if asset:
        stmt = stmt.where(NewsAnalysis.primary_asset == asset.upper())

    rows = (await db.execute(stmt)).all()
    return {
        "hours": hours,
        "asset": asset,
        "buckets": [
            {
                "asset": r.asset,
                "event_type": r.event_type,
                "count": r.count,
                "weighted_score": float(r.weighted_score or 0),
                "avg_intensity": float(r.avg_intensity or 0),
                "avg_confidence": float(r.avg_confidence or 0),
            }
            for r in rows
            if r.asset is not None
        ],
    }


@router.get("/{news_id}/analysis")
async def get_news_analysis(news_id: int, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(NewsAnalysis)
        .where(
            NewsAnalysis.news_id == news_id,
            NewsAnalysis.prompt_version == NEWS_PROMPT_VERSION,
        )
        .limit(1)
    )
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row is None:
        return {"analysis": None}
    return {"analysis": _na_to_dict(row)}


@router.post("/analyze")
async def trigger_news_analyzer():
    from app.services.news_analyzer import analyze_pending_news

    return await analyze_pending_news()


def _na_brief(r: NewsAnalysis) -> dict:
    """Lightweight analysis summary attached to each news article in the list."""
    return {
        "direction": r.direction,
        "event_type": r.event_type,
        "time_horizon": r.time_horizon,
        "intensity": r.intensity,
        "summary_zh": r.summary_zh,
    }


def _na_to_dict(r: NewsAnalysis) -> dict:
    return {
        "id": r.id,
        "news_id": r.news_id,
        "status": r.status,
        "is_actionable": r.is_actionable,
        "primary_asset": r.primary_asset,
        "assets": r.assets,
        "direction": r.direction,
        "magnitude": r.magnitude,
        "confidence": r.confidence,
        "confidence_reason": r.confidence_reason,
        "event_type": r.event_type,
        "time_horizon": r.time_horizon,
        "intensity": r.intensity,
        "relevance_score": r.relevance_score,
        "tags": r.tags,
        "raw_quote": r.raw_quote,
        "summary_zh": r.summary_zh,
        "model_used": r.model_used,
        "prompt_version": r.prompt_version,
        "accuracy": r.accuracy,
        "created_at": r.created_at.isoformat(),
    }
