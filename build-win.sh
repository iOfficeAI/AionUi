#!/usr/bin/env bash
#
# build-win.sh — 在 Windows 系统上打包 Windows 安装包
#
# 用法 (Git Bash / MSYS2):
#   ./build-win.sh              # 默认 x64
#   ./build-win.sh --arch x64   # 显式指定 x64
#   ./build-win.sh --arch arm64 # ARM64
#   ./build-win.sh --skip-vite  # 跳过 Vite 编译（增量构建）
#   ./build-win.sh --skip-native # 跳过原生模块重建
#
# 前置条件:
#   - Node.js >= 18
#   - bun
#   - Visual Studio Build Tools 2022 (用于编译原生模块)
#     安装: choco install visualstudio2022buildtools
#            choco install visualstudio2022-workload-vctools
#

set -euo pipefail

# ─── 颜色输出 ───────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# ─── 默认参数 ───────────────────────────────────────────────
ARCH="x64"
SKIP_VITE=false
SKIP_NATIVE=false
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"

# ─── 解析参数 ───────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --arch)
      ARCH="$2"
      shift 2
      ;;
    --skip-vite)
      SKIP_VITE=true
      shift
      ;;
    --skip-native)
      SKIP_NATIVE=true
      shift
      ;;
    -h|--help)
      sed -n '2,/^$/p' "$0" | sed 's/^# //'
      exit 0
      ;;
    *)
      err "未知参数: $1"
      exit 1
      ;;
  esac
done

cd "$PROJECT_ROOT"

# ─── 1. 环境检查 ───────────────────────────────────────────
info "构建环境检查..."
info "目标架构: win32-${ARCH}"
info "平台: $(uname -s) $(uname -m)"

if ! command -v bun &>/dev/null; then
  err "未找到 bun，请先安装: powershell -c \"irm bun.sh/install.ps1 | iex\""
  exit 1
fi
ok "bun: $(bun --version)"

if ! command -v node &>/dev/null; then
  err "未找到 node"
  exit 1
fi
ok "node: $(node --version)"

# ─── 2. 原生模块重建 ───────────────────────────────────────
if [[ "$SKIP_NATIVE" == false ]]; then
  info "重建原生模块 (Electron ${ARCH})..."

  ELECTRON_VER=$(node -p "require('./package.json').devDependencies.electron.replace(/[\^~]/g, '')")
  info "Electron 版本: ${ELECTRON_VER}"

  # 设置 node-gyp 编译环境
  export npm_config_runtime=electron
  export npm_config_arch="${ARCH}"
  export npm_config_target_arch="${ARCH}"
  export npm_config_disturl=https://electronjs.org/headers

  # 策略: 先 prebuild-install（快），失败则 electron-rebuild
  info "尝试 prebuild-install..."
  SQLITE_NODE="node_modules/better-sqlite3/build/Release/better_sqlite3.node"

  if npx prebuild-install --runtime=electron --target="${ELECTRON_VER}" --platform=win32 --arch="${ARCH}" --force 2>/dev/null; then
    ok "prebuild-install 成功"
  else
    warn "prebuild-install 失败，尝试 electron-rebuild..."
    npx electron-rebuild -f -w better-sqlite3
  fi

  # 验证关键原生模块
  info "验证原生模块..."
  if [[ -f "$SQLITE_NODE" ]]; then
    SIZE=$(wc -c < "$SQLITE_NODE")
    ok "better-sqlite3: $((${SIZE} / 1024)) KB"
  else
    err "better-sqlite3 原生模块未找到"
    err "请确认已安装 Visual Studio Build Tools 2022"
    err "  choco install visualstudio2022buildtools visualstudio2022-workload-vctools"
    exit 1
  fi

  if [[ -d "node_modules/node-pty/prebuilds/win32-${ARCH}" ]]; then
    ok "node-pty: win32-${ARCH} prebuild 已就绪"
  else
    warn "node-pty: win32-${ARCH} prebuild 不存在，尝试下载..."
    (cd node_modules/node-pty && npx prebuild-install --runtime=electron --target="${ELECTRON_VER}" --platform=win32 --arch="${ARCH}" --force) || warn "node-pty prebuild 下载失败"
  fi

  ok "原生模块验证完成"
fi

# ─── 3. 执行构建 ───────────────────────────────────────────
info "开始构建 Windows 安装包 (win32-${ARCH})..."

BUILD_ARGS="auto --win --${ARCH}"

if [[ "$SKIP_VITE" == true ]]; then
  BUILD_ARGS="${BUILD_ARGS} --skip-vite"
fi
if [[ "$SKIP_NATIVE" == true ]]; then
  BUILD_ARGS="${BUILD_ARGS} --skip-native"
fi

info "构建命令: node scripts/build-with-builder.js ${BUILD_ARGS}"

# 压缩级别: 本地构建用 7（平衡速度与大小）
export ELECTRON_BUILDER_COMPRESSION_LEVEL="${ELECTRON_BUILDER_COMPRESSION_LEVEL:-7}"

# 禁用代码签名（本地开发构建无需签名）
export CSC_IDENTITY_AUTO_DISCOVERY=false

info "压缩级别: ${ELECTRON_BUILDER_COMPRESSION_LEVEL}"
info "代码签名: 已禁用"

node scripts/build-with-builder.js ${BUILD_ARGS}

# ─── 4. 验证输出 ───────────────────────────────────────────
info "验证构建产物..."

FOUND=false
for f in out/*-win-*.exe out/*-win-*.zip; do
  if [[ -f "$f" ]]; then
    SIZE=$(wc -c < "$f" | awk '{printf "%.1f MB", $1/1048576}')
    ok "$(basename "$f")  ($SIZE)"
    FOUND=true
  fi
done

if [[ "$FOUND" == true ]]; then
  echo ""
  ok "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  ok "  Windows 安装包构建完成！"
  ok "  产物目录: ${PROJECT_ROOT}/out/"
  ok ""
  ok "  注意："
  ok "    - 安装包未签名，Windows 可能提示 SmartScreen 警告"
  ok "    - 如需签名，请设置环境变量 CSC_LINK 和 CSC_KEY_PASSWORD"
  ok "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
else
  err "未找到 Windows 安装包产物，请检查上方日志"
  exit 1
fi
