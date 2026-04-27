# Changelog

在每次提交前于本节追加一条简要记录（改了什么、为何改）。合并提交与 `SKIP_CHANGELOG=1` 会跳过钩子校验。

## 未发布

- AI 默认路由：主模型改为 `gpt-4o`（`OPENAI_API_KEY`），备用 `gemini/gemini-2.5-flash`（`GEMINI_API_KEY`）；`.env.example` 与 `ai_client` 注释同步，避免免费 Gemini 配额先被主路径耗尽。
- 增加提交前变更记录约定：根目录 `changelog.md`、可版本管理的 `scripts/git-hooks/pre-commit`（暂存非 changelog 的改动时要求同步更新并暂存 `changelog.md`）、`scripts/setup-git-hooks.sh` 安装 `core.hooksPath`，`dev.sh doctor` 与 `CLAUDE.md` 补充说明；合并提交与 `SKIP_CHANGELOG=1` 可跳过校验。
