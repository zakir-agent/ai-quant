# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 快速命令

```bash
# 启停管理（默认方式）
./dev.sh start          # 一键启动 PG + Redis + Backend(8000) + Frontend(3000)
./dev.sh stop           # 一键停止
./dev.sh restart        # 仅重启 Backend + Frontend（PG/Redis 保持）
./dev.sh restart backend|frontend  # 重启单个服务
./dev.sh status         # 服务状态 + health check
./dev.sh logs backend|frontend     # 查看日志（tail -f）
./dev.sh migrate        # 运行 Alembic 迁移
./dev.sh doctor         # 环境诊断

# 后端（在 backend/ 目录下，需先 source venv/bin/activate）
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# 前端
cd frontend && npm run dev     # 开发
cd frontend && npm run lint    # lint（提交前必须通过）
cd frontend && npm run build   # 构建（静态导出）

# 测试
source backend/venv/bin/activate && pytest              # 全部后端测试
python -m pytest backend/tests/test_xxx.py::test_name -v  # 单个测试
# 前端无测试框架

# CI 预检（提交前）
./scripts/ci-check.sh          # 全量：prettier + eslint + build + ruff + pyright + pytest
./scripts/ci-check.sh frontend # 仅前端
./scripts/ci-check.sh backend  # 仅后端

# Docker 方式（备选）
docker compose up
```

## 架构概览

本项目是 AI 驱动的区块链量化分析系统，后端 FastAPI + 前端 Next.js 16（静态导出）。

### 后端 (`backend/app/`)

**启动流程** (`main.py` lifespan):
1. 启动 APScheduler（14 个定时任务）
2. 异步预热市场概览缓存
3. 启动 Binance WebSocket Bridge（实时 K 线 + ticker）
4. 关闭时依次停止 WS Bridge → Scheduler → Redis

**核心分层：**
- `collectors/` — 数据采集器，继承 `BaseCollector`（collect → transform → store 三步管道）
- `analysis/` — AI 分析引擎（engine + prompts + schemas），用 Pydantic 约束 LLM 输出
- `services/` — 业务逻辑（data_aggregator、ai_client、signal_aggregator、alerting、kline_aggregator、rate_limiter、collector_health 等）
- `scheduler/jobs.py` — APScheduler 14 个定时任务（采集 30min/1h，新闻 15min，AI 分析 4h，精度评估 6h，K 线聚合 5min，数据清理 24h）
- `api/` — FastAPI 路由（market、analysis、news、ws、settings、backtest）
- `models/` — SQLAlchemy 模型（8 张表）

**关键模式：**

1. **采集器管道** — 新增数据源只需实现 `BaseCollector` 的 `collect()`/`transform()`/`store()` 三个方法，注册到 `scheduler/jobs.py` 即可。所有写 DB 的采集器用 PostgreSQL `ON CONFLICT DO UPDATE` 幂等入库。

2. **AI 分析管道** (`analysis/engine.py`) — 五步：限额检查 → 数据快照 → 构建 prompt → 调用 LiteLLM（结构化 JSON 输出）→ 持久化。支持 `json_schema → json_object → plain text` 逐级降级。prompt 版本号（`PROMPT_VERSION`）控制重新分析。

3. **数据聚合** (`services/data_aggregator.py`) — HTTP 调用（CoinGecko、Fear & Greed）用 `asyncio.gather` 并发；DB 查询共享单个 session 顺序执行，避免 SQLAlchemy 并发操作异常。

4. **两层缓存** (`services/cache.py`) — Redis 可选，未配置时自动降级为内存 dict（带 TTL）。

5. **准确率反馈环** (`services/accuracy_tracker.py`) — AI 给出推荐 → 24h 后评估 → 写入 `accuracy` JSON 列 → 前端展示滚动 7d/30d 准确率。

6. **新闻双管道** — 情绪标注（`news_sentiment.py`，batch LLM）和结构化分析（`news_analyzer.py`，per-article Pydantic 约束），按 `prompt_version` 版本化，支持 prompt 变更后重新分析。

7. **WebSocket 实时行情** (`services/ws_manager.py`) — 订阅 Binance 1m K 线 + ticker，零 API 消耗入库（`KLINE_WS_PERSIST=true`）；本地聚合 1m → 5m/15m（`services/kline_aggregator.py`），自动重连 + 心跳。

8. **数据保留** (`scheduler/retention.py`) — 细粒度 K 线（1m）保留 14 天，其他数据 90 天，每 24h 自动清理。可配：`DATA_RETENTION_DAYS`、`DATA_RETENTION_1M_DAYS`。

9. **限频管理** (`services/rate_limiter.py`) — Binance REST API 600 weight/min 预算，采集器按需获取配额，避免触发限频。

### 前端 (`frontend/`)

**Next.js 16 静态导出**（`output: "export"`），App Router 结构。

**页面：** Dashboard(`/`) → Market → Analysis → News → Settings

**状态管理：** 无全局状态库，用 React Context：
- `LanguageProvider` — i18n（zh/en），locale 存 localStorage
- `ThemeProvider` — 主题（quantum/neon），通过 `data-theme` 属性切换
- `SidebarProvider` — 侧边栏折叠状态

**i18n：** 基于 `next-intl`，封装 `useT()` hook，消息文件在 `src/messages/{zh,en}.json`，点分隔路径（如 `nav.dashboard`）。

**API 层** (`lib/api.ts`) — `apiFetch<T>()` 封装：超时 10s、GET 请求自动重试 2 次（5xx/429）、API Key 注入。后端 URL 自动解析（`lib/backend-url.ts`）支持局域网访问。

**WebSocket** (`lib/websocket.ts`) — `useWebSocket` hook，自动重连，频道订阅/取消订阅。

**图表：** `lightweight-charts`（K 线图），`DataIntegrityBadge` 显示数据完整率。

### 数据库

PostgreSQL 17 + asyncpg，8 张表：
- `ohlcv_data` — K 线数据（symbol/exchange/timeframe/timestamp 联合唯一）
- `dex_volume` — DEX 交易对（source/chain/dex/pair 联合唯一）
- `futures_metric` — 合约指标（funding rate、OI、多空比）
- `defi_metric` — DeFi TVL
- `analysis_report` — AI 分析报告（JSON 列存 observations/recommendations/accuracy）
- `news_article` — 新闻文章（URL 唯一）
- `news_analysis` — 新闻结构化分析（news_id + prompt_version 联合唯一）
- `telegram_message_log` — Telegram 发送审计

**迁移：** Alembic，先改模型 → `alembic revision --autogenerate` → `alembic upgrade head`（`./dev.sh migrate`）。

### 配置 (`backend/app/config.py`)

所有后端配置通过 `Settings`（pydantic-settings）管理，环境变量 → `.env` 文件。重要分组：
- **AI 模型** — `AI_PRIMARY_MODEL`（默认 gpt-4o）、`AI_FALLBACK_MODEL`、`AI_FAST_MODEL`、`AI_MAX_ANALYSES_PER_DAY`
- **数据源** — `CEX_DEFAULT_SYMBOLS`、`CEX_DEFAULT_TIMEFRAMES`、`COINGECKO_COIN_IDS`
- **调度频率** — `COLLECT_INTERVAL_MINUTES`、`ANALYSIS_INTERVAL_HOURS`、`NEWS_COLLECT_INTERVAL_MINUTES`
- **WebSocket** — `KLINE_WS_PERSIST`、`KLINE_WS_FLUSH_INTERVAL`、`BINANCE_RATE_LIMIT_BUDGET`
- **数据保留** — `DATA_RETENTION_DAYS`（90）、`DATA_RETENTION_1M_DAYS`（14）

## 开发规范

### 后端
- 异步优先：使用 async/await，数据库用 asyncpg
- 数据模型放 `app/models/`，API 路由放 `app/api/`
- 新增数据源实现 `app/collectors/base.py` 中的基类
- 环境变量通过 `get_settings()` 读取（pydantic-settings），禁止 `os.environ` 散落在业务逻辑中
- 数据库迁移使用 Alembic：先改模型，再 `alembic revision --autogenerate`，最后 `alembic upgrade head`
- Linting: ruff（line-length 88, rules: E/F/I/UP/B/SIM）+ pyright 类型检查
- 编辑 `backend/` 下文件后运行 `./dev.sh restart backend` 使改动生效

### 前端
- 遵循 Next.js 16 最新约定，**修改代码前先阅读** `node_modules/next/dist/docs/` 下的相关文档
- 使用 Tailwind CSS 4 进行样式开发
- K 线图使用 lightweight-charts 库
- 新增文案必须同时更新 `zh.json` 和 `en.json`

### 本地部署
- 两种方式：`./dev.sh`（原生进程，默认）或 `docker compose`（容器），除非用户指定否则使用 `dev.sh`
- `dev.sh` 命令：start / stop / restart / status / logs backend / logs frontend
- 修改 `.env` 后需重启后端生效

### 通用
- 提交前在仓库根目录 `changelog.md` 的「未发布」中记录摘要，并随代码一并 `git add`；提交前运行 `./scripts/ci-check.sh` 预检
- 提交前确保 `npm run lint`（前端）通过
- 敏感信息（API Key 等）只放 `.env`，不提交到代码仓库
- 默认交易对为 xxx/USDT (Binance)，支持切换

## PR Review 指引

### 优先级分类
- **必须修改**：功能错误、数据泄漏（密钥/Token 明文暴露）、类型错误导致运行时崩溃
- **建议修改**：错误处理缺失、import 组织混乱（函数体内 import 应移到文件顶部）、类型注解不准确
- **小问题（Nits）**：样式不一致、冗余注释、状态未及时清理等 UX 细节

### 后端检查项
- 新接口是否有错误处理（try/except），避免 500 裸堆栈返回给前端
- 函数签名类型注解是否准确（尤其可为 `None` 的参数）
- import 统一放文件顶部，除非有循环依赖必须延迟
- 环境变量通过 `get_settings()` 读取，禁止 `os.environ` 直接散落在业务逻辑中
- 涉及敏感字段（Token、Key、Chat ID）只能返回脱敏值或布尔标志

### 前端检查项
- `npm run lint` 必须通过，TypeScript 编译无错误
- 新增 API 字段需同步更新 `interface`，避免运行时 undefined 访问
- i18n：新增文案必须同时更新 `zh.json` 和 `en.json`
- 异步函数调用需处理异常，用户触发的操作要有 loading / error 状态反馈

### PR 规范
- PR 标题必须英文，body 可中文

### 本项目豁免项（个人本地使用，无需关注）
- 接口限流与身份认证
- 向后兼容（可直接 breaking change，重启即可）

## 长期路线图

优先级：1 → 2 → 3

1. **实时数据推送 (WebSocket)** — 实时价格/新闻更新，无需手动刷新
2. **策略回测** — 验证 AI 推荐准确率，模拟 PnL
3. **自动交易扩展** — 信号到下单的闭环（架构已预留扩展点）
