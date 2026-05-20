"""News collector using RSS feeds."""

import asyncio
import logging
from datetime import UTC, datetime
from time import struct_time

import feedparser
import httpx
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.collectors.base import BaseCollector
from app.config import get_settings
from app.database import async_session
from app.models.news import NewsArticle

logger = logging.getLogger(__name__)


def _parse_rss_feeds() -> list[tuple[str, str]]:
    raw = get_settings().news_rss_feeds
    feeds = []
    for entry in raw.split(","):
        entry = entry.strip()
        if "|" in entry:
            name, url = entry.split("|", 1)
            feeds.append((name.strip(), url.strip()))
    return feeds


class NewsCollector(BaseCollector):
    def name(self) -> str:
        return "news"

    async def collect(self) -> dict:
        """Fetch news from RSS feeds concurrently."""
        settings = get_settings()
        rss_feeds = _parse_rss_feeds()

        async def _fetch_feed(
            client: httpx.AsyncClient, feed_name: str, feed_url: str
        ) -> list[dict]:
            articles = []
            try:
                resp = await client.get(feed_url)
                if resp.status_code == 200:
                    feed = feedparser.parse(resp.text)
                    for entry in feed.entries[:10]:
                        pub_raw = entry.get("published_parsed")
                        if isinstance(pub_raw, struct_time):
                            pub_dt = datetime(
                                pub_raw.tm_year,
                                pub_raw.tm_mon,
                                pub_raw.tm_mday,
                                pub_raw.tm_hour,
                                pub_raw.tm_min,
                                pub_raw.tm_sec,
                                tzinfo=UTC,
                            )
                        else:
                            pub_dt = datetime.now(UTC)

                        summary_raw = entry.get("summary")
                        summary_text = (
                            (summary_raw or "")[:500]
                            if isinstance(summary_raw, str)
                            else ""
                        )

                        articles.append(
                            {
                                "source": f"{feed_name}_rss",
                                "title": entry.get("title", ""),
                                "summary": summary_text,
                                "url": entry.get("link", ""),
                                "published_at": pub_dt.isoformat(),
                                "sentiment": None,
                            }
                        )
                    logger.debug(
                        "RSS %s: fetched %d entries", feed_name, len(feed.entries)
                    )
            except Exception:
                logger.warning("RSS feed %s failed", feed_name, exc_info=True)
            return articles

        all_articles = []
        async with httpx.AsyncClient(timeout=settings.http_timeout_default) as client:
            results = await asyncio.gather(
                *[_fetch_feed(client, name, url) for name, url in rss_feeds]
            )
            for articles in results:
                all_articles.extend(articles)

        return {"articles": all_articles}

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
