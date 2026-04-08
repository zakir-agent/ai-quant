#!/usr/bin/env bash
set -euo pipefail

# AI Quant 本地开发服务管理脚本
# 用法: ./dev.sh {start|stop|restart|restart-full|status|logs|doctor}

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
PID_DIR="$PROJECT_DIR/.pids"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

mkdir -p "$PID_DIR"

log()  { echo -e "${CYAN}[dev]${NC} $1"; }
ok()   { echo -e "${GREEN}  ✓${NC} $1"; }
warn() { echo -e "${YELLOW}  !${NC} $1"; }
err()  { echo -e "${RED}  ✗${NC} $1"; }

env_has_value() {
    local key="$1"
    local env_file="$2"
    if command -v rg >/dev/null 2>&1; then
        rg -q "^${key}=.+$" "$env_file"
    else
        grep -Eq "^${key}=.+$" "$env_file"
    fi
}

is_running() {
    local pidfile="$PID_DIR/$1.pid"
    if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
        return 0
    fi
    return 1
}

get_pid() {
    cat "$PID_DIR/$1.pid" 2>/dev/null || echo ""
}

# ---------- PostgreSQL ----------
start_postgres() {
    if brew services list | grep -q "postgresql.*started"; then
        ok "PostgreSQL 已在运行"
    else
        log "启动 PostgreSQL..."
        brew services start postgresql@17
        ok "PostgreSQL 已启动"
    fi
}

stop_postgres() {
    if brew services list | grep -q "postgresql.*started"; then
        log "停止 PostgreSQL..."
        brew services stop postgresql@17
        ok "PostgreSQL 已停止"
    else
        warn "PostgreSQL 未在运行"
    fi
}

# ---------- Redis ----------
start_redis() {
    if brew services list | grep -q "redis.*started"; then
        ok "Redis 已在运行"
    else
        log "启动 Redis..."
        brew services start redis
        ok "Redis 已启动"
    fi
}

stop_redis() {
    if brew services list | grep -q "redis.*started"; then
        log "停止 Redis..."
        brew services stop redis
        ok "Redis 已停止"
    else
        warn "Redis 未在运行"
    fi
}

# ---------- Backend ----------
start_backend() {
    if is_running backend; then
        ok "Backend 已在运行 (PID $(get_pid backend))"
        return
    fi
    log "启动 Backend (FastAPI)..."
    cd "$BACKEND_DIR"
    source venv/bin/activate
    nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload \
        > "$PID_DIR/backend.log" 2>&1 &
    echo $! > "$PID_DIR/backend.pid"
    sleep 2
    if is_running backend; then
        ok "Backend 已启动 (PID $(get_pid backend)) → http://localhost:8000"
    else
        err "Backend 启动失败，查看日志: $PID_DIR/backend.log"
    fi
    cd "$PROJECT_DIR"
}

stop_backend() {
    if is_running backend; then
        log "停止 Backend..."
        kill "$(get_pid backend)" 2>/dev/null
        # 也清理子进程
        pkill -f "uvicorn app.main" 2>/dev/null || true
        rm -f "$PID_DIR/backend.pid"
        ok "Backend 已停止"
    else
        warn "Backend 未在运行"
        pkill -f "uvicorn app.main" 2>/dev/null || true
        rm -f "$PID_DIR/backend.pid"
    fi
}

# ---------- Frontend ----------
start_frontend() {
    if is_running frontend; then
        ok "Frontend 已在运行 (PID $(get_pid frontend))"
        return
    fi
    log "启动 Frontend (Next.js)..."
    cd "$FRONTEND_DIR"
    nohup npm run dev > "$PID_DIR/frontend.log" 2>&1 &
    echo $! > "$PID_DIR/frontend.pid"
    sleep 3
    if is_running frontend; then
        ok "Frontend 已启动 (PID $(get_pid frontend)) → http://localhost:3000"
    else
        err "Frontend 启动失败，查看日志: $PID_DIR/frontend.log"
    fi
    cd "$PROJECT_DIR"
}

stop_frontend() {
    if is_running frontend; then
        log "停止 Frontend..."
        kill "$(get_pid frontend)" 2>/dev/null
        pkill -f "next dev" 2>/dev/null || true
        rm -f "$PID_DIR/frontend.pid"
        ok "Frontend 已停止"
    else
        warn "Frontend 未在运行"
        pkill -f "next dev" 2>/dev/null || true
        rm -f "$PID_DIR/frontend.pid"
    fi
}

# ---------- 组合命令 ----------
cmd_start() {
    echo ""
    log "启动所有服务..."
    echo ""
    start_postgres
    start_redis
    start_backend
    start_frontend
    echo ""
    log "全部就绪！"
    echo "  Backend  → http://localhost:8000"
    echo "  Frontend → http://localhost:3000"
    echo ""
}

cmd_stop() {
    echo ""
    log "停止所有服务..."
    echo ""
    stop_frontend
    stop_backend
    stop_redis
    stop_postgres
    echo ""
    log "全部已停止"
    echo ""
}

# 仅重启应用进程（不碰 PostgreSQL / Redis，日常改代码用这个）
cmd_restart() {
    local target="${1:-all}"
    echo ""
    case "$target" in
        all)
            log "重启 Backend / Frontend（保持 PostgreSQL、Redis 不变）..."
            echo ""
            stop_frontend
            stop_backend
            sleep 1
            start_backend
            start_frontend
            echo ""
            log "应用已重启"
            echo "  Backend  → http://localhost:8000"
            echo "  Frontend → http://localhost:3000"
            ;;
        backend|be)
            log "仅重启 Backend（保持 Frontend、PostgreSQL、Redis 不变）..."
            echo ""
            stop_backend
            sleep 1
            start_backend
            echo ""
            log "Backend 已重启"
            echo "  Backend  → http://localhost:8000"
            ;;
        frontend|fe)
            log "仅重启 Frontend（保持 Backend、PostgreSQL、Redis 不变）..."
            echo ""
            stop_frontend
            sleep 1
            start_frontend
            echo ""
            log "Frontend 已重启"
            echo "  Frontend → http://localhost:3000"
            ;;
        *)
            err "未知重启目标: $target"
            echo "用法: $0 restart [backend|frontend]"
            echo "  别名: be=backend, fe=frontend"
            return 1
            ;;
    esac
    echo ""
}

# 全量重启（含 PostgreSQL、Redis），与原先 restart 行为一致
cmd_restart_full() {
    cmd_stop
    sleep 1
    cmd_start
}

cmd_status() {
    echo ""
    log "服务状态:"
    echo ""

    # PostgreSQL
    if brew services list | grep -q "postgresql.*started"; then
        ok "PostgreSQL     运行中"
    else
        err "PostgreSQL     未运行"
    fi

    # Redis
    if brew services list | grep -q "redis.*started"; then
        ok "Redis          运行中"
    else
        err "Redis          未运行"
    fi

    # Backend
    if is_running backend; then
        ok "Backend        运行中 (PID $(get_pid backend)) → :8000"
    else
        err "Backend        未运行"
    fi

    # Frontend
    if is_running frontend; then
        ok "Frontend       运行中 (PID $(get_pid frontend)) → :3000"
    else
        err "Frontend       未运行"
    fi

    # Health check
    echo ""
    if curl -s --max-time 2 http://localhost:8000/health > /dev/null 2>&1; then
        ok "Backend Health Check 通过"
    else
        warn "Backend Health Check 不可达"
    fi
    echo ""
}

cmd_logs() {
    local service="${1:-}"
    case "$service" in
        backend|be)
            tail -f "$PID_DIR/backend.log"
            ;;
        frontend|fe)
            tail -f "$PID_DIR/frontend.log"
            ;;
        *)
            echo "用法: $0 logs {backend|frontend}"
            echo "  别名: be=backend, fe=frontend"
            ;;
    esac
}

cmd_doctor() {
    echo ""
    log "开发环境诊断 (doctor):"
    echo ""

    # Toolchain
    if command -v python3 >/dev/null 2>&1; then
        ok "Python3        $(python3 --version 2>&1)"
    else
        err "Python3        未安装"
    fi

    if command -v node >/dev/null 2>&1; then
        ok "Node.js        $(node --version 2>&1)"
    else
        err "Node.js        未安装"
    fi

    if command -v npm >/dev/null 2>&1; then
        ok "npm            $(npm --version 2>&1)"
    else
        err "npm            未安装"
    fi

    # Project prerequisites
    if [ -f "$BACKEND_DIR/venv/bin/activate" ]; then
        ok "Backend venv   已找到 ($BACKEND_DIR/venv)"
    else
        warn "Backend venv   未找到，建议: cd backend && python3 -m venv venv"
    fi

    if [ -d "$FRONTEND_DIR/node_modules" ]; then
        ok "Frontend deps  已安装 (node_modules 存在)"
    else
        warn "Frontend deps  未安装，建议: cd frontend && npm install"
    fi

    if [ -f "$PROJECT_DIR/.env" ]; then
        ok ".env 文件      已存在"
        if env_has_value "DATABASE_URL" "$PROJECT_DIR/.env"; then
            ok "DATABASE_URL   已配置"
        else
            warn "DATABASE_URL   缺失或为空"
        fi
        if env_has_value "API_SECRET_KEY" "$PROJECT_DIR/.env"; then
            ok "API_SECRET_KEY 已配置"
        else
            warn "API_SECRET_KEY 缺失或为空"
        fi
    else
        err ".env 文件      未找到，建议: cp .env.example .env"
    fi

    # Service availability
    if command -v brew >/dev/null 2>&1; then
        if brew services list | grep -q "postgresql.*started"; then
            ok "PostgreSQL     brew service 运行中"
        else
            warn "PostgreSQL     brew service 未运行"
        fi

        if brew services list | grep -q "redis.*started"; then
            ok "Redis          brew service 运行中"
        else
            warn "Redis          brew service 未运行 (可选)"
        fi
    else
        warn "brew            未检测到，跳过 brew service 检查"
    fi

    if command -v nc >/dev/null 2>&1 && nc -z localhost 5432 >/dev/null 2>&1; then
        ok "端口 5432       可连接"
    else
        warn "端口 5432       不可连接"
    fi

    if command -v nc >/dev/null 2>&1 && nc -z localhost 6379 >/dev/null 2>&1; then
        ok "端口 6379       可连接"
    else
        warn "端口 6379       不可连接 (可选)"
    fi

    echo ""
}

# ---------- 入口 ----------
case "${1:-}" in
    start)   cmd_start ;;
    stop)    cmd_stop ;;
    restart) cmd_restart "${2:-}" ;;
    restart-full) cmd_restart_full ;;
    status)  cmd_status ;;
    logs)    cmd_logs "${2:-}" ;;
    doctor)  cmd_doctor ;;
    *)
        echo ""
        echo "AI Quant 本地开发服务管理"
        echo ""
        echo "用法: $0 <command>"
        echo ""
        echo "命令:"
        echo "  start         启动所有服务 (PostgreSQL, Redis, Backend, Frontend)"
        echo "  stop          停止所有服务"
        echo "  restart       重启应用服务（默认 Backend+Frontend，可指定 backend/frontend）"
        echo "  restart-full  重启全部（含 PostgreSQL、Redis）"
        echo "  status        查看所有服务状态"
        echo "  logs          查看日志 (backend|frontend)"
        echo "  doctor        检查本地开发环境依赖与配置"
        echo ""
        echo "示例:"
        echo "  $0 start          # 一键启动"
        echo "  $0 status         # 查看状态"
        echo "  $0 doctor         # 环境快速体检"
        echo "  $0 restart backend # 仅重启后端"
        echo "  $0 logs backend   # 查看后端日志"
        echo "  $0 stop           # 一键停止"
        echo ""
        ;;
esac
