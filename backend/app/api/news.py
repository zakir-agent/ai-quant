from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.news import NewsArticle

router = APIRouter(prefix="/api/news", tags=["news"])


@router.get("/latest")
async def get_latest_news(
    source: str | None = Query(None, description="Filter by source"),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Get latest crypto news."""
    stmt = select(NewsArticle).order_by(NewsArticle.published_at.desc()).limit(limit)
    if source:
        stmt = stmt.where(NewsArticle.source == source)
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
