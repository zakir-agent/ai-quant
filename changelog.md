# Changelog

在每次提交前于本节追加一条简要记录（改了什么、为何改）。合并提交与 `SKIP_CHANGELOG=1` 会跳过钩子校验。

## 未发布

- 采集器：DexScreenerCollector 拆分两种来源，分别打 dexscreener_boosted / dexscreener_search 标签。
- DB：Alembic 迁移 c3d4e5f6a789，DexVolume UniqueConstraint 加入 source 字段。
- 文档：新增 DEX 热门交易对来源分 Tab 设计文档与实现计划（`docs/superpowers/specs/2026-04-27-dex-tab-split-design.md`，`docs/superpowers/plans/2026-04-27-dex-tab-split.md`）。

- 后端：新增 `TelegramMessageLog` 模型与 Alembic 迁移 `f8a9b0c1d234`，并在 `alerting._send_telegram` 中按发送结果写入审计行（事件、标题、正文、脱敏 chat、Telegram `message_id`、`sent`/`failed` 及错误摘要）；库表写入失败仅记日志、不影响 TG 发送。落地需执行 `alembic upgrade head`。
- 模型：`DexVolume` UniqueConstraint 加入 `source` 字段。
- DEX 面板：新增按价格、24h 交易量、流动性、交易笔数排序（点击表头切换列/升降序，默认按交易量降序）；表头与数据行拆分为独立 table，修复滚动条覆盖表头的问题；表头悬浮样式改用 accent 色调高亮。
- 后端：`DexVolume` 模型新增 `source` 字段（记录数据来源），`DexScreenerCollector` 写入 `"dexscreener"`，并生成对应 Alembic 迁移文件。

- 首页：「DEX 热门交易对」与「新闻动态」改为全断点纵向排列，不再在大屏并排。
- 市场概览：`market:overview` 缓存 TTL 按 `collect_interval_minutes` 延长，避免定时任务间隔内过期；缓存为空时由 API 带锁按需拉取 CoinGecko，并在进程启动后异步预热，修复重启后长时间无数据的问题。
- CEX OHLCV 默认交易对与周期改为环境变量 `CEX_DEFAULT_SYMBOLS`、`CEX_DEFAULT_TIMEFRAMES`（逗号分隔），经 `Settings` 注入 `CEXCollector`；`.env.example` 补充说明。
- AI 默认路由：主模型改为 `gpt-4o`（`OPENAI_API_KEY`），备用 `gemini/gemini-2.5-flash`（`GEMINI_API_KEY`）；`.env.example` 与 `ai_client` 注释同步，避免免费 Gemini 配额先被主路径耗尽。
- 纳入 `scripts/git-hooks/pre-commit`（非仅 changelog 的提交须暂存并更新 `changelog.md`）与 `scripts/setup-git-hooks.sh`；`dev.sh doctor` 检查 `core.hooksPath`，`CLAUDE.md` 说明首次克隆后启用方式；合并提交与 `SKIP_CHANGELOG=1` 可跳过校验。
