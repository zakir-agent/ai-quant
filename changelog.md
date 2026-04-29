# Changelog

在每次提交前于本节追加一条简要记录（改了什么、为何改）。合并提交与 `SKIP_CHANGELOG=1` 会跳过钩子校验。

## 未发布

- 市场页顶部交互重构：将 DEX/DeFi 的筛选下拉与 Tab 导航合并为统一工具栏，移除卡片内部孤立筛选区；同时统一下拉与按钮视觉样式并优化 K 线工具栏分组层次，提升页面一致性与可用性。
- chore: 运行 ruff format（后端 5 文件）和 prettier（前端 7 文件）修复 CI 格式检查失败，无逻辑变更。
- 市场页 DeFi / DEX 筛选：后端新增 `GET /api/market/defi/categories`、`GET /api/market/dex/chains`（基于最新快照 DISTINCT），前端下拉从接口动态填充，避免硬编码与真实数据不一致；DefiLlama 采集器用通用分类标准化（kebab-case）替代逐协议硬编码映射。
- 设置页改进：API 类型从 `Record<string, unknown>` 改为具体 interface 消除强转；AI 配置卡片新增每日分析上限；数据统计展示最后采集时间（相对时间）；调度任务展示 running/stopped 状态；`useMemo` 修正为 `useCallback`；日期格式跟随语言切换（zh-CN/en-US）；`TelegramLogList` 同步适配。`zh.json/en.json` 新增 5 个 key。
- 设置页 K 线数据完整性升级为矩阵视图：后端新增 `GET /api/market/integrity/summary` 聚合接口（30s 缓存），前端改为按 symbol×timeframe 一屏展示完整率热力表，支持 7/30/90 天切换、仅看异常过滤、点击单元格查看缺口明细，避免逐项切换导致巡检效率低。
- K 线图工具栏接入数据完整性角标：新增 `DataIntegrityBadge`（`frontend/src/components/charts/`），首页 + 市场页（多框架模式除外）的 K 线工具栏右侧显示「状态点 + 完整率%」，点击展开 popover 显示 expected/actual/gaps 明细；days 跟随 timeframe 自适应（1h→7d / 4h→30d / 1d→90d）。受 `CEX_DEFAULT_TIMEFRAMES` 限制，仅在 `1h/4h/1d` 三档下显示，避免在 1m/5m/15m 上展示误导性的 0%。失败/loading 静默降级，不影响 K 线图本身。
- 设置页「数据完整性」卡片：从硬编码的 `BTC/USDT · 1h · 7 天` 改为可切换 — 卡片头部加 symbol 下拉（来自 `getPairs()`）、`1h/4h/1d` 周期切换与 `7/30/90` 天数切换三个轻量控件，切换时局部 reload；卡片始终展示，没数据时显示「暂无数据」而非整体隐藏。
- 修复 `GET /api/market/integrity` 完整率永远到不了 100% 的问题：把 `end` 从 `now()` 对齐到上一个完结的 K 线边界（`floor(now/interval)*interval`），同时把范围比较从 `<= end` 改为 `< end`，剔除"当前还没收完的那根"。修复后 BTC/USDT 1h/4h/1d 各档完整率均为 100%。
- 设置页布局调整：删除独立「采集器健康状态」卡片，把每个 collector 的状态点（ok/degraded/alert/pending）和最近一次运行时间直接合并到「数据源」卡片对应行；「Telegram 发送记录」从设置页底部独立卡片移入「告警通知」卡片底部，默认折叠（点击「Telegram 发送记录 ▸」展开），归位到与 Telegram 配置同一上下文。`zh.json/en.json` 新增 `settings.collectorPending` / `settings.dsConfigured`。
- 修复：`telegram_message_log` 表在数据库上不存在但 alembic_version 已记为更新版本，导致 `GET /api/settings/telegram-logs` 500、前端「Telegram 发送记录」永远显示「暂无数据」。已通过 `CREATE TABLE IF NOT EXISTS` 幂等补建。同时给 `list_telegram_logs` 加上 `try/except SQLAlchemyError` → 503，避免再次裸 500；`_get_collector_health` 内的 lazy import 移到模块顶部。
- 新闻面板：按来源分「全部 / CoinGecko / RSS / NewsAPI」四个 Tab 展示。后端 `/api/news/latest` 新增 `source_group` 查询参数（`all/coingecko/rss/newsapi`），DB 端按 source 字段 `LIKE` 过滤；前端 `NewsPanel` 切非 all Tab 时按需 fetch 对应分组并缓存，切回 all 复用首屏数据；`zh.json/en.json` 同步新增 `news.tabAll/tabCoinGecko/tabRss/tabNewsapi` 文案。
- 修复：CoinGecko News 接口 2026 起强制要求 `page` 参数（缺失返回 422 "Invalid page param!"），`NewsCollector` 请求加 `params={"page": 1}`；非 200 响应改打 warning 日志，避免静默丢数据。
- 修复：`backend/alembic/env.py` 在顶部把 `backend/`（env.py 祖父目录）插入 `sys.path`，解决 `./dev.sh start/migrate` 时 alembic 因 cwd 切换报 `ModuleNotFoundError: No module named 'app'` 的问题。
- 配置：`backend/alembic.ini` 的 `sqlalchemy.url` 切回本地 `./dev.sh` 使用的 Postgres DSN，移除文件中硬编码的远程数据库密码，避免凭证入库。
- DB：Alembic 迁移 d4e5f6a7b890，将 dex_volume.source 列从 VARCHAR(16) 扩展为 VARCHAR(64)，修复 dexscreener_boosted/search 标签写入溢出。
- DEX 热门交易对：新增「全部 / 热门推广 / 指定搜索」三个 Tab，按 source 字段客户端过滤；采集器拆分两组数据打 dexscreener_boosted / dexscreener_search 标签；DB UniqueConstraint 加入 source 字段（需执行 alembic upgrade head）。
- 前端：DexPanel 新增全部/热门推广/指定搜索三个 Tab，按 source 字段客户端过滤。
- i18n：新增 dex.tabAll / tabBoosted / tabSearch 三个文案。
- 前端：DexPair 接口新增 source 字段。
- API：`/api/market/dex` 响应加入 source 字段。
- 采集器：DexScreenerCollector 拆分两种来源，分别打 dexscreener_boosted / dexscreener_search 标签。
- DB：Alembic 迁移 c3d4e5f6a789，DexVolume UniqueConstraint 加入 source 字段。
- 文档：新增 DEX 热门交易对来源分 Tab 设计文档与实现计划（`docs/superpowers/specs/2026-04-27-dex-tab-split-design.md`，`docs/superpowers/plans/2026-04-27-dex-tab-split.md`）。

- 后端：新增 `TelegramMessageLog` 模型与 Alembic 迁移 `f8a9b0c1d234`，并在 `alerting._send_telegram` 中按发送结果写入审计行（事件、标题、正文、脱敏 chat、Telegram `message_id`、`sent`/`failed` 及错误摘要）；库表写入失败仅记日志、不影响 TG 发送。落地需执行 `alembic upgrade head`。
- 后端 + 前端：新增 `GET /api/settings/telegram-logs` 分页/状态过滤接口，并在「设置」页加入「Telegram 发送记录」卡片（状态过滤、分页、点击展开正文/错误）；中英文文案同步补充。
- chore：`.gitignore` 把 `venv/` 改为 `venv*/`，覆盖 `venv_test/` 等命名变体，避免本地虚拟环境误入仓库。
- dev.sh：`start_backend` 启动前自动执行 `alembic upgrade head`（日志写入 `.pids/migrate.log`，失败仅警告不阻断启动）；新增 `./dev.sh migrate` 子命令用于按需手动迁移；帮助文本同步更新。
- 模型：`DexVolume` UniqueConstraint 加入 `source` 字段。
- DEX 面板：新增按价格、24h 交易量、流动性、交易笔数排序（点击表头切换列/升降序，默认按交易量降序）；表头与数据行拆分为独立 table，修复滚动条覆盖表头的问题；表头悬浮样式改用 accent 色调高亮。
- 后端：`DexVolume` 模型新增 `source` 字段（记录数据来源），`DexScreenerCollector` 写入 `"dexscreener"`，并生成对应 Alembic 迁移文件。

- 首页：「DEX 热门交易对」与「新闻动态」改为全断点纵向排列，不再在大屏并排。
- 市场概览：`market:overview` 缓存 TTL 按 `collect_interval_minutes` 延长，避免定时任务间隔内过期；缓存为空时由 API 带锁按需拉取 CoinGecko，并在进程启动后异步预热，修复重启后长时间无数据的问题。
- CEX OHLCV 默认交易对与周期改为环境变量 `CEX_DEFAULT_SYMBOLS`、`CEX_DEFAULT_TIMEFRAMES`（逗号分隔），经 `Settings` 注入 `CEXCollector`；`.env.example` 补充说明。
- AI 默认路由：主模型改为 `gpt-4o`（`OPENAI_API_KEY`），备用 `gemini/gemini-2.5-flash`（`GEMINI_API_KEY`）；`.env.example` 与 `ai_client` 注释同步，避免免费 Gemini 配额先被主路径耗尽。
- 纳入 `scripts/git-hooks/pre-commit`（非仅 changelog 的提交须暂存并更新 `changelog.md`）与 `scripts/setup-git-hooks.sh`；`dev.sh doctor` 检查 `core.hooksPath`，`CLAUDE.md` 说明首次克隆后启用方式；合并提交与 `SKIP_CHANGELOG=1` 可跳过校验。
