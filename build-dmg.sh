#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

TARGET="${1:-mac}"

echo "[AICoreDesktop] 开始打包: ${TARGET}"

action() {
  case "$TARGET" in
    mac)
      bun run dist:mac
      ;;
    x64)
      bun run dist:mac -- --x64
      ;;
    arm64)
      bun run dist:mac -- --arm64
      ;;
    all|mac:all|mac-all|mac:both|mac-both)
      bun run dist:mac -- --arm64 --x64
      ;;
    win)
      bun run dist:win
      ;;
    linux)
      bun run dist:linux
      ;;
    *)
      echo "用法: ./build-dmg.sh [mac|x64|arm64|all|win|linux]"
      exit 1
      ;;
  esac
}

action

echo "[AICoreDesktop] 打包完成，产物目录: out/"
