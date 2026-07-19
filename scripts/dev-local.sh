#!/usr/bin/env bash
# Local dev launcher: Azurite + Azure Functions + static frontend
# Usage: ./scripts/dev-local.sh [yn|app|proxy]
#   yn    - Yunnan page + func (port 3000)
#   app   - app platform + func (port 3000)
#   proxy - .tmp-local-dev-server.mjs (5173 frontend + 7071 API proxy)
#
# 日志直接输出到当前终端：func 行带 [func] 前缀，serve 行带 [serve] 前缀，
# azurite 保持静默（日志很吵且无用）。Ctrl+C 会清理所有子进程。

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE="${1:-proxy}"
AZURITE_DIR="${TMPDIR:-/tmp}/azurite-travel"
API_DIR="$ROOT/api"

if [[ ! -f "$API_DIR/local.settings.json" ]]; then
  echo "Missing api/local.settings.json; copying template..."
  cp "$API_DIR/local.settings.example.json" "$API_DIR/local.settings.json"
  echo "Edit api/local.settings.json and set AOAI_* for AI endpoints."
fi

if [[ -f "$ROOT/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env.local"
  set +a
fi

cleanup() {
  echo
  echo "Stopping local services..."
  jobs -p | xargs kill 2>/dev/null || true
}
trap cleanup EXIT INT TERM

case "$MODE" in
  yn|app)
    mkdir -p "$AZURITE_DIR"
    echo "Starting Azurite at ${AZURITE_DIR}..."
    azurite --silent --location "$AZURITE_DIR" &
    sleep 1
    echo "Starting Azure Functions at http://localhost:7071/api ..."
    (cd "$API_DIR" && func start) 2>&1 | sed 's/^/[func] /' &
    sleep 3
    if [[ "$MODE" == "yn" ]]; then
      echo "Serving Yunnan page at http://localhost:3000/旅游计划.html"
      echo "Tip: API_BASE 按 hostname 自动指向本地 func，无需额外配置"
      (cd "$ROOT" && npx --yes serve 云南 -l 3000) 2>&1 | sed 's/^/[serve] /' &
    else
      echo "Serving app platform at http://localhost:3000/index.html"
      echo "Tip: API_BASE 按 hostname 自动指向本地 func，无需额外配置"
      (cd "$ROOT" && npx --yes serve app -l 3000) 2>&1 | sed 's/^/[serve] /' &
    fi
    wait
    ;;
  proxy)
    echo "Starting local proxy (frontend :5173, API :7071)..."
    echo "Open: http://localhost:5173/app/trip.html?trip=local-demo"
    node "$ROOT/.tmp-local-dev-server.mjs"
    ;;
  *)
    echo "Unknown mode: $MODE (use yn | app | proxy)"
    exit 1
    ;;
esac
