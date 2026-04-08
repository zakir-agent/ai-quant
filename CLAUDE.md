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

### 本项目豁免项（个人本地使用，无需关注）
- 接口限流与身份认证
- 向后兼容（可直接 breaking change，重启即可）
