from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic_settings import BaseSettings

_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"

# Load .env into os.environ so LiteLLM and other libs can read API keys directly
load_dotenv(_ENV_FILE)


class Settings(BaseSettings):
    # Infrastructure
    database_url: str = "postgresql+asyncpg://aiquant:aiquant@db:5432/ai_quant"
    db_pool_size: int = 5
    db_pool_max_overflow: int = 5
    redis_url: str = ""
    api_secret_key: str = "change-me"
    cors_origins: str = "http://localhost:3000"
    data_retention_days: int = 90

    # AI Models
    ai_primary_model: str = "claude-sonnet-4-20250514"
    ai_fallback_model: str = "gpt-4o"
    ai_fast_model: str = "claude-haiku-4-5-20251001"
    ai_max_analyses_per_day: int = 10

    # Data sources
    binance_api_key: str = ""
    binance_api_secret: str = ""

    # Scheduling
    collect_interval_minutes: int = 30
    news_collect_interval_minutes: int = 15
    analysis_interval_hours: int = 4
    news_sentiment_interval_minutes: int = 30
    news_sentiment_batch_size: int = 30
    scheduler_job_timeout_seconds: int = 120

    # Alerting
    alert_enabled: bool = True
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""
    alert_webhook_url: str = ""
    alert_price_change_pct: float = 5.0
    alert_sentiment_delta: int = 30
    alert_cooldown_minutes: int = 30

    model_config = {
        "env_file": str(_ENV_FILE),
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


@lru_cache
def get_settings() -> Settings:
    return Settings()
