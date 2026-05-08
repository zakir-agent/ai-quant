"""NewsAPI.org collector — mainstream financial media for sentiment analysis.

Free tier limits (developer plan):
- 100 requests/day
- Articles delayed by ~24 hours

Used as a slow, broad sentiment source complementing the realtime
CoinGecko/RSS pipeline. Scheduled at hour-level intervals so the daily
quota is never exhausted.
"""

import logging
from datetime import UTC, datetime, timedelta

import httpx
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.collectors.base import BaseCollector
from app.config import get_settings
from app.database import async_session
from app.models.news import NewsArticle

logger = logging.getLogger(__name__)

NEWSAPI_ENDPOINT = "https://newsapi.org/v2/everything"
SOURCE_PREFIX = "newsapi"


class NewsAPICollector(BaseCollector):
    def name(self) -> str:
        return "newsapi"

    async def collect(self) -> dict:
        """Fetch crypto-related articles from NewsAPI everything endpoint.

        Returns an empty payload (no exception) when the API key is missing,
        so the pipeline can be safely scheduled even before the user
        configures NEWSAPI_KEY.
        """
        settings = get_settings()
        if not settings.newsapi_enabled:
            logger.info("NewsAPI collector disabled by config, skipping collection")
            return {"articles": []}

        api_key = settings.newsapi_key.strip()
        if not api_key:
            logger.info("NewsAPI key not configured, skipping collection")
            return {"articles": []}

        # Free tier serves articles delayed ~24h; pull a 48h window from the
        # delay edge to catch any items that surfaced late.
        now = datetime.now(UTC)
        from_dt = now - timedelta(hours=72)
        to_dt = now - timedelta(hours=24)

        params = {
            "q": settings.newsapi_query,
            "language": settings.newsapi_language,
            "sortBy": "publishedAt",
            "pageSize": 100,
            "from": from_dt.strftime("%Y-%m-%dT%H:%M:%S"),
            "to": to_dt.strftime("%Y-%m-%dT%H:%M:%S"),
            "apiKey": api_key,
        }

        try:
            async with httpx.AsyncClient(
                timeout=settings.http_timeout_default
            ) as client:
                resp = await client.get(NEWSAPI_ENDPOINT, params=params)
        except httpx.HTTPError:
            logger.warning("NewsAPI request failed", exc_info=True)
            return {"articles": []}

        if resp.status_code == 429:
            logger.warning("NewsAPI quota exhausted (429), skipping")
            return {"articles": []}
        if resp.status_code == 401:
            logger.error("NewsAPI key rejected (401), check NEWSAPI_KEY")
            return {"articles": []}
        if resp.status_code != 200:
            logger.warning(
                "NewsAPI returned non-200: status=%s body=%s",
                resp.status_code,
                resp.text[:300],
            )
            return {"articles": []}

        data = resp.json()
        if data.get("status") != "ok":
            logger.warning(
                "NewsAPI returned error status: %s — %s",
                data.get("status"),
                data.get("message", "")[:200],
            )
            return {"articles": []}

        articles = data.get("articles", []) or []
        logger.info(
            "NewsAPI: fetched %s articles (totalResults=%s)",
            len(articles),
            data.get("totalResults"),
        )
        return {"articles": articles}

    async def transform(self, raw_data: dict) -> list[dict]:
        """Normalize NewsAPI articles into NewsArticle records.

        Sentiment is left as None; the existing tag_pending_news job
        will pick these up in the next batch.
        """
        articles = raw_data.get("articles", [])
        records: list[dict] = []
        seen_urls: set[str] = set()
        now = datetime.now(UTC)

        for item in articles:
            url = (item.get("url") or "").strip()
            title = (item.get("title") or "").strip()
            if not url or not title or url in seen_urls:
                continue
            seen_urls.add(url)

            # NewsAPI sometimes marks removed articles with "[Removed]"
            if title == "[Removed]":
                continue

            pub_raw = item.get("publishedAt")
            pub_dt = now
            if isinstance(pub_raw, str) and pub_raw:
                try:
                    pub_dt = datetime.fromisoformat(pub_raw.replace("Z", "+00:00"))
                except ValueError:
                    pub_dt = now

            source_obj = item.get("source") or {}
            source_id = source_obj.get("id") or source_obj.get("name") or "unknown"
            source_id = str(source_id).lower().replace(" ", "_")[:48]

            description = item.get("description") or ""
            content = item.get("content") or ""
            summary = (description or content)[:2000] or None

            records.append(
                {
                    "source": f"{SOURCE_PREFIX}_{source_id}"[:64],
                    "title": title[:512],
                    "summary": summary,
                    "url": url[:1024],
                    "sentiment": None,
                    "published_at": pub_dt,
                    "collected_at": now,
                }
            )
        return records

    async def store(self, records: list[dict]) -> int:
        if not records:
            return 0
        async with async_session() as session:
            stmt = pg_insert(NewsArticle).values(records)
            stmt = stmt.on_conflict_do_update(
                constraint="uq_news_url",
                set_={
                    "title": stmt.excluded.title,
                    "summary": stmt.excluded.summary,
                    "collected_at": stmt.excluded.collected_at,
                },
            )
            await session.execute(stmt)
            await session.commit()
        return len(records)
