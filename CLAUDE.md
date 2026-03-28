# AI Quant - 开发指引

## 开发规范

### 后端
- 异步优先：使用 async/await，数据库用 asyncpg
- 数据模型放 `app/models/`，API 路由放 `app/api/`
- 新增数据源实现 `app/collectors/base.py` 中的基类
- 环境变量通过 pydantic-settings 管理，参考 `.env.example`
- 数据库迁移使用 Alembic：先改模型，再 `alembic revision --autogenerate`，最后 `alembic upgrade head`

### 前端
- 遵循 Next.js 16 最新约定，**修改代码前先阅读** `node_modules/next/dist/docs/` 下的相关文档
- 使用 Tailwind CSS 4 进行样式开发
- K 线图使用 lightweight-charts 库

### 本地部署
- 两种方式：`./dev.sh`（原生进程，默认）或 `docker compose`（容器），除非用户指定否则使用 `dev.sh`
- `dev.sh` 命令：start / stop / restart / status / logs backend / logs frontend
- 修改 `.env` 后需重启后端生效

### 通用
- 提交前确保 `npm run lint`（前端）通过
- 敏感信息（API Key 等）只放 `.env`，不提交到代码仓库
- 默认交易对为 xxx/USDT (Binance)，支持切换
