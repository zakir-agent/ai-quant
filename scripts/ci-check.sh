#!/usr/bin/env bash
# 本地预检脚本 — 覆盖 CI 中的所有检查
# 用法: ./scripts/ci-check.sh [frontend|backend|all]
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FAILED=0

pass() { echo -e "  ${GREEN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; FAILED=1; }
skip() { echo -e "  ${YELLOW}~${NC} $1 (skipped)"; }

run_frontend() {
  echo -e "\n${YELLOW}=== Frontend Checks ===${NC}"
  cd "$PROJECT_DIR/frontend"

  echo "  prettier..."
  if npx prettier --check . >/dev/null 2>&1; then
    pass "prettier format"
  else
    fail "prettier format (run: npx prettier --write .)"
  fi

  echo "  eslint..."
  if npm run lint >/dev/null 2>&1; then
    pass "eslint lint"
  else
    fail "eslint lint"
  fi

  echo "  build..."
  if npm run build >/dev/null 2>&1; then
    pass "next build"
  else
    fail "next build"
  fi
}

run_backend() {
  echo -e "\n${YELLOW}=== Backend Checks ===${NC}"
  cd "$PROJECT_DIR/backend"

  if ! command -v ruff >/dev/null 2>&1; then
    fail "ruff not found — run: pip install ruff"
    return
  fi

  local PYTHON="$PROJECT_DIR/backend/venv/bin/python"

  echo "  ruff check..."
  if ruff check . >/dev/null 2>&1; then
    pass "ruff check"
  else
    fail "ruff check"
  fi

  echo "  ruff format..."
  if ruff format --check . >/dev/null 2>&1; then
    pass "ruff format"
  else
    fail "ruff format (run: ruff format .)"
  fi

  if command -v pyright >/dev/null 2>&1; then
    echo "  pyright..."
    if pyright >/dev/null 2>&1; then
      pass "pyright type check"
    else
      fail "pyright type check"
    fi
  else
    skip "pyright (not installed)"
  fi

  echo "  pytest..."
  if "$PYTHON" -m pytest -q >/dev/null 2>&1; then
    pass "pytest"
  else
    fail "pytest"
  fi
}

TARGET="${1:-all}"
case "$TARGET" in
  frontend) run_frontend ;;
  backend)  run_backend ;;
  all)      run_frontend; run_backend ;;
  *)        echo "Usage: $0 [frontend|backend|all]"; exit 1 ;;
esac

echo ""
if [ "$FAILED" -eq 0 ]; then
  echo -e "${GREEN}All checks passed! Safe to push.${NC}"
else
  echo -e "${RED}Some checks failed. Fix before pushing.${NC}"
  exit 1
fi
