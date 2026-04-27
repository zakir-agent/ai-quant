# Changelog

在每次提交前于本节追加一条简要记录（改了什么、为何改）。合并提交与 `SKIP_CHANGELOG=1` 会跳过钩子校验。

## 未发布

- 首页：「DEX 热门交易对」与「新闻动态」改为全断点纵向排列，不再在大屏并排。
- 市场概览：`market:overview` 缓存 TTL 按 `collect_interval_minutes` 延长，避免定时任务间隔内过期；缓存为空时由 API 带锁按需拉取 CoinGecko，并在进程启动后异步预热，修复重启后长时间无数据的问题。
- CEX OHLCV 默认交易对与周期改为环境变量 `CEX_DEFAULT_SYMBOLS`、`CEX_DEFAULT_TIMEFRAMES`（逗号分隔），经 `Settings` 注入 `CEXCollector`；`.env.example` 补充说明。
- AI 默认路由：主模型改为 `gpt-4o`（`OPENAI_API_KEY`），备用 `gemini/gemini-2.5-flash`（`GEMINI_API_KEY`）；`.env.example` 与 `ai_client` 注释同步，避免免费 Gemini 配额先被主路径耗尽。
- 纳入 `scripts/git-hooks/pre-commit`（非仅 changelog 的提交须暂存并更新 `changelog.md`）与 `scripts/setup-git-hooks.sh`；`dev.sh doctor` 检查 `core.hooksPath`，`CLAUDE.md` 说明首次克隆后启用方式；合并提交与 `SKIP_CHANGELOG=1` 可跳过校验。
