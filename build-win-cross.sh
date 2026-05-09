#!/usr/bin/env bash
#
# build-win-cross.sh — 在 macOS 上交叉打包 Windows 安装包
#
# 用法:
#   ./build-win-cross.sh              # 默认 x64
#   ./build-win-cross.sh --arch x64   # 显式指定 x64
#   ./build-win-cross.sh --arch arm64 # ARM64
#   ./build-win-cross.sh --skip-vite  # 跳过 Vite 编译（增量构建）
#   ./build-win-cross.sh --skip-native # 跳过原生模块重建
#   ./build-win-cross.sh --install-wine  # 自动安装 Wine（如果未安装）
#
# 前置条件:
#   - Wine (用于 rcedit 修改 exe 图标/元数据)
#   - 原生模块的 win32 prebuild（脚本会自动尝试下载）
#
# 注意:
#   - macOS 上交叉编译 Windows 安装包存在限制，原生模块依赖 prebuild 二进制
#   - 如果 prebuild 不可用，构建会失败，建议使用 GitHub Actions CI 构建
#   - 代码签名无法在 macOS 上完成，生成的安装包未签名
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
INSTALL_WINE=false
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
HOST_SQLITE_BACKUP=""
HOST_SQLITE_NODE_PATH="node_modules/better-sqlite3/build/Release/better_sqlite3.node"

restore_host_sqlite_binary() {
  if [[ -n "${HOST_SQLITE_BACKUP}" && -f "${HOST_SQLITE_BACKUP}" ]]; then
    mkdir -p "$(dirname "${HOST_SQLITE_NODE_PATH}")"
    cp -f "${HOST_SQLITE_BACKUP}" "${HOST_SQLITE_NODE_PATH}"
    rm -f "${HOST_SQLITE_BACKUP}"
    ok "已恢复本机 better-sqlite3 二进制（避免污染开发环境）"
  fi
}

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
    --install-wine)
      INSTALL_WINE=true
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

# ─── 1. 平台检查 ───────────────────────────────────────────
if [[ "$(uname -s)" != "Darwin" ]]; then
  err "此脚本仅用于 macOS 交叉编译 Windows 安装包"
  err "如在 Windows 上构建，请使用 build-win.sh"
  exit 1
fi

info "构建环境检查..."
info "目标架构: win32-${ARCH}"
info "当前平台: $(uname -s) $(uname -m)"

if ! command -v bun &>/dev/null; then
  err "未找到 bun，请先安装: curl -fsSL https://bun.sh/install | bash"
  exit 1
fi
ok "bun: $(bun --version)"

if ! command -v node &>/dev/null; then
  err "未找到 node"
  exit 1
fi
ok "node: $(node --version)"

# ─── 2. Wine 检查与安装 ───────────────────────────────────
info "检查 Wine..."

if command -v wine &>/dev/null; then
  ok "Wine: $(wine --version 2>/dev/null || echo '已安装')"
else
  warn "Wine 未安装"
  warn "electron-builder 在 macOS 上生成 Windows 安装包需要 Wine (rcedit 依赖)"
  warn "未安装 Wine 时，构建可能在 NSIS 打包或 exe 元数据编辑步骤失败"

  if [[ "$INSTALL_WINE" == true ]]; then
    info "正在安装 Wine..."
    if command -v brew &>/dev/null; then
      brew install --cask wine-stable
      if command -v wine &>/dev/null; then
        ok "Wine 安装成功"
      else
        err "Wine 安装失败，请手动安装后重试"
        exit 1
      fi
    else
      err "未找到 Homebrew，无法自动安装 Wine"
      err "请手动安装: brew install --cask wine-stable"
      exit 1
    fi
  else
    warn "使用 --install-wine 参数可自动安装 Wine"
    warn "继续构建，但可能会在打包阶段失败..."
  fi
fi

# ─── 3. 原生模块处理 ───────────────────────────────────────
if [[ "$SKIP_NATIVE" == false ]]; then
  info "处理 Windows 原生模块..."

  if [[ -f "${HOST_SQLITE_NODE_PATH}" ]]; then
    HOST_SQLITE_BACKUP="$(mktemp "/tmp/aionui-better-sqlite3-host.XXXXXX.node")"
    cp -f "${HOST_SQLITE_NODE_PATH}" "${HOST_SQLITE_BACKUP}"
    trap restore_host_sqlite_binary EXIT
    info "已备份本机 better-sqlite3 二进制"
  fi

  ELECTRON_VER=$(node -p "require('./package.json').devDependencies.electron.replace(/[\^~]/g, '')")
  info "Electron 版本: ${ELECTRON_VER}"

  # better-sqlite3: 尝试用 prebuild-install 下载 win32 二进制
  info "下载 better-sqlite3 win32-${ARCH} prebuild..."
  (
    cd node_modules/better-sqlite3
    if npx prebuild-install --runtime=electron --target="${ELECTRON_VER}" --platform=win32 --arch="${ARCH}" --force 2>/dev/null; then
      ok "better-sqlite3: prebuild 下载成功"
    else
      warn "better-sqlite3: prebuild 下载失败，将尝试 electron-rebuild"
      if npx electron-rebuild -f -w better-sqlite3 --arch="${ARCH}" 2>/dev/null; then
        warn "better-sqlite3: electron-rebuild 完成（可能是 macOS 二进制，非 win32）"
      else
        warn "better-sqlite3: 重建失败，继续构建可能会产生不可用的安装包"
      fi
    fi
  )

  # bcryptjs 是纯 JS 实现，无需处理原生模块

  # node-pty: 检查 win32 prebuild 是否存在
  if [[ -d "node_modules/node-pty/prebuilds/win32-${ARCH}" ]]; then
    ok "node-pty: win32-${ARCH} prebuild 已存在"
  else
    warn "node-pty: win32-${ARCH} prebuild 不存在"
    info "尝试下载 node-pty win32-${ARCH} prebuild..."
    (
      cd node_modules/node-pty
      if npx prebuild-install --runtime=electron --target="${ELECTRON_VER}" --platform=win32 --arch="${ARCH}" --force 2>/dev/null; then
        ok "node-pty: prebuild 下载成功"
      else
        warn "node-pty: prebuild 下载失败"
      fi
    )
  fi

  # 验证关键原生模块
  info "验证原生模块..."
  NATIVE_OK=true

  if [[ -f "node_modules/better-sqlite3/build/Release/better_sqlite3.node" ]]; then
    BINARY_TYPE=$(file "node_modules/better-sqlite3/build/Release/better_sqlite3.node" 2>/dev/null || echo "unknown")
    if echo "$BINARY_TYPE" | grep -qi "windows\|pe32\|dll\|coff"; then
      ok "better-sqlite3: win32 二进制 ✓"
    elif echo "$BINARY_TYPE" | grep -qi "darwin\|mach-o"; then
      warn "better-sqlite3: 当前为 macOS 二进制，打包后 Windows 上无法使用！"
      NATIVE_OK=false
    else
      warn "better-sqlite3: 无法确认二进制类型 ($BINARY_TYPE)"
    fi
  else
    warn "better-sqlite3: 未找到编译产物"
    NATIVE_OK=false
  fi

  if [[ "$NATIVE_OK" == false ]]; then
    echo ""
    err "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    err "  原生模块问题：macOS 上无法编译 win32 原生二进制"
    err "  生成的安装包在 Windows 上可能无法正常运行"
    err ""
    err "  推荐方案："
    err "    1. 使用 GitHub Actions CI 构建（最可靠）"
    err "       gh workflow run build-manual.yml -f platform=windows-${ARCH}"
    err ""
    err "    2. 在 Windows 上使用 build-win.sh 构建"
    err ""
    err "  如仍要继续，请设置环境变量 FORCE_WIN_BUILD=1"
    err "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    if [[ "${FORCE_WIN_BUILD:-0}" != "1" ]]; then
      err "构建中止。设置 FORCE_WIN_BUILD=1 可强制继续。"
      exit 1
    else
      warn "FORCE_WIN_BUILD=1，强制继续构建..."
    fi
  fi
fi

# ─── 4. 执行构建 ───────────────────────────────────────────
info "开始交叉构建 Windows 安装包 (win32-${ARCH})..."

BUILD_ARGS="auto --win --${ARCH}"

if [[ "$SKIP_VITE" == true ]]; then
  BUILD_ARGS="${BUILD_ARGS} --skip-vite"
fi
if [[ "$SKIP_NATIVE" == true ]]; then
  BUILD_ARGS="${BUILD_ARGS} --skip-native"
fi

info "构建命令: node scripts/build-with-builder.js ${BUILD_ARGS}"

export ELECTRON_BUILDER_COMPRESSION_LEVEL="${ELECTRON_BUILDER_COMPRESSION_LEVEL:-7}"
export CSC_IDENTITY_AUTO_DISCOVERY=false

info "压缩级别: ${ELECTRON_BUILDER_COMPRESSION_LEVEL}"
info "代码签名: 已禁用（macOS 交叉编译不支持 Windows 签名）"

node scripts/build-with-builder.js ${BUILD_ARGS}

# ─── 5. 验证输出 ───────────────────────────────────────────
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
  ok "  Windows 安装包交叉构建完成！"
  ok "  产物目录: ${PROJECT_ROOT}/out/"
  ok ""
  ok "  注意："
  ok "    - 安装包未签名，Windows 可能提示 SmartScreen 警告"
  ok "    - 请务必在 Windows 上测试安装包是否可正常运行"
  ok "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
else
  err "未找到 Windows 安装包产物，请检查上方日志"
  exit 1
fi
