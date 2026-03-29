# CI/CD Pipeline Design

## CI — `.github/workflows/ci.yml`

**Trigger:** PR 和 push 到 `main`

**Frontend job:**
- Node 20, working directory `frontend/`
- `npm ci` → `npm run lint` → `npm run format:check` → `npm run build`

**Backend job:**
- Python 3.12, working directory `backend/`
- `pip install -r requirements.txt` + `pip install ruff pyright`
- `ruff check .` → `ruff format --check .` → `pyright`

两个 job 并行执行。

## CD — `.github/workflows/release.yml`

**Trigger:** push `v*` tag

- 构建 backend 和 frontend 两个 Docker 镜像
- 推送到 `ghcr.io/<owner>/ai-quant-backend` 和 `ghcr.io/<owner>/ai-quant-frontend`
- 镜像 tag：版本号 (e.g. `v1.0.0`) + `latest`
- 使用 `GITHUB_TOKEN` 认证，无需额外 secrets

## 额外文件变更

- `backend/ruff.toml` — ruff lint + format 配置 (target Python 3.12, 88 line width)
- `pyrightconfig.json` — 更新 pythonVersion 到 3.12，typeCheckingMode 设为 basic
