"""News collector using CryptoPanic API and RSS feeds."""

import logging
from datetime import UTC, datetime

import feedparser
import httpx
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.collectors.base import BaseCollector
from app.config import get_settings
from app.database import async_session
from app.models.news import NewsArticle

logger = logging.getLogger(__name__)

CRYPTOPANIC_BASE = "https://cryptopanic.com/api/free/v1/posts/"

RSS_FEEDS = [
    ("coindesk", "https://www.coindesk.com/arc/outboundfeeds/rss/"),
    ("cointelegraph", "https://cointelegraph.com/rss"),
    ("theblock", "https://www.theblock.co/rss.xml"),
]


class NewsCollector(BaseCollector):
    name = "news"

    async def collect(self) -> dict:
        """Fetch news from CryptoPanic API and RSS feeds."""
        articles = []

        # 1. CryptoPanic API
        settings = get_settings()
        if settings.cryptopanic_api_key:
            try:
                async with httpx.AsyncClient(timeout=15) as client:
                    resp = await client.get(
                        CRYPTOPANIC_BASE,
                        params={
                            "auth_token": settings.cryptopanic_api_key,
                            "filter": "important",
                            "kind": "news",
                        },
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        for post in data.get("results", [])[:20]:
                            articles.append(
                                {
                                    "source": "cryptopanic",
                                    "title": post.get("title", ""),
                                    "summary": post.get(
                                        "title", ""
                                    ),  # CryptoPanic free tier has no body
                                    "url": post.get("url", ""),
                                    "published_at": post.get("published_at", ""),
                                    "sentiment": self._map_cryptopanic_sentiment(
                                        post.get("votes", {})
                                    ),
                                }
                            )
                        logger.info(
                            f"CryptoPanic: fetched {len(data.get('results', []))} articles"
                        )
            except Exception:
                logger.warning("CryptoPanic API failed", exc_info=True)
        else:
            logger.info("CryptoPanic API key not set, skipping")

        # 2. RSS Feeds
        async with httpx.AsyncClient(timeout=15) as client:
            for feed_name, feed_url in RSS_FEEDS:
                try:
                    resp = await client.get(feed_url)
                    if resp.status_code == 200:
                        feed = feedparser.parse(resp.text)
                        for entry in feed.entries[:10]:
                            pub_date = entry.get("published_parsed")
                            if pub_date:
                                pub_dt = datetime(*pub_date[:6], tzinfo=UTC)
                            else:
                                pub_dt = datetime.now(UTC)

                            articles.append(
                                {
                                    "source": f"{feed_name}_rss",
                                    "title": entry.get("title", ""),
                                    "summary": entry.get("summary", "")[:500]
                                    if entry.get("summary")
                                    else "",
                                    "url": entry.get("link", ""),
                                    "published_at": pub_dt.isoformat(),
                                    "sentiment": None,  # Will be filled by AI later
                                }
                            )
                        logger.debug(
                            f"RSS {feed_name}: fetched {len(feed.entries)} entries"
                        )
                except Exception:
                    logger.warning(f"RSS feed {feed_name} failed", exc_info=True)

        return {"articles": articles}

    async def transform(self, raw_data: dict) -> list[dict]:
        """Transform raw articles into DB-ready dicts."""
        articles = raw_data.get("articles", [])
        records = []
        seen_urls = set()
        now = datetime.now(UTC)

        for a in articles:
            url = a.get("url", "").strip()
            if not url or url in seen_urls:
                continue
            seen_urls.add(url)

            pub_at = a.get("published_at")
            if isinstance(pub_at, str) and pub_at:
                try:
                    pub_dt = datetime.fromisoformat(pub_at.replace("Z", "+00:00"))
                except ValueError:
                    pub_dt = now
            else:
                pub_dt = now

            records.append(
                {
                    "source": a.get("source", "unknown"),
                    "title": a.get("title", "")[:512],
                    "summary": a.get("summary", "")[:2000]
                    if a.get("summary")
                    else None,
                    "url": url[:1024],
                    "sentiment": a.get("sentiment"),
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
                    "sentiment": stmt.excluded.sentiment,
                    "collected_at": stmt.excluded.collected_at,
                },
            )
            await session.execute(stmt)
            await session.commit()
        return len(records)

    @staticmethod
    def _map_cryptopanic_sentiment(votes: dict) -> str | None:
        """Map CryptoPanic community votes to sentiment."""
        positive = votes.get("positive", 0) or 0
        negative = votes.get("negative", 0) or 0
        if positive > negative:
            return "positive"
        elif negative > positive:
            return "negative"
        elif positive > 0:
            return "neutral"
        return None
