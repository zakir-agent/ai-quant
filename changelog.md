# Changelog

在每次提交前于本节追加一条简要记录（改了什么、为何改）。合并提交与 `SKIP_CHANGELOG=1` 会跳过钩子校验。

## 未发布

- fix(ci): 修复 `ci-check.sh` 失败：Prettier 格式化 5 个前端文件；Ruff format 覆盖 7 个后端文件并 `--fix` 清理 Alembic migration 与 `settings.py` 的 import/类型规范；`engine.py` 满足 SIM103；`test_analysis_engine.py` 将 `assert False` 改为 `raise AssertionError` 以满足 B011；merge_heads migration 的 `down_revision` 注解改为 `str | tuple[str, ...] | None` 以匹配多父节点合并赋值。
- feat(analysis): AI 分析页顶部 Tab 币种改为读取 `AI_ANALYSIS_SYMBOLS`（新增 `GET /api/analysis/symbols`）；Tab 仅展示基础币种（去掉 `/` 后报价单位），请求仍用完整交易对 scope；`/api/analysis/run|latest|history` 的 query 对 scope 做 URL 编码；历史与详情保持左右分栏。
- fix(ai): 分析引擎在 AI 输出异常时不再写库：格式/Schema 校验失败直接抛错中断持久化；新增“语义空结果”拦截（summary、observations、recommendations、warnings、technical 均为空则拒绝写入），并补充回归测试覆盖异常与空结果场景。
- fix(frontend): 修复 PR#19 review 问题：移除 layout.tsx 中违反 App Router 约定的手动 `<head>` 标签（改为 `<body>` 顶部内联脚本）；analysis-helpers.ts 静态映射提升为模块级常量、actionLabel 改用 switch 避免冗余 `t()` 调用；移除 news/page.tsx 中无用的 AnalysisDetail 接口；收窄 ApiError.body 类型为 `Record<string, unknown> | string`。
- feat(news): 新闻动态页由手动翻页改为滚动到底自动加载（IntersectionObserver），并将页面改为单屏容器+内部滚动，避免整体页面超出一屏。
- feat(settings): 设置页新增独立「告警通知」Tab；Telegram 发送记录默认展开，并由手动分页改为滚动到底自动加载，保留筛选与刷新能力，减少查看通知历史的操作成本。
- feat(settings): AI 使用量改为市场分析与新闻分析拆分展示，新增总配额进度与超限提示；后端将新闻分析 token/cost 持久化并纳入今日成本统计，同时把每日 AI 限额统一为市场+新闻共用配额。
- feat(settings): 设置页补充新闻 AI 相关可见性：数据统计新增“新闻分析”总量与最近时间，采集调度新增“AI 新闻分析间隔”；同时修复中文“重试”按钮乱码文案。
- refactor(frontend): 前端代码质量改进：WebSocket 重连添加指数退避（最多 10 次）和消息验证；完善订阅管理（组件卸载时发送 unsubscribe）；新增 ApiError 类改进错误处理；提取重复分析辅助函数到 analysis-helpers.ts；修复 ErrorBlock 国际化（retryLabel 默认值）；修复 Dashboard ref 使用不当；完善国际化（HTML lang 动态更新、日期格式跟随 locale、Sidebar 切换语言 title）；修复主题切换闪烁（内联脚本预设置）；统一 news/page.tsx 类型定义（使用导出的 NewsAnalysisDetail）。

- refactor(ai): 移除 `AI_FAST_MODEL` 配置项；新闻结构化分析改用 `AI_PRIMARY_MODEL`，`max_tokens` 从 4096 提升到 16384，避免批量长文章被截断。同步移除前端设置页「快速模型」展示和 i18n 文案。
- fix: 设置页「数据统计」卡片栅格从 5 列改为 3 列，与当前 3 个指标项对齐，避免多余空列。
- feat: Market 页新增 DEX 交易量趋势图和 DeFi TVL 趋势图。后端新增 `/api/market/dex/history` 和 `/api/market/defi/history` 时序端点；前端用 lightweight-charts LineSeries 展示 Top 5 交易对/协议多线叠加，支持 7d/30d/90d 切换。
- fix: 新闻 AI 分析管道产能不足（大量文章无分析结果）。调整默认参数（batch 30→50, interval 30min→15min）；新增失败重试机制（attempt 编码在 error 字段，最多 3 次，间隔 30min）；新增积压追赶循环（每次调度最多处理 5 批次 250 篇）；`_insert_done` 改用 upsert 确保重试成功可覆盖旧失败行。
- feat: K 线细粒度数据支持（1m/5m/15m）。WebSocket 实时 K 线持久化入库（零 API 消耗）；1m→5m/15m 本地聚合引擎；共享 Binance 限频器（600 weight/min 预算）；CEX 采集器加每请求 sleep；历史回填脚本 `python -m app.scripts.backfill_klines`；前端 MultiTimeframeChart 支持 6 个周期自由选择（最多同时展示 3 个）；1m 数据独立 14 天保留策略。
- fix: AI 分析报错「返回格式异常」：OpenRouter/Claude 不支持 json_schema response_format，降级后模型无法得知期望结构。在 system prompt 中内联完整 JSON schema 描述，确保任何 format 降级场景下模型都能输出正确结构。prompt 版本升级到 v6。
- refactor: 提取后端硬编码配置到 Settings 类（config.py 新增 ~20 字段）。涉及 collectors（futures、dexscreener、news、fear_greed、cex）、services（ws_manager、data_aggregator、cache、accuracy_tracker）、database、scheduler。所有值通过 .env 即可覆盖，零行为变更。
- 新增本地 CI 预检脚本 `scripts/ci-check.sh`，覆盖前端 lint/format/build 和后端 ruff/pyright/pytest，提交前运行可避免 CI 失败。修复 `.python-version` 版本号（3.12.3 → 3.11.9）与实际 venv 不一致的问题。移除 `scripts/git-hooks/` 和 `scripts/setup-git-hooks.sh`，改用 Claude hooks 在提交时自动运行 CI 检查。
- 重构设置页面：将 750 行单文件拆分为 8 个独立组件（AiModelCard、AiUsageCard、DataSourcesCard、CollectionScheduleCard、AlertingCard、DataStatisticsCard、DataIntegrityCard、SchedulerJobsCard）+ shared 工具模块，页面容器精简至 ~100 行；新增 AI/数据 分组标题和 info banner 布局优化
- 设置页面宽度从 `max-w-4xl` 调整为 `max-w-7xl`，与其他页面保持一致；移除顶部 .env 配置提示 banner

- 移除 API_SECRET_KEY 认证机制：删除后端 `verify_api_key` 中间件、`APIKeyHeader` 导入、`config.py` 中的 `api_secret_key` 字段，移除前端 `X-API-Key` header 注入，清理 `.env.example`。CORS 私网 Origin 放宽改为始终生效。个人本地项目无需接口认证。

- 完善 CLAUDE.md：新增架构概览（后端分层、AI 管道、采集器模式、数据库表结构、前端状态管理等），补充常用开发命令
- 清理历史设计文档：移除 `docs/superpowers/` 目录（已完成的系统设计、CD、DEX 分 Tab 等规划文档）。
- 修复 CI 格式化失败：修复 ruff import 排序（accuracy_tracker.py）、ruff 格式化（10 个后端文件）、prettier 格式化（5 个前端文件）和 Pyright 类型检查错误（accuracy_tracker.py、ai_client.py、data_aggregator.py）。
- 修复 AI Analysis collector 因 SQLAlchemy 并发操作错误持续失败的问题：`data_aggregator.py` 中 HTTP 调用保持并发，DB 查询改为顺序执行，避免同一 session 上的 concurrent-op 异常。
- 修复 collector 告警重复发送：`collector_health.py` 中告警触发条件从 `>=` 改为 `==`，每个失败事件只发送一次告警（之前每个 cooldown 周期都会重复发送）。
- AI Analysis 告警合并：5 个独立 scope 的失败告警合并为一条汇总消息，避免同时收到 5 条相同错误的通知。
- 从仪表盘移除 DEX 热门交易对和 DeFi TVL 排名面板；从市场页移除 K 线图和市场概览 tab，市场页仅保留 DEX 和 DeFi。
- 新闻前端重新设计：
  - 新增 `GET /api/news/signals` 端点：按 primary_asset 聚合 24h 方向信号，返回 top 8 资产的 direction/weighted_score/avg_intensity。
  - 仪表盘 NewsPanel 重构：顶部新增聚合信号条（BTC/ETH/SOL 等资产方向卡片），点击跳转 /news 页面；新闻卡片精简为方向+事件+中文摘要。
  - 新增独立 `/news` 页面：master-detail 布局，左侧新闻列表（增强版卡片，含方向/事件/时间跨度/强度/中文摘要），右侧完整分析详情（置信度、原文引用、涉及资产标签、tags）。
  - 侧边栏新增"新闻动态"导航项。
  - 前端 NewsAnalysisBrief 接口新增 magnitude/confidence/primary_asset/is_actionable 字段；新增 NewsSignal 接口和 getNewsSignals()/getNewsAnalysis() API 函数。
- 新闻 AI 结构化分析（进阶版）：
  - 新增 news_analysis 表（迁移 b2c3d4e5f6a7），按 (news_id, prompt_version) 唯一，存储 direction/magnitude/confidence/event_type/time_horizon/intensity/relevance/tags/raw_quote/summary_zh 等结构化标签。
  - app/analysis/news_schemas.py + news_prompts.py：用 Pydantic + LiteLLM json_schema 强约束，批量分析喂便宜的 ai_fast_model（默认 gpt-4o-mini），成本远低于全量市场分析。
  - services/news_analyzer.py：批量取未分析新闻 → AI → 入库；状态机 done/failed/skipped；ON CONFLICT DO NOTHING 防并发重复。
  - 调度作业 news_analyzer 复用 news_sentiment_interval_minutes 节奏，挂 collector_health 跟踪。
  - API：GET /api/news/{id}/analysis、GET /api/news/aggregate?asset=&hours=、POST /api/news/analyze（手动触发）。
  - 市场分析引擎接入：snapshot 加 news_signal（24h 加权）字段，prompts 升到 v5；单币种快照按 base 过滤。
  - accuracy_tracker：对新闻信号做 24h 回评，结果写入 news_analysis.accuracy，并入滚动 stats。
  - 前端 NewsPanel 每条加方向/事件/时间跨度/情绪强度 4 个角标；i18n 同步。
- AI 分析模块重构：
  - **数据库**：`analysis_report` 新增 `key_observations / risk_warnings / technical_analysis / accuracy` 四个独立 JSON 列（迁移 `a1b2c3d4e5f6`），从 `data_sources` JSON 中迁出，解决「跑出来但没存」与字段语义混乱问题。
  - **输出契约**：新增 `app/analysis/schemas.py`（Pydantic `AnalysisOutput / Recommendation / TechnicalAnalysis`），`prompts.py` 不再用文本模板约束 JSON shape；`ai_client.ai_completion` 支持 `json_schema → json_object → 文本` 的逐级降级 `response_format`，并新增 `AIError`。
  - **数据聚合**：`data_aggregator` 按数据源拆函数，复用单一 session、用 `asyncio.gather` 并发取数；`SYMBOL_TIMEFRAMES` / `KEY_PAIRS` 常量化。
  - **引擎分层**：`engine.run_analysis` 拆为 `_assert_under_daily_limit / _collect_snapshot / _build_messages / _coerce_output / _persist_report`，全部无副作用单步可测。
  - **API**：抽出 `serializers.report_to_dict` 作为返回结构唯一来源；`/run` 在配额超限/AI 异常时返回 429 / 502 而非裸 500。
  - **准确率**：`accuracy_tracker` 写入独立 `accuracy` 列，旧 `data_sources.accuracy_*` 在迁移中自动回填到新列。
  - **Scope**：新增 `AI_ANALYSIS_SYMBOLS` 配置，定时任务可在市场全局之外按 symbol 多跑几次单币种深度分析。
  - **前端**：`AnalysisReport` 接口新增 `prompt_version / accuracy`，详情页展示 `key_observations / risk_warnings / accuracy`；`zh/en` 新增 `analysis.keyObservations / accuracy*` 文案。
- 市场概览币种改为配置驱动：新增 `COINGECKO_COIN_IDS` 并将默认列表替换为 HYPE（移除 DOT）；首页 ticker 订阅改为随市场概览币种动态生成，后端 Binance WS 订阅也从该配置派生，同时修复后端应用日志输出，便于排查实时行情问题。
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
- 新闻面板：按来源分「全部 / RSS / NewsAPI」三个 Tab 展示。后端 `/api/news/latest` 支持 `source_group` 查询参数（`all/rss/newsapi`），DB 端按 source 字段过滤；前端 `NewsPanel` 切非 all Tab 时按需 fetch 对应分组并缓存，切回 all 复用首屏数据；`zh.json/en.json` 同步提供 `news.tabAll/tabRss/tabNewsapi` 文案。
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
- DEX 面板表格体验优化：新增序号列并调整列宽，表头改为 sticky 以便滚动时持续可见；右对齐列的排序箭头移到左侧统一视觉，交易对/链/DEX 文本添加截断与 hover title，提升可读性。
- 后端：`DexVolume` 模型新增 `source` 字段（记录数据来源），`DexScreenerCollector` 写入 `"dexscreener"`，并生成对应 Alembic 迁移文件。

- 首页：「DEX 热门交易对」与「新闻动态」改为全断点纵向排列，不再在大屏并排。
- 市场概览：`market:overview` 缓存 TTL 按 `collect_interval_minutes` 延长，避免定时任务间隔内过期；缓存为空时由 API 带锁按需拉取 CoinGecko，并在进程启动后异步预热，修复重启后长时间无数据的问题。
- CEX OHLCV 默认交易对与周期改为环境变量 `CEX_DEFAULT_SYMBOLS`、`CEX_DEFAULT_TIMEFRAMES`（逗号分隔），经 `Settings` 注入 `CEXCollector`；`.env.example` 补充说明。
- AI 默认路由：主模型改为 `gpt-4o`（`OPENAI_API_KEY`），备用 `gemini/gemini-2.5-flash`（`GEMINI_API_KEY`）；`.env.example` 与 `ai_client` 注释同步，避免免费 Gemini 配额先被主路径耗尽。
- 纳入 `scripts/git-hooks/pre-commit`（非仅 changelog 的提交须暂存并更新 `changelog.md`）与 `scripts/setup-git-hooks.sh`；`dev.sh doctor` 检查 `core.hooksPath`，`CLAUDE.md` 说明首次克隆后启用方式；合并提交与 `SKIP_CHANGELOG=1` 可跳过校验。
