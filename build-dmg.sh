#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

TARGET="${1:-all}"

echo "[AICoreDesktop] 开始打包: ${TARGET}"

action() {
  case "$TARGET" in
    all)
      bun run dist
      ;;
    mac)
      bun run dist:mac
      ;;
    win)
      bun run dist:win
      ;;
    linux)
      bun run dist:linux
      ;;
    *)
      echo "用法: ./一键打包 命令.sh [all|mac|win|linux]"
      exit 1
      ;;
  esac
}

action

echo "[AICoreDesktop] 打包完成，产物目录: out/"
