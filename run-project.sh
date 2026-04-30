#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

MODE="${1:-desktop}"

print_usage() {
  cat <<'EOF'
Usage: ./run-project.sh [desktop|webui|webui-remote|cli]

Modes:
  desktop       Start Electron development mode (default)
  webui         Start WebUI development mode
  webui-remote  Start WebUI development mode with remote access
  cli           Start CLI development mode
EOF
}

if ! command -v bun >/dev/null 2>&1; then
  echo "Error: bun is not installed or not in PATH."
  echo "Install bun first: https://bun.sh"
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "Dependencies not found. Running bun install..."
  bun install
fi

case "$MODE" in
  desktop)
    echo "Starting desktop development mode..."
    exec bun run start
    ;;
  webui)
    echo "Starting WebUI development mode..."
    exec bun run webui
    ;;
  webui-remote)
    echo "Starting WebUI remote development mode..."
    exec bun run webui:remote
    ;;
  cli)
    echo "Starting CLI development mode..."
    exec bun run cli
    ;;
  -h|--help|help)
    print_usage
    ;;
  *)
    echo "Unknown mode: $MODE"
    echo
    print_usage
    exit 1
    ;;
esac
