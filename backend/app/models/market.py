from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Index, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class OHLCVData(Base):
    __tablename__ = "ohlcv_data"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(32), nullable=False)  # "BTC/USDT"
    exchange: Mapped[str] = mapped_column(String(32), nullable=False)  # "binance"
    timeframe: Mapped[str] = mapped_column(String(8), nullable=False)  # "1h","4h","1d"
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    open: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    high: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    low: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    close: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    volume: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)

    __table_args__ = (
        UniqueConstraint(
            "symbol", "exchange", "timeframe", "timestamp", name="uq_ohlcv"
        ),
        Index("ix_ohlcv_lookup", "symbol", "exchange", "timeframe", timestamp.desc()),
    )


class DexVolume(Base):
    __tablename__ = "dex_volume"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    chain: Mapped[str] = mapped_column(String(32), nullable=False)
    dex: Mapped[str] = mapped_column(String(64), nullable=False)
    pair: Mapped[str] = mapped_column(String(64), nullable=False)
    volume_24h: Mapped[Decimal] = mapped_column(Numeric(24, 2), nullable=False)
    price_usd: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    liquidity_usd: Mapped[Decimal] = mapped_column(Numeric(24, 2), nullable=False)
    txns_24h: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        UniqueConstraint("chain", "dex", "pair", "timestamp", name="uq_dex_volume"),
    )


class FuturesMetric(Base):
    __tablename__ = "futures_metric"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(32), nullable=False)  # "BTC/USDT"
    exchange: Mapped[str] = mapped_column(String(32), nullable=False)  # "binance"
    funding_rate: Mapped[Decimal | None] = mapped_column(Numeric(16, 8), nullable=True)
    open_interest: Mapped[Decimal | None] = mapped_column(Numeric(24, 4), nullable=True)
    long_short_ratio: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 4), nullable=True
    )
    long_account_pct: Mapped[Decimal | None] = mapped_column(
        Numeric(8, 4), nullable=True
    )
    short_account_pct: Mapped[Decimal | None] = mapped_column(
        Numeric(8, 4), nullable=True
    )
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        UniqueConstraint("symbol", "exchange", "timestamp", name="uq_futures_metric"),
        Index("ix_futures_lookup", "symbol", "exchange", timestamp.desc()),
    )


class DefiMetric(Base):
    __tablename__ = "defi_metric"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    protocol: Mapped[str] = mapped_column(String(64), nullable=False)
    chain: Mapped[str] = mapped_column(String(32), nullable=False)
    tvl: Mapped[Decimal] = mapped_column(Numeric(24, 2), nullable=False)
    tvl_change_24h: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=True)
    category: Mapped[str] = mapped_column(String(32), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        UniqueConstraint("protocol", "chain", "timestamp", name="uq_defi_metric"),
    )
