from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

settings = get_settings()

# For local PostgreSQL without SSL, pass ssl=False to asyncpg
_connect_args: dict = {"statement_cache_size": 0}
if "localhost" in settings.database_url or "127.0.0.1" in settings.database_url:
    _connect_args["ssl"] = False

# Append prepared_statement_cache_size=0 for pgbouncer compatibility
_db_url = settings.database_url
_sep = "&" if "?" in _db_url else "?"
_db_url = f"{_db_url}{_sep}prepared_statement_cache_size=0"

engine = create_async_engine(
    _db_url,
    echo=False,
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_pool_max_overflow,
    pool_pre_ping=True,
    pool_recycle=300,
    connect_args=_connect_args,
)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session
