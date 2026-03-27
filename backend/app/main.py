from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, HTTPException, Security
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import APIKeyHeader

from app.config import get_settings, Settings
from app.api import market, analysis, news, settings

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


@asynccontextmanager
async def lifespan(application: FastAPI):
    s = get_settings()

    # Optional Redis connection
    _redis = None
    if s.redis_url:
        import redis.asyncio as aioredis
        _redis = aioredis.from_url(s.redis_url, decode_responses=True)
    application.state.redis = _redis

    # Create tables on startup (dev convenience — production uses Alembic)
    from app.database import engine, Base
    import app.models  # noqa: F401 — register all models
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Start scheduler
    from app.scheduler.jobs import start_scheduler, stop_scheduler
    start_scheduler()

    yield

    stop_scheduler()
    if _redis:
        await _redis.close()


app = FastAPI(
    title="AI Quant Analysis System",
    description="AI-powered blockchain quantitative analysis",
    version="0.1.0",
    lifespan=lifespan,
)

_settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def verify_api_key(
    api_key: str = Security(api_key_header),
    settings: Settings = Depends(get_settings),
):
    if settings.api_secret_key.startswith("change-me"):
        return  # Skip auth if using default key (dev mode)
    if not api_key or api_key != settings.api_secret_key:
        raise HTTPException(status_code=401, detail="Invalid API key")


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
        checks["cache"] = "ok" if get_settings().redis_url else "ok (memory)"
    except Exception as e:
        checks["cache"] = f"error: {e}"

    overall = "ok" if all("ok" in v for v in checks.values()) else "degraded"
    return {"status": overall, "checks": checks}


app.include_router(market.router, dependencies=[Depends(verify_api_key)])
app.include_router(analysis.router, dependencies=[Depends(verify_api_key)])
app.include_router(news.router, dependencies=[Depends(verify_api_key)])
app.include_router(settings.router, dependencies=[Depends(verify_api_key)])
