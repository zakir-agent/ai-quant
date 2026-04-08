# AI Quant

AI 驱动的区块链量化分析系统。聚合 CEX 行情、DEX 交易、DeFi 协议、加密新闻等多维数据，通过 AI 进行市场情绪分析并提供交易建议。

## 功能特性

- **多源行情聚合** — Binance K 线、CoinGecko 市场概览、DexScreener DEX 数据、DefiLlama TVL
- **AI 市场分析** — 基于多维数据自动生成情绪评分、趋势判断和交易建议
- **多模型支持** — Claude / GPT / Ollama / DeepSeek / MiMo 等，通过 LiteLLM 统一接入
- **新闻聚合** — CryptoPanic API + RSS 采集，AI 情感标注
- **可视化仪表盘** — K 线图表、市场概览、DeFi/DEX 面板、分析报告
- **定时采集** — 自动调度数据采集和 AI 分析任务
- **数据保留策略** — 自动清理过期细粒度数据，控制存储用量

## 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Python 3.12 / FastAPI / SQLAlchemy (async) / APScheduler |
| 前端 | Next.js 16 / React 19 / TypeScript / Tailwind CSS 4 / lightweight-charts |
| 数据库 | PostgreSQL / Redis |
| AI | LiteLLM SDK |
| 部署 | Docker Compose |

## 快速开始

### 前置要求

- Node.js 20+
- Python 3.11+
- PostgreSQL 17（本地 `brew services` 或 Docker）
- Redis（可选，留空 `REDIS_URL` 时自动使用内存缓存）

### 1. 克隆项目

```bash
git clone https://github.com/zakir-web3/ai-quant.git
cd ai-quant
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，填入必要配置：
- `DATABASE_URL` — PostgreSQL 连接串（本地或远程均可）
- AI 模型的 API Key（至少配置一个）

### 3. 启动服务（默认方式：`dev.sh`）

```bash
# 一键启动本地开发栈（PostgreSQL / Redis / Backend / Frontend）
./dev.sh start

# 查看状态与日志
./dev.sh status
./dev.sh logs backend
./dev.sh logs frontend
```

> 修改 `.env` 后请执行 `./dev.sh restart` 使后端配置生效。

### 4. 初始化数据库

```bash
cd backend
source venv/bin/activate
PYTHONPATH=. alembic upgrade head
```

### 5. 访问

- 前端: http://localhost:3000
- 后端 API: http://localhost:8000
- API 文档: http://localhost:8000/docs

### 6. Docker 方式（可选）

```bash
docker compose up -d
cd backend
PYTHONPATH=. alembic upgrade head
```

## 项目结构

```
ai-quant/
├── backend/              # FastAPI 后端
│   ├── app/
│   │   ├── api/          # API 路由
│   │   ├── models/       # 数据模型
│   │   ├── collectors/   # 数据采集器
│   │   ├── analysis/     # AI 分析引擎
│   │   ├── scheduler/    # 定时任务
│   │   └── services/     # 业务逻辑
│   ├── alembic/          # 数据库迁移
│   └── tests/
├── frontend/             # Next.js 前端
│   └── src/
├── docs/                 # 文档
├── docker-compose.yml
└── .env.example
```

## 数据源

| 数据源 | 用途 | 是否需要 Key |
|--------|------|:---:|
| ccxt (Binance) | CEX 行情、K 线 | 可选 |
| CoinGecko | 聚合行情 | 否 |
| DefiLlama | DeFi TVL | 否 |
| DexScreener | DEX 交易 | 否 |
| CryptoPanic | 新闻聚合 | 是 |

## 文档

- [Alembic 数据库迁移指南](docs/alembic-guide.md)

## License

MIT
