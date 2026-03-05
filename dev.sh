#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

usage() {
  cat <<EOF
Usage: ./dev.sh <command>

Commands:
  build       Build the frontend (TypeScript check + Vite build)
  lint        Run ESLint on the frontend
  check       Run both build and lint
  dev         Start backend and frontend dev servers
  seed        Seed the backend database with defaults
  install     Install all dependencies
EOF
}

cmd_build() {
  echo "==> Building frontend..."
  cd "$ROOT_DIR/frontend" && npm run build
}

cmd_lint() {
  echo "==> Linting frontend..."
  cd "$ROOT_DIR/frontend" && npm run lint
}

cmd_check() {
  cmd_build
  cmd_lint
  echo "==> All checks passed."
}

cmd_dev() {
  echo "==> Starting backend and frontend dev servers..."
  echo "    Backend:  http://localhost:8080"
  echo "    Frontend: http://localhost:5173"
  (cd "$ROOT_DIR/backend" && python run.py) &
  BACKEND_PID=$!
  (cd "$ROOT_DIR/frontend" && npm run dev) &
  FRONTEND_PID=$!
  trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
  wait
}

cmd_seed() {
  echo "==> Seeding database..."
  cd "$ROOT_DIR/backend" && python -m app.seed
}

cmd_install() {
  echo "==> Installing backend dependencies..."
  cd "$ROOT_DIR/backend" && pip install -r requirements.txt
  echo "==> Installing frontend dependencies..."
  cd "$ROOT_DIR/frontend" && npm install
}

case "${1:-}" in
  build)   cmd_build ;;
  lint)    cmd_lint ;;
  check)   cmd_check ;;
  dev)     cmd_dev ;;
  seed)    cmd_seed ;;
  install) cmd_install ;;
  *)       usage ;;
esac
