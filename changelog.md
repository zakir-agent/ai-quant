# Changelog

在每次提交前于本节追加一条简要记录（改了什么、为何改）。合并提交与 `SKIP_CHANGELOG=1` 会跳过钩子校验。

## 未发布

- CEX OHLCV 默认交易对与周期改为环境变量 `CEX_DEFAULT_SYMBOLS`、`CEX_DEFAULT_TIMEFRAMES`（逗号分隔），经 `Settings` 注入 `CEXCollector`；`.env.example` 补充说明。
- AI 默认路由：主模型改为 `gpt-4o`（`OPENAI_API_KEY`），备用 `gemini/gemini-2.5-flash`（`GEMINI_API_KEY`）；`.env.example` 与 `ai_client` 注释同步，避免免费 Gemini 配额先被主路径耗尽。
- 纳入 `scripts/git-hooks/pre-commit`（非仅 changelog 的提交须暂存并更新 `changelog.md`）与 `scripts/setup-git-hooks.sh`；`dev.sh doctor` 检查 `core.hooksPath`，`CLAUDE.md` 说明首次克隆后启用方式；合并提交与 `SKIP_CHANGELOG=1` 可跳过校验。
