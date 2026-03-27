from pathlib import Path
from pydantic_settings import BaseSettings
from functools import lru_cache

_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    # Infrastructure
    database_url: str = "postgresql+asyncpg://aiquant:aiquant@db:5432/ai_quant"
    db_pool_size: int = 5
    db_pool_max_overflow: int = 5
    redis_url: str = "redis://redis:6379/0"
    api_secret_key: str = "change-me"
    cors_origins: str = "http://localhost:3000"
    data_retention_days: int = 90

    # AI Models
    ai_primary_model: str = "claude-sonnet-4-20250514"
    ai_fallback_model: str = "gpt-4o"
    ai_fast_model: str = "claude-haiku-4-5-20251001"
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    ai_max_analyses_per_day: int = 10
    # Custom OpenAI-compatible endpoint
    ai_custom_base_url: str = ""
    ai_custom_api_key: str = ""
    ai_custom_model: str = ""

    # Data sources
    binance_api_key: str = ""
    binance_api_secret: str = ""
    cryptopanic_api_key: str = ""

    # Scheduling
    collect_interval_minutes: int = 30
    news_collect_interval_minutes: int = 15
    analysis_interval_hours: int = 4

    model_config = {"env_file": str(_ENV_FILE), "env_file_encoding": "utf-8"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
