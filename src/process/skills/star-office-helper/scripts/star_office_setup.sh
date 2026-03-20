#!/usr/bin/env bash
set -euo pipefail

TARGET_DIR="${1:-$HOME/Star-Office-UI}"
REPO_URL="${STAR_OFFICE_REPO_URL:-https://github.com/ringhyacinth/Star-Office-UI.git}"

echo "[star-office-setup] target: $TARGET_DIR"

if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: python3 not found"
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "ERROR: git not found"
  exit 1
fi

if [ ! -d "$TARGET_DIR/.git" ]; then
  echo "[star-office-setup] cloning repo..."
  git clone "$REPO_URL" "$TARGET_DIR"
else
  echo "[star-office-setup] repo exists, skip clone"
fi

cd "$TARGET_DIR"

if [ ! -d ".venv" ]; then
  echo "[star-office-setup] creating .venv"
  python3 -m venv .venv
fi

echo "[star-office-setup] installing backend requirements in .venv"
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r backend/requirements.txt

if [ ! -f "state.json" ] && [ -f "state.sample.json" ]; then
  cp state.sample.json state.json
  echo "[star-office-setup] created state.json from sample"
fi

echo ""
echo "[star-office-setup] Done. Proceed to start backend and frontend."
