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
# - rss:       source 以 "_rss" 结尾（cointelegraph_rss / coindesk_rss / ...）
# - newsapi:   source 以 "newsapi_" 开头（newsapi_coindesk / newsapi_bloomberg / ...）
# - all:       不过滤
SOURCE_GROUPS = {"all", "rss", "newsapi"}


@router.get("/latest")
async def get_latest_news(
    source: str | None = Query(None, description="Filter by exact source string"),
    source_group: str = Query(
        "all",
        description="Filter by source group: all | rss | newsapi",
    ),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Get latest crypto news, optionally filtered by source or source_group."""
    if source_group not in SOURCE_GROUPS:
        source_group = "all"

    # Build filters
    filters = []
    if source:
        filters.append(NewsArticle.source == source)
    elif source_group == "rss":
        filters.append(NewsArticle.source.like("%_rss"))
        filters.append(~NewsArticle.source.like("newsapi_%"))
    elif source_group == "newsapi":
        filters.append(NewsArticle.source.like("newsapi_%"))

    # Total count for pagination
    count_stmt = select(func.count(NewsArticle.id))
    for f in filters:
        count_stmt = count_stmt.where(f)
    total = (await db.execute(count_stmt)).scalar() or 0

    # Fetch articles with analysis
    stmt = (
        select(NewsArticle, NewsAnalysis)
        .outerjoin(
            NewsAnalysis,
            (NewsAnalysis.news_id == NewsArticle.id)
            & (NewsAnalysis.prompt_version == NEWS_PROMPT_VERSION),
        )
        .order_by(NewsArticle.published_at.desc())
        .limit(limit)
        .offset(offset)
    )
    for f in filters:
        stmt = stmt.where(f)

    result = await db.execute(stmt)
    rows = result.all()
    return {
        "total": total,
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
        ],
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


@router.get("/signals")
async def get_asset_signals(
    hours: int = Query(24, ge=1, le=168),
    limit: int = Query(8, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
):
    """Per-asset aggregated directional signal for the dashboard signal bar."""
    cutoff = datetime.now(UTC) - timedelta(hours=hours)
    weighted = NewsAnalysis.direction * NewsAnalysis.magnitude * NewsAnalysis.confidence

    stmt = (
        select(
            NewsAnalysis.primary_asset.label("asset"),
            NewsAnalysis.direction,
            func.count(NewsAnalysis.id).label("event_count"),
            func.sum(weighted).label("weighted_score"),
            func.avg(NewsAnalysis.intensity).label("avg_intensity"),
        )
        .where(NewsAnalysis.created_at >= cutoff)
        .where(NewsAnalysis.status == "done")
        .where(NewsAnalysis.primary_asset.isnot(None))
        .group_by(NewsAnalysis.primary_asset, NewsAnalysis.direction)
    )
    rows = (await db.execute(stmt)).all()

    # Aggregate by asset: sum weighted_score, take net direction sign, total events
    assets: dict[str, dict] = {}
    for r in rows:
        if r.asset is None:
            continue
        key = r.asset.upper()
        if key not in assets:
            assets[key] = {
                "asset": key,
                "weighted_score": 0.0,
                "event_count": 0,
                "avg_intensity_sum": 0.0,
                "avg_intensity_count": 0,
            }
        a = assets[key]
        a["weighted_score"] += float(r.weighted_score or 0)
        a["event_count"] += r.event_count
        a["avg_intensity_sum"] += float(r.avg_intensity or 0) * r.event_count
        a["avg_intensity_count"] += r.event_count

    # Compute final values and sort by absolute weighted_score descending
    signals = []
    for a in assets.values():
        ws = a["weighted_score"]
        ec = a["event_count"]
        avg_ws = round(ws / ec, 1) if ec > 0 else 0
        net_direction = 1 if ws > 0 else (-1 if ws < 0 else 0)
        if net_direction == 1:
            direction_str = "bullish"
        elif net_direction == -1:
            direction_str = "bearish"
        else:
            direction_str = "neutral"
        if ec >= 10:
            confidence = "high"
        elif ec >= 5:
            confidence = "medium"
        else:
            confidence = "low"
        signals.append(
            {
                "asset": a["asset"],
                "direction": net_direction,
                "event_count": ec,
                "weighted_score": round(ws, 2),
                "avg_intensity": round(
                    a["avg_intensity_sum"] / a["avg_intensity_count"]
                    if a["avg_intensity_count"]
                    else 0,
                    1,
                ),
                "avg_weighted_score": avg_ws,
                "direction_str": direction_str,
                "confidence": confidence,
            }
        )
    signals.sort(key=lambda s: abs(s["weighted_score"]), reverse=True)
    return {"hours": hours, "signals": signals[:limit]}


@router.get("/signals/trend")
async def get_signal_trend(
    granularity: str = Query("daily", pattern="^(hourly|daily)$"),
    days: int = Query(30, ge=1, le=90),
    symbols: str | None = Query(None),
    limit: int = Query(5, ge=1, le=10),
    db: AsyncSession = Depends(get_db),
):
    """Time-series trend data for news signal strength per asset."""
    if granularity == "hourly" and days > 2:
        days = 2

    cutoff = datetime.now(UTC) - timedelta(days=days)

    symbol_list: list[str] | None = None
    if symbols:
        symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]

    if granularity == "hourly":
        time_trunc = func.date_trunc("hour", NewsAnalysis.created_at)
    else:
        time_trunc = func.date_trunc("day", NewsAnalysis.created_at)

    weighted = NewsAnalysis.direction * NewsAnalysis.magnitude * NewsAnalysis.confidence

    stmt = (
        select(
            NewsAnalysis.primary_asset.label("asset"),
            time_trunc.label("time_bucket"),
            func.avg(weighted).label("avg_weighted"),
            func.count(NewsAnalysis.id).label("event_count"),
        )
        .where(NewsAnalysis.created_at >= cutoff)
        .where(NewsAnalysis.status == "done")
        .where(NewsAnalysis.primary_asset.isnot(None))
    )
    if symbol_list:
        stmt = stmt.where(NewsAnalysis.primary_asset.in_(symbol_list))

    stmt = stmt.group_by(NewsAnalysis.primary_asset, time_trunc).order_by(time_trunc)
    rows = (await db.execute(stmt)).all()

    # Group by asset
    asset_data: dict[str, list] = {}
    asset_signed_sum: dict[str, float] = {}
    for r in rows:
        key = r.asset.upper()
        if key not in asset_data:
            asset_data[key] = []
            asset_signed_sum[key] = 0.0
        ws = float(r.avg_weighted or 0)
        ec = r.event_count
        if ws > 0:
            d_str = "bullish"
        elif ws < 0:
            d_str = "bearish"
        else:
            d_str = "neutral"
        asset_signed_sum[key] += ws * ec
        asset_data[key].append(
            {
                "time": r.time_bucket.isoformat() if r.time_bucket else None,
                "avg_score": round(abs(ws), 1),
                "event_count": ec,
                "direction": d_str,
            }
        )

    # If no symbols specified, pick top N by total event count
    if not symbol_list:
        sorted_assets = sorted(
            asset_data.keys(),
            key=lambda a: sum(d["event_count"] for d in asset_data[a]),
            reverse=True,
        )[:limit]
    else:
        sorted_assets = list(asset_data.keys())[:limit]

    result_symbols = []
    for asset in sorted_assets:
        points = asset_data.get(asset, [])
        total_ec = sum(p["event_count"] for p in points)
        avg_ws_all = (
            round(sum(p["avg_score"] for p in points) / len(points), 1) if points else 0
        )
        signed_sum = asset_signed_sum.get(asset, 0.0)
        if signed_sum > 0:
            net_d = "bullish"
        elif signed_sum < 0:
            net_d = "bearish"
        else:
            net_d = "neutral"
        if total_ec >= 10:
            conf = "high"
        elif total_ec >= 5:
            conf = "medium"
        else:
            conf = "low"
        result_symbols.append(
            {
                "symbol": asset,
                "direction": net_d,
                "avg_weighted_score": avg_ws_all,
                "event_count": total_ec,
                "confidence": conf,
                "trend": points,
            }
        )

    start_date = (datetime.now(UTC) - timedelta(days=days)).strftime("%Y-%m-%d")
    end_date = datetime.now(UTC).strftime("%Y-%m-%d")

    return {
        "granularity": granularity,
        "time_range": {"start": start_date, "end": end_date},
        "symbols": result_symbols,
    }


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
