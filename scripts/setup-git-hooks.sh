#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
git config core.hooksPath scripts/git-hooks
echo "已设置 core.hooksPath=scripts/git-hooks（本仓库）"
