# AI 区块链量化分析系统 — 设计文档

## 概述

构建一个个人使用的 AI 驱动区块链量化分析系统。系统整合链上数据（DEX 交易、DeFi 协议）、交易所价格数据（CEX K线 + 聚合平台）、加密新闻等多维度数据，通过 AI 多模型分析后，在 Web 仪表盘上展示宏观市场判断和具体交易建议。

### MVP 阶段决策

- X/Twitter KOL 采集暂不实现，后续按需引入
- 新闻采集使用 CryptoPanic API + RSS feed，不用爬虫
- ccxt 公开数据不强制要求 Key，但建议注册 Binance API Key（只读权限）以提高频率限制
- K线图默认展示主流交易对（xxx/USDT on Binance），支持切换交易对和交易所

---

## 技术栈

| 组件 | 技术 | 说明 |
|------|------|------|
| 后端 | Python 3.12 + FastAPI | 异步高性能，自动 OpenAPI 文档 |
| 前端 | Next.js 15 + Tailwind CSS + shadcn/ui | 现代化仪表盘 |
| 图表 | Lightweight Charts (TradingView 开源) | 专业 K 线图 |
| 数据库 | PostgreSQL 16 | 结构化存储，支持 JSONB |
| 缓存 | Redis | 热数据缓存（价格快照、API 响应缓存） |
| ORM | SQLAlchemy 2.0 + Alembic | 数据模型 + 迁移 |
| 任务调度 | APScheduler | 轻量定时任务 |
| DEX 数据 | DexScreener API | 聚合多链 DEX 数据，REST API，免费使用 |
| DeFi 数据 | DefiLlama API | TVL、协议指标、借贷数据，免费无需 Key |
| CEX 数据 | ccxt | 统一 100+ 交易所 API |
| 聚合数据 | CoinGecko API (免费) | 市场概览 + 历史数据 |
| 新闻采集 | CryptoPanic API + RSS (feedparser) | 聚合 API 为主，RSS 补充 |
| AI 集成 | LiteLLM SDK | 统一多模型调用（Claude/GPT/本地），零部署 |
| 容器化 | Docker + docker-compose | 一键启动所有服务 |

---

## 系统架构

```
┌─────────────────────────────────────────────────┐
│              Next.js Dashboard                   │
│   市场概览 │ AI分析报告 │ 交易建议 │ 数据探索    │
└──────────────────┬──────────────────────────────┘
                   │ REST API + WebSocket
┌──────────────────▼──────────────────────────────┐
│              FastAPI Backend                      │
│   /api/market  /api/analysis  /api/config        │
│   /ws/realtime                                   │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│            AI Analysis Engine                    │
│   LiteLLM (Claude / GPT / Ollama)               │
│   ┌────────────┐ ┌────────────┐ ┌────────────┐  │
│   │ 市场情绪    │ │ 趋势分析    │ │ 交易建议    │  │
│   │ Analyzer   │ │ Analyzer   │ │ Generator  │  │
│   └────────────┘ └────────────┘ └────────────┘  │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│          PostgreSQL + Redis                      │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│         Data Collectors (APScheduler)            │
│  ┌──────┐ ┌──────┐ ┌───────┐ ┌──────┐            │
│  │ DEX  │ │DeFi  │ │ CEX   │ │ News │            │
│  └──────┘ └──────┘ └───────┘ └──────┘            │
└─────────────────────────────────────────────────┘
```

---

## 项目目录结构

```
ai-quant/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── api/
│   │   │   ├── market.py
│   │   │   ├── analysis.py
│   │   │   └── config.py
│   │   ├── collectors/
│   │   │   ├── base.py
│   │   │   ├── cex.py          # ccxt (Binance 等)
│   │   │   ├── coingecko.py    # 市场概览
│   │   │   ├── dexscreener.py  # DexScreener API
│   │   │   ├── defillama.py    # DefiLlama API
│   │   │   └── news.py         # CryptoPanic + RSS
│   │   ├── analysis/
│   │   │   ├── engine.py
│   │   │   ├── prompts.py
│   │   │   ├── sentiment.py
│   │   │   ├── trend.py
│   │   │   └── advisor.py
│   │   ├── models/
│   │   │   ├── market.py
│   │   │   ├── analysis.py
│   │   │   └── news.py
│   │   ├── scheduler/
│   │   │   └── jobs.py
│   │   └── services/
│   │       ├── ai_client.py
│   │       └── data_aggregator.py
│   ├── alembic/
│   ├── tests/
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx
│   │   │   ├── analysis/
│   │   │   ├── market/
│   │   │   └── settings/
│   │   ├── components/
│   │   │   ├── charts/
│   │   │   ├── dashboard/
│   │   │   └── ui/
│   │   └── lib/
│   │       ├── api.ts
│   │       └── types.ts
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 数据模型

所有时间戳使用 UTC 存储，前端负责时区转换。

### 市场价格 (OHLCV)
```python
class OHLCVData:
    id: int              # PK
    symbol: str          # "BTC/USDT"
    exchange: str        # "binance"
    timeframe: str       # "1h", "4h", "1d"
    timestamp: datetime  # UTC
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: Decimal
    # UNIQUE(symbol, exchange, timeframe, timestamp)
    # INDEX(symbol, exchange, timeframe, timestamp DESC)
```

### DEX 交易量（来自 DexScreener API）
```python
class DexVolume:
    id: int              # PK
    chain: str           # "ethereum", "solana", "bsc"
    dex: str             # "uniswap_v3", "raydium"
    pair: str            # "WETH/USDC"
    volume_24h: Decimal  # 24h 交易量 (USD)
    price_usd: Decimal   # 当前价格
    liquidity_usd: Decimal  # 流动性
    txns_24h: int        # 24h 交易笔数
    timestamp: datetime  # UTC
    # UNIQUE(chain, dex, pair, timestamp)
```

### DeFi 协议指标（来自 DefiLlama API）
```python
class DefiMetric:
    id: int              # PK
    protocol: str        # "aave", "compound"
    chain: str           # "ethereum", "all"
    tvl: Decimal
    tvl_change_24h: Decimal  # 24h TVL 变化百分比
    category: str        # "lending", "dex", "yield"
    timestamp: datetime  # UTC
    # UNIQUE(protocol, chain, timestamp)
```

### AI 分析结果
```python
class AnalysisReport:
    id: int              # PK
    scope: str           # "market" (整体) / "BTC" / "ETH" (具体币种)
    model_used: str      # "claude-sonnet-4-20250514"
    prompt_version: str  # prompt 模板版本号，便于追溯
    sentiment_score: int # -100 ~ +100
    trend: str           # "bullish" / "bearish" / "neutral"
    risk_level: str      # "low" / "medium" / "high"
    summary: str         # 宏观分析摘要
    recommendations: JSON  # 具体交易建议列表
    data_sources: JSON   # 分析依据的数据快照
    token_usage: JSON    # {"input": N, "output": N, "cost_usd": N}
    created_at: datetime # UTC
    # INDEX(scope, created_at DESC)
```

### 新闻
```python
class NewsArticle:
    id: int              # PK
    source: str          # "cryptopanic", "coindesk_rss"
    title: str
    summary: str         # 摘要（CryptoPanic 返回摘要，非全文）
    url: str             # UNIQUE
    sentiment: str       # AI 标注: "positive" / "negative" / "neutral"
    published_at: datetime  # UTC
    collected_at: datetime  # UTC
    # UNIQUE(url)
```

---

## AI 分析引擎

### 多模型适配 (LiteLLM SDK)
```python
MODELS = {
    "primary": "claude-sonnet-4-20250514",
    "fallback": "gpt-4o",
    "fast": "claude-haiku-4-5-20251001",
}
```

### 分析流程
1. DataAggregator 从数据库拉取最新的各维度数据
2. 将结构化数据填入 Prompt 模板
3. 通过 LiteLLM 调用配置的模型
4. 解析 AI 返回的 JSON 结构化结果
5. 将分析结果存入数据库
6. 通过 WebSocket 推送到前端

### Prompt 设计原则
- 要求 AI 返回结构化 JSON
- 每次分析包含: 情绪评分、趋势判断、风险等级、具体建议、依据说明
- Prompt 中包含数据快照，确保分析可追溯

---

## 可靠性与安全

### 访问控制
个人工具，使用简单 API Key 认证（通过环境变量 `API_SECRET_KEY` 配置），前端请求携带 header。

### 错误处理
- 外部 API 调用统一包装：指数退避重试（最多 3 次）
- 采集器失败不影响其他采集器（互相独立）
- AI 返回非法 JSON 时，记录原始响应并标记为解析失败
- 仪表盘展示各数据源最后成功采集时间，数据过期时显示警告

### APScheduler 持久化
使用 SQLAlchemy job store 将任务状态持久化到 PostgreSQL，避免容器重启后丢失调度状态。设置 `max_instances=1` 防止任务重叠。

### AI 成本控制
- 每次分析记录 token 用量和成本到 `AnalysisReport.token_usage`
- 设置每日分析次数上限（默认 10 次/天），可通过配置调整
- 非关键分析使用 fast 模型（Haiku）降低成本
- 仪表盘设置页展示累计 AI 消耗

---

## 配置项 (.env)

```env
# 基础设施
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/ai_quant
REDIS_URL=redis://localhost:6379/0
API_SECRET_KEY=...               # 简单认证

# AI 模型
AI_PRIMARY_MODEL=claude-sonnet-4-20250514
AI_FALLBACK_MODEL=gpt-4o
AI_FAST_MODEL=claude-haiku-4-5-20251001
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
AI_MAX_ANALYSES_PER_DAY=10       # 每日分析上限

# 数据源
BINANCE_API_KEY=...              # 可选，提高频率限制
BINANCE_API_SECRET=...           # 可选
CRYPTOPANIC_API_KEY=...          # 免费注册
# CoinGecko, DefiLlama, DexScreener 免费 API 无需 Key

# 采集调度
COLLECT_INTERVAL_MINUTES=30
NEWS_COLLECT_INTERVAL_MINUTES=15
ANALYSIS_INTERVAL_HOURS=4
```

---

## 分阶段实施

| 阶段 | 目标 | 验证 |
|------|------|------|
| P0 | 基础框架骨架 | `docker-compose up` 后前端访问后端 `/health` 返回 200 |
| P1 | 价格数据采集与 K 线展示 | BTC/USDT K线图 + 交易对切换 + 市场概览 |
| P2 | 链上数据采集 | DEX 交易量 + DeFi TVL 展示 |
| P3 | AI 分析引擎 | 手动触发分析 → 查看报告和建议 |
| P4 | 新闻数据整合 | 新闻流 + AI 情绪标注 + 分析引用 |
| P5 | 仪表盘完善 | WebSocket 实时更新 + 历史回顾 + 暗色主题 |
