#!/usr/bin/env bash
# ============================================================================
# AionUi — Ubuntu / Debian 一鍵自動化安裝腳本
# ============================================================================
# 功能：
#   1. 自動偵測系統架構 (amd64 / arm64)
#   2. 從 GitHub Release 下載指定版本的 .deb 套件（預設 latest）
#   3. 安裝 .deb + 自動修復依賴
#   4. 安裝 Xvfb 等 headless 運行所需套件
#   5. 建立服務管理腳本 (/opt/AionUi/start-aionui.sh)
#   6. (可選) 建立 systemd service
#   7. (可選) 建立桌面捷徑
#
# 用法：
#   curl -fsSL https://raw.githubusercontent.com/iOfficeAI/AionUi/main/scripts/install-ubuntu.sh | bash
#   # 或指定版本：
#   AIONUI_VERSION=1.8.25 bash install-ubuntu.sh
#   # 僅安裝桌面版（跳過 headless 設定）：
#   AIONUI_MODE=desktop bash install-ubuntu.sh
# ============================================================================

set -euo pipefail

# ─── 顏色定義 ───────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ─── 輔助函式 ───────────────────────────────────────────────────────────────
info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[✓]${NC} $*"; }
warn()    { echo -e "${YELLOW}[!]${NC} $*"; }
error()   { echo -e "${RED}[✗]${NC} $*" >&2; }
die()     { error "$*"; exit 1; }

banner() {
    echo -e "${CYAN}${BOLD}"
    echo "  ╔══════════════════════════════════════════════╗"
    echo "  ║          AionUi Installer for Ubuntu         ║"
    echo "  ╚══════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# ─── 前置檢查 ───────────────────────────────────────────────────────────────
check_prerequisites() {
    # 必須是 Linux
    [[ "$(uname -s)" == "Linux" ]] || die "此腳本僅支援 Linux 系統"

    # 必須有 apt (Debian/Ubuntu 系列)
    command -v apt-get &>/dev/null || die "此腳本需要 apt-get (Debian/Ubuntu 系列)"

    # 建議以 root 或 sudo 執行
    if [[ $EUID -ne 0 ]]; then
        if command -v sudo &>/dev/null; then
            SUDO="sudo"
            warn "非 root 使用者，將使用 sudo 執行安裝"
        else
            die "請以 root 身份執行，或安裝 sudo"
        fi
    else
        SUDO=""
    fi
}

# ─── 偵測架構 ───────────────────────────────────────────────────────────────
detect_arch() {
    local machine
    machine="$(uname -m)"
    case "$machine" in
        x86_64|amd64)
            DEB_ARCH="amd64"
            ;;
        aarch64|arm64)
            DEB_ARCH="arm64"
            ;;
        *)
            die "不支援的架構: $machine（僅支援 x86_64 / aarch64）"
            ;;
    esac
    info "偵測到系統架構: ${BOLD}$machine${NC} → 套件架構: ${BOLD}$DEB_ARCH${NC}"
}

# ─── 取得版本號 ──────────────────────────────────────────────────────────────
resolve_version() {
    if [[ -n "${AIONUI_VERSION:-}" ]]; then
        VERSION="$AIONUI_VERSION"
        info "使用指定版本: ${BOLD}v$VERSION${NC}"
    else
        info "正在查詢最新版本..."
        # 透過 GitHub API 取得 latest release tag
        if command -v curl &>/dev/null; then
            VERSION=$(curl -fsSL "https://api.github.com/repos/iOfficeAI/AionUi/releases/latest" \
                | grep '"tag_name"' | head -1 | sed 's/.*"v\([^"]*\)".*/\1/')
        elif command -v wget &>/dev/null; then
            VERSION=$(wget -qO- "https://api.github.com/repos/iOfficeAI/AionUi/releases/latest" \
                | grep '"tag_name"' | head -1 | sed 's/.*"v\([^"]*\)".*/\1/')
        else
            die "需要 curl 或 wget 來下載，請先安裝: sudo apt-get install -y curl"
        fi

        if [[ -z "$VERSION" ]]; then
            die "無法取得最新版本號，請手動指定: AIONUI_VERSION=1.8.25 bash $0"
        fi
        info "最新版本: ${BOLD}v$VERSION${NC}"
    fi

    DEB_FILENAME="AionUi-${VERSION}-linux-${DEB_ARCH}.deb"
    DOWNLOAD_URL="https://github.com/iOfficeAI/AionUi/releases/download/v${VERSION}/${DEB_FILENAME}"
}

# ─── 下載 .deb 套件 ──────────────────────────────────────────────────────────
download_deb() {
    local tmpdir
    tmpdir="$(mktemp -d)"
    DEB_PATH="${tmpdir}/${DEB_FILENAME}"

    info "下載 ${BOLD}$DEB_FILENAME${NC} ..."
    info "網址: $DOWNLOAD_URL"

    if command -v curl &>/dev/null; then
        curl -fSL --progress-bar -o "$DEB_PATH" "$DOWNLOAD_URL" || die "下載失敗"
    elif command -v wget &>/dev/null; then
        wget --show-progress -q -O "$DEB_PATH" "$DOWNLOAD_URL" || die "下載失敗"
    fi

    local size
    size=$(du -h "$DEB_PATH" | cut -f1)
    success "下載完成 ($size)"
}

# ─── 安裝 .deb + 修復依賴 ────────────────────────────────────────────────────
install_deb() {
    info "安裝 AionUi .deb 套件..."

    # dpkg 安裝（可能會缺依賴）
    $SUDO dpkg -i "$DEB_PATH" 2>/dev/null || true

    # 自動修復缺失的依賴
    info "修復依賴套件..."
    $SUDO apt-get install -f -y

    success "AionUi v${VERSION} 安裝完成"

    # 驗證安裝
    if command -v AionUi &>/dev/null || [[ -x /usr/bin/AionUi ]]; then
        success "AionUi 已安裝至 $(which AionUi 2>/dev/null || echo '/usr/bin/AionUi')"
    else
        warn "安裝可能不完整，找不到 AionUi 執行檔"
    fi

    # 清理暫存
    rm -rf "$(dirname "$DEB_PATH")"
}

# ─── 安裝 Headless 依賴 ──────────────────────────────────────────────────────
install_headless_deps() {
    info "安裝 headless 運行所需套件 (Xvfb 等)..."

    $SUDO apt-get update -qq
    $SUDO apt-get install -y --no-install-recommends \
        xvfb \
        libxkbcommon-x11-0 \
        libgtk-3-0 \
        libnotify4 \
        libnss3 \
        libxss1 \
        libasound2 \
        libgbm1 \
        2>/dev/null || warn "部分套件可能已安裝或不可用"

    success "Headless 依賴安裝完成"
}

# ─── 建立服務管理腳本 ─────────────────────────────────────────────────────────
create_service_script() {
    local script_dir="/opt/AionUi"
    local script_path="${script_dir}/start-aionui.sh"

    info "建立服務管理腳本: $script_path"
    $SUDO mkdir -p "$script_dir"

    $SUDO tee "$script_path" > /dev/null << 'SCRIPT_EOF'
#!/bin/bash
# ============================================================================
# AionUi WebUI Headless 服務管理腳本
# 用法: ./start-aionui.sh [start|stop|restart|status|logs]
# ============================================================================

PIDFILE="/var/run/aionui.pid"
LOGFILE="/var/log/aionui.log"
WORKDIR="${AIONUI_WORKDIR:-$HOME}"

start() {
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
        echo "⚡ AionUi 已在執行中 (PID: $(cat "$PIDFILE"))"
        return 1
    fi

    echo "🚀 正在啟動 AionUi WebUI..."
    cd "$WORKDIR" || exit 1

    nohup xvfb-run --auto-servernum --server-args="-screen 0 1920x1080x24" \
        /usr/bin/AionUi --webui --remote --no-sandbox \
        > "$LOGFILE" 2>&1 &

    echo $! > "$PIDFILE"
    sleep 3

    if kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
        echo "✅ AionUi 啟動成功 (PID: $(cat "$PIDFILE"))"
        local ip
        ip=$(hostname -I 2>/dev/null | awk '{print $1}')
        echo "🌐 WebUI: http://${ip:-localhost}:25808"
    else
        echo "❌ AionUi 啟動失敗，請查看日誌: $LOGFILE"
        rm -f "$PIDFILE"
        return 1
    fi
}

stop() {
    if [ ! -f "$PIDFILE" ]; then
        echo "⚠️  AionUi 未在執行"
        return 1
    fi
    local pid
    pid=$(cat "$PIDFILE")
    echo "🛑 正在停止 AionUi (PID: $pid)..."
    kill "$pid" 2>/dev/null
    sleep 2
    kill -9 "$pid" 2>/dev/null
    pkill -f "AionUi --webui" 2>/dev/null
    rm -f "$PIDFILE"
    echo "✅ AionUi 已停止"
}

restart() {
    stop 2>/dev/null
    sleep 1
    start
}

status() {
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
        echo "✅ AionUi 執行中 (PID: $(cat "$PIDFILE"))"
        ss -tlnp 2>/dev/null | grep 25808 || netstat -tlnp 2>/dev/null | grep 25808 || true
    else
        echo "⚠️  AionUi 未在執行"
        rm -f "$PIDFILE" 2>/dev/null
    fi
}

logs() {
    if [ -f "$LOGFILE" ]; then
        tail -f "$LOGFILE"
    else
        echo "日誌檔案不存在: $LOGFILE"
    fi
}

case "${1:-}" in
    start)   start ;;
    stop)    stop ;;
    restart) restart ;;
    status)  status ;;
    logs)    logs ;;
    "")
        echo "用法: $0 {start|stop|restart|status|logs}"
        echo ""
        echo "環境變數:"
        echo "  AIONUI_WORKDIR  - AionUi 工作目錄 (預設: \$HOME)"
        ;;
    *)
        echo "用法: $0 {start|stop|restart|status|logs}"
        exit 1
        ;;
esac
SCRIPT_EOF

    $SUDO chmod +x "$script_path"
    success "服務管理腳本已建立: $script_path"
}

# ─── 建立 systemd service (可選) ─────────────────────────────────────────────
create_systemd_service() {
    # 若系統不支援 systemd 則跳過
    if ! command -v systemctl &>/dev/null; then
        info "系統不支援 systemd，跳過 service 建立"
        return
    fi

    local service_path="/etc/systemd/system/aionui.service"

    info "建立 systemd 服務: $service_path"

    $SUDO tee "$service_path" > /dev/null << 'SERVICE_EOF'
[Unit]
Description=AionUi AI Agent Desktop App (WebUI Mode)
Documentation=https://github.com/iOfficeAI/AionUi
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/root
ExecStart=/usr/bin/xvfb-run --auto-servernum --server-args="-screen 0 1920x1080x24" /usr/bin/AionUi --webui --remote --no-sandbox
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

# 安全性設定
NoNewPrivileges=false
ProtectSystem=false

[Install]
WantedBy=multi-user.target
SERVICE_EOF

    $SUDO systemctl daemon-reload
    success "systemd 服務已建立"
    info "使用方式:"
    echo "    sudo systemctl start aionui     # 啟動"
    echo "    sudo systemctl stop aionui      # 停止"
    echo "    sudo systemctl enable aionui    # 開機自動啟動"
    echo "    sudo systemctl status aionui    # 查看狀態"
    echo "    journalctl -u aionui -f         # 查看日誌"
}

# ─── 建立桌面捷徑 ─────────────────────────────────────────────────────────────
create_desktop_entry() {
    local desktop_dir="${HOME}/.local/share/applications"
    local desktop_file="${desktop_dir}/aionui.desktop"

    mkdir -p "$desktop_dir"

    cat > "$desktop_file" << 'DESKTOP_EOF'
[Desktop Entry]
Name=AionUi
Comment=AI Agent Cowork Platform
Exec=/usr/bin/AionUi --no-sandbox %U
Icon=AionUi
Terminal=false
Type=Application
Categories=Office;Utility;Development;
MimeType=x-scheme-handler/aionui;
StartupWMClass=AionUi
DESKTOP_EOF

    success "桌面捷徑已建立: $desktop_file"
}

# ─── 顯示安裝摘要 ─────────────────────────────────────────────────────────────
print_summary() {
    echo ""
    echo -e "${GREEN}${BOLD}══════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}${BOLD}  🎉 AionUi v${VERSION} 安裝完成！${NC}"
    echo -e "${GREEN}${BOLD}══════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  ${BOLD}📍 執行檔位置:${NC}  /usr/bin/AionUi"
    echo -e "  ${BOLD}📍 管理腳本:${NC}    /opt/AionUi/start-aionui.sh"
    echo ""

    if [[ "${MODE}" == "headless" ]]; then
        echo -e "  ${BOLD}🖥️  Headless 模式使用方式:${NC}"
        echo ""
        echo "    # 使用管理腳本"
        echo "    /opt/AionUi/start-aionui.sh start"
        echo "    /opt/AionUi/start-aionui.sh status"
        echo "    /opt/AionUi/start-aionui.sh stop"
        echo ""
        if command -v systemctl &>/dev/null; then
            echo "    # 或使用 systemd"
            echo "    sudo systemctl start aionui"
            echo "    sudo systemctl enable aionui  # 開機自啟"
            echo ""
        fi
        echo "    # WebUI 預設監聽 http://localhost:25808"
        echo ""
    else
        echo -e "  ${BOLD}🖥️  桌面模式使用方式:${NC}"
        echo ""
        echo "    # 直接啟動（桌面環境）"
        echo "    AionUi --no-sandbox"
        echo ""
        echo "    # 或從應用程式選單尋找 AionUi"
        echo ""
    fi

    echo -e "  ${BOLD}📖 文件:${NC}  https://github.com/iOfficeAI/AionUi"
    echo -e "  ${BOLD}🐛 回報:${NC}  https://github.com/iOfficeAI/AionUi/issues"
    echo ""

    if [[ "${MODE}" == "headless" ]]; then
        echo -e "  ${YELLOW}💡 提示:${NC}"
        echo "     • 設定工作目錄: export AIONUI_WORKDIR=/path/to/workspace"
        echo "     • 遠端存取方式: SSH 隧道 / ngrok / 直接開放 25808 端口"
        echo "     • 詳細指南: docs/SERVER_DEPLOY_GUIDE.md"
        echo ""
    fi
}

# ─── 主流程 ───────────────────────────────────────────────────────────────────
main() {
    banner

    # 安裝模式：headless (預設) 或 desktop
    MODE="${AIONUI_MODE:-headless}"
    info "安裝模式: ${BOLD}$MODE${NC}"

    # Step 1: 前置檢查
    check_prerequisites

    # Step 2: 偵測架構
    detect_arch

    # Step 3: 取得版本號
    resolve_version

    # Step 4: 下載
    download_deb

    # Step 5: 安裝
    install_deb

    # Step 6: 根據模式安裝額外元件
    if [[ "$MODE" == "headless" ]]; then
        install_headless_deps
        create_service_script
        create_systemd_service
    fi

    # Step 7: 桌面捷徑（兩種模式都建立）
    create_desktop_entry

    # 完成！
    print_summary
}

# 執行
main "$@"
