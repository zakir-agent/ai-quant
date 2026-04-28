from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.news import NewsArticle

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

    stmt = select(NewsArticle).order_by(NewsArticle.published_at.desc()).limit(limit)
    if source:
        stmt = stmt.where(NewsArticle.source == source)
    elif source_group == "coingecko":
        stmt = stmt.where(NewsArticle.source == "coingecko_news")
    elif source_group == "rss":
        # 兜底排除 newsapi_* 命名冲突（当前不会出现，但显式排除一次更稳）
        stmt = stmt.where(
            NewsArticle.source.like("%_rss"),
            ~NewsArticle.source.like("newsapi_%"),
        )
    elif source_group == "newsapi":
        stmt = stmt.where(NewsArticle.source.like("newsapi_%"))

    result = await db.execute(stmt)
    rows = result.scalars().all()
    return {
        "articles": [
            {
                "id": r.id,
                "source": r.source,
                "title": r.title,
                "summary": r.summary,
                "url": r.url,
                "sentiment": r.sentiment,
                "published_at": r.published_at.isoformat(),
            }
            for r in rows
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
