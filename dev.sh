#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PY=""

# --- Prerequisite checks ---

check_python() {
  # Try candidates in order: python3 from PATH, then common Homebrew locations
  local candidates=()
  command -v python3 &>/dev/null && candidates+=($(command -v python3))
  command -v python &>/dev/null && candidates+=($(command -v python))
  [ -x /opt/homebrew/bin/python3 ] && candidates+=(/opt/homebrew/bin/python3)
  [ -x /usr/local/bin/python3 ] && candidates+=(/usr/local/bin/python3)

  PY=""
  for candidate in "${candidates[@]}"; do
    local VER MAJOR MINOR
    VER=$("$candidate" --version 2>&1 | awk '{print $2}')
    MAJOR=$(echo "$VER" | cut -d. -f1)
    MINOR=$(echo "$VER" | cut -d. -f2)
    if [ "$MAJOR" -ge 3 ] && { [ "$MAJOR" -gt 3 ] || [ "$MINOR" -ge 10 ]; }; then
      PY="$candidate"
      return 0
    fi
  done

  if [ -z "$PY" ]; then
    if [ ${#candidates[@]} -gt 0 ]; then
      local VER
      VER=$("${candidates[0]}" --version 2>&1 | awk '{print $2}')
      echo "[ERROR] Python 3.10+ required, found $VER"
    else
      echo "[ERROR] Python is not installed or not on PATH."
    fi
    echo ""
    echo "  macOS:   brew install python@3.12"
    echo "  Ubuntu:  sudo apt install python3 python3-pip python3-venv"
    echo "  Or download from https://www.python.org/downloads/"
    return 1
  fi
}

check_node() {
  if ! command -v node &>/dev/null; then
    echo "[ERROR] Node.js is not installed or not on PATH."
    echo ""
    echo "  macOS:   brew install node@22"
    echo "  Ubuntu:  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install nodejs"
    echo "  Or download from https://nodejs.org/"
    return 1
  fi
  local VER
  VER=$(node --version | tr -d 'v')
  local MAJOR
  MAJOR=$(echo "$VER" | cut -d. -f1)
  if [ "$MAJOR" -lt 18 ]; then
    echo "[ERROR] Node.js 18+ required, found v$VER"
    return 1
  fi
}

check_npm() {
  if ! command -v npm &>/dev/null; then
    echo "[ERROR] npm not found. It should come with Node.js."
    return 1
  fi
}

check_all() {
  check_python
  check_node
  check_npm
}

ensure_venv() {
  check_python
  if [ ! -f "$ROOT_DIR/.venv/bin/python" ]; then
    echo "    Creating virtual environment (.venv/)..."
    "$PY" -m venv "$ROOT_DIR/.venv"
  fi
  PY="$ROOT_DIR/.venv/bin/python"
}

# --- Process management ---

kill_existing() {
  local killed=false
  # Kill processes on backend port 8080
  if command -v lsof &>/dev/null; then
    local pids
    pids=$(lsof -ti:8080 2>/dev/null || true)
    if [ -n "$pids" ]; then
      echo "    Killing existing process(es) on port 8080: $pids"
      echo "$pids" | xargs kill 2>/dev/null || true
      killed=true
    fi
    pids=$(lsof -ti:5173 2>/dev/null || true)
    if [ -n "$pids" ]; then
      echo "    Killing existing process(es) on port 5173: $pids"
      echo "$pids" | xargs kill 2>/dev/null || true
      killed=true
    fi
  elif command -v fuser &>/dev/null; then
    if fuser 8080/tcp &>/dev/null 2>&1; then
      echo "    Killing existing process(es) on port 8080"
      fuser -k 8080/tcp &>/dev/null 2>&1 || true
      killed=true
    fi
    if fuser 5173/tcp &>/dev/null 2>&1; then
      echo "    Killing existing process(es) on port 5173"
      fuser -k 5173/tcp &>/dev/null 2>&1 || true
      killed=true
    fi
  fi
  if [ "$killed" = true ]; then
    sleep 1
  fi
}

# --- Commands ---

cmd_doctor() {
  echo "=== HMI Development Environment Check ==="
  echo ""

  # Python
  if command -v python3 &>/dev/null || command -v python &>/dev/null; then
    local PY
    PY=$(command -v python3 || command -v python)
    echo "[ OK ] $($PY --version 2>&1)"
  else
    echo "[FAIL] Python        not found"
    echo "       macOS: brew install python@3.12"
    echo "       Ubuntu: sudo apt install python3 python3-pip"
  fi

  # pip
  if command -v pip3 &>/dev/null || command -v pip &>/dev/null; then
    echo "[ OK ] pip installed"
  else
    echo "[FAIL] pip           not found"
  fi

  # Node
  if command -v node &>/dev/null; then
    echo "[ OK ] Node.js $(node --version)"
  else
    echo "[FAIL] Node.js       not found"
    echo "       Download from https://nodejs.org/"
  fi

  # npm
  if command -v npm &>/dev/null; then
    echo "[ OK ] npm $(npm --version)"
  else
    echo "[FAIL] npm           not found"
  fi

  # Git
  if command -v git &>/dev/null; then
    echo "[ OK ] $(git --version)"
  else
    echo "[WARN] Git           not found (optional)"
  fi

  echo ""

  # Project state
  if [ -f "$ROOT_DIR/backend/hmi.db" ]; then
    echo "[ OK ] Database exists (backend/hmi.db)"
  else
    echo "[INFO] No database yet - run: ./dev.sh seed"
  fi

  if [ -d "$ROOT_DIR/frontend/node_modules" ]; then
    echo "[ OK ] Frontend dependencies installed"
  else
    echo "[INFO] Frontend dependencies not installed - run: ./dev.sh install"
  fi

  echo ""
  echo "Run './dev.sh install' to install project dependencies."
}

cmd_build() {
  check_node
  echo "==> Building frontend..."
  cd "$ROOT_DIR/frontend" && npm run build
}

cmd_lint() {
  check_node
  echo "==> Linting frontend..."
  cd "$ROOT_DIR/frontend" && npm run lint
}

cmd_check() {
  cmd_build
  cmd_lint
  echo "==> All checks passed."
}

cmd_stop() {
  echo "==> Stopping any running dev servers..."
  kill_existing
  echo "==> Done."
}

cmd_dev() {
  check_all
  ensure_venv
  kill_existing
  echo "==> Starting backend and frontend dev servers..."
  echo "    Backend:  http://localhost:8080"
  echo "    Frontend: http://localhost:5173"
  (cd "$ROOT_DIR/backend" && "$PY" run.py) &
  BACKEND_PID=$!
  (cd "$ROOT_DIR/frontend" && npm run dev) &
  FRONTEND_PID=$!
  trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
  wait
}

cmd_seed() {
  ensure_venv
  echo "==> Seeding database..."
  cd "$ROOT_DIR/backend" && "$PY" -m app.seed
}

cmd_test() {
  echo "==> Running all tests..."
  cmd_test_backend
  cmd_test_frontend
  echo "==> All tests passed."
}

cmd_test_backend() {
  ensure_venv
  echo "==> Running backend tests..."
  cd "$ROOT_DIR/backend" && "$PY" -m pytest tests/ -v
}

cmd_test_frontend() {
  check_node
  echo "==> Running frontend tests..."
  cd "$ROOT_DIR/frontend" && npx vitest run
}

cmd_install() {
  check_all
  ensure_venv
  echo "==> Installing backend dependencies..."
  if [ -d "$ROOT_DIR/backend/wheels" ]; then
    echo "    Found bundled wheels — installing offline (no internet required)."
    cd "$ROOT_DIR/backend" && "$PY" -m pip install --no-index --find-links=wheels -r requirements.txt
  else
    cd "$ROOT_DIR/backend" && "$PY" -m pip install -r requirements.txt
  fi
  echo "==> Installing frontend dependencies..."
  cd "$ROOT_DIR/frontend" && npm install
  echo "==> All dependencies installed successfully."
}

usage() {
  cat <<EOF
Usage: ./dev.sh <command>

Commands:
  install          Install all dependencies (pip + npm)
  dev              Start backend (:8080) + frontend (:5173) dev servers
  stop             Stop any running dev servers (ports 8080, 5173)
  build            TypeScript check + Vite build
  lint             Run ESLint on the frontend
  check            Run both build and lint
  test             Run all tests (backend + frontend)
  test:backend     Run backend tests only (pytest)
  test:frontend    Run frontend tests only (vitest)
  seed             Seed the database with default users/tags
  doctor           Check development environment prerequisites

Prerequisites: Python 3.10+, Node.js 18+
Run './dev.sh doctor' to check your setup.
EOF
}

case "${1:-}" in
  build)        cmd_build ;;
  lint)         cmd_lint ;;
  check)        cmd_check ;;
  dev)          cmd_dev ;;
  stop)         cmd_stop ;;
  seed)         cmd_seed ;;
  install)      cmd_install ;;
  doctor)       cmd_doctor ;;
  test)         cmd_test ;;
  test:backend) cmd_test_backend ;;
  test:frontend) cmd_test_frontend ;;
  *)            usage ;;
esac
