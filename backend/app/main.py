import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import analysis, backtest, market, news, settings, ws
from app.config import get_settings

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)-5s %(name)s - %(message)s",
)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("apscheduler").setLevel(logging.WARNING)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(application: FastAPI):
    # Start scheduler
    from app.scheduler.jobs import start_scheduler, stop_scheduler

    start_scheduler()

    async def warm_market_overview() -> None:
        # Interval jobs do not run until the first interval elapses; warm cache at startup.
        from app.api.market import ensure_market_overview_cached

        try:
            await ensure_market_overview_cached()
        except Exception:
            logger.exception("Startup market overview warmup failed")

    asyncio.create_task(warm_market_overview())

    # Start Binance WebSocket bridge for real-time data
    from app.services.ws_manager import binance_bridge

    binance_bridge.start()

    yield

    binance_bridge.stop()
    stop_scheduler()

    # Close shared Redis connection if active
    from app.services.cache import close_redis

    await close_redis()


app = FastAPI(
    title="AI Quant Analysis System",
    description="AI-powered blockchain quantitative analysis",
    version="0.1.0",
    lifespan=lifespan,
)

_settings = get_settings()
_cors_origins = [o.strip() for o in _settings.cors_origins.split(",") if o.strip()]
# 放宽常见私网 Origin，避免用局域网 IP 打开前端时 CORS 仅允许 localhost
_cors_lan_regex = (
    r"^https?://("
    r"localhost|127\.0\.0\.1|"
    r"192\.168\.\d{1,3}\.\d{1,3}|"
    r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
    r"172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}"
    r")(:\d+)?$"
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=_cors_lan_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    """Health check endpoint (no auth required)."""
    checks = {"api": "ok", "database": "unknown", "cache": "unknown"}

    try:
        from sqlalchemy import text

        from app.database import async_session

        async with async_session() as session:
            await session.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as e:
        checks["database"] = f"error: {e}"

    try:
        from app.services.cache import cache_ping

        await cache_ping()
        checks["cache"] = "ok" if _settings.redis_url else "ok (memory)"
    except Exception as e:
        checks["cache"] = f"error: {e}"

    overall = "ok" if all("ok" in v for v in checks.values()) else "degraded"
    return {"status": overall, "checks": checks}


app.include_router(market.router)
app.include_router(analysis.router)
app.include_router(news.router)
app.include_router(ws.router)
app.include_router(backtest.router)
app.include_router(settings.router)
