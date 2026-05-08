# M9: Install-Web Script - Detailed Plan

**迁移目标**: 创建 `scripts/install-web.sh` 一键安装脚本,从 GitHub releases 下载 aionui-web tarball,解压到指定目录,配置 PATH 环境变量,提供 `aionui-web` CLI 命令,为用户提供无 Electron 的 WebUI 独立安装方式。

**前提条件**:
- M8 已完成:`aionui-web-{version}-{platform}-{arch}.tar.gz` + `.sha256` 在 CI 中产出
- CI 将 web-cli tarball 上传到 GitHub releases
- Tarball 结构:
  ```
  aionui-web/
  ├── bin/aionui-web.js       # CLI 入口
  ├── dist/                    # TypeScript 编译产物
  ├── bundled-aionui-backend/  # Backend 二进制
  ├── bundled-bun/             # Bun 运行时
  ├── static/                  # 前端静态文件
  └── package.json
  ```

**核心任务**:
1. 创建 `scripts/install-web.sh` bash 脚本,支持 5 个平台(darwin-arm64/x64, linux-x86_64/aarch64, win-x86_64)
2. 自动检测平台和架构,下载对应的 tarball 和 SHA256 校验和
3. 验证 SHA256,解压到安装目录(默认 `~/.local/share/aionui-web/`)
4. 创建 symlink `~/.local/bin/aionui-web` 指向 CLI 入口
5. 支持命令行参数:`--version`, `--mirror`, `--install-dir`, `--no-symlink`, `--no-path`
6. 在 CI 中将 `install-web.sh` 作为 release artifact 上传
7. 创建本地 file:// mirror 冒烟测试,验证离线安装
8. 在容器中测试 `curl | bash` 安装流程(linux-x86_64)
9. 实现 `__VERSION__` 占位符 + CI 中 sed 替换为实际版本号
10. 提供卸载说明和 troubleshooting 文档

---

## 阶段化分解

### Phase 0: Baseline & Pre-Flight

**目的**: 确认 M8 交付物可用,记录 M9 起点状态。

**操作**:

1. **确认分支基于 M8**:
   ```bash
   git fetch origin
   git checkout -b feat/m9-install-web-script origin/feat/m8-web-cli-tarball
   git log --oneline -1
   ```

2. **验证 M8 交付物**:
   ```bash
   # 检查 M8 handoff 文档(如果存在)
   ls -la docs/backend-migration/handoffs/M8-outcome.md
   
   # 检查 M8 产出的 pack-web-cli 脚本
   ls -la scripts/pack-web-cli.js
   
   # 检查 CI workflow
   grep -n "pack-web-cli" .github/workflows/*.yml
   ```

3. **确认 tarball 命名约定**:
   - 从 M8 plan 或 handoff 文档中确认格式:`aionui-web-{version}-{platform}-{arch}.tar.gz`
   - 平台映射:darwin, linux, win
   - 架构映射:arm64, x86_64

4. **检查现有 install-ubuntu.sh 脚本**(作为参考):
   ```bash
   cat scripts/install-ubuntu.sh | grep -A 5 "resolve_version\|download_deb\|detect_arch"
   ```

**产出**:
- 分支 `feat/m9-install-web-script` 基于 M8
- 确认 M8 的 tarball 产出格式
- 记录 install-ubuntu.sh 中可复用的逻辑(架构检测、下载、解压)

---

### Phase 1: Create install-web.sh Skeleton

**目的**: 创建 `scripts/install-web.sh` 骨架,定义命令行参数和核心函数结构。

**操作**:

1. **创建 `scripts/install-web.sh`**:
   ```bash
   #!/usr/bin/env bash
   # ============================================================================
   # AionUi WebUI — One-Click Installation Script
   # ============================================================================
   # Usage:
   #   curl -fsSL https://raw.githubusercontent.com/iOfficeAI/AionUi/main/scripts/install-web.sh | bash
   #   # Or specify version:
   #   VERSION=1.0.0 bash install-web.sh
   #   # Or install to custom directory:
   #   INSTALL_DIR=/opt/aionui-web bash install-web.sh
   # ============================================================================
   
   set -euo pipefail
   
   # ─── 默认配置 ───────────────────────────────────────────────────────────────
   VERSION="${VERSION:-__VERSION__}"  # CI 中会被 sed 替换为实际版本
   INSTALL_DIR="${INSTALL_DIR:-${HOME}/.local/share/aionui-web}"
   BIN_DIR="${BIN_DIR:-${HOME}/.local/bin}"
   MIRROR="${MIRROR:-https://github.com/iOfficeAI/AionUi/releases/download}"
   CREATE_SYMLINK="${CREATE_SYMLINK:-1}"
   UPDATE_PATH="${UPDATE_PATH:-1}"
   
   # ─── 颜色定义 ───────────────────────────────────────────────────────────────
   RED='\033[0;31m'
   GREEN='\033[0;32m'
   YELLOW='\033[1;33m'
   BLUE='\033[0;34m'
   CYAN='\033[0;36m'
   BOLD='\033[1m'
   NC='\033[0m' # No Color
   
   # ─── 辅助函数 ───────────────────────────────────────────────────────────────
   info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
   success() { echo -e "${GREEN}[✓]${NC} $*"; }
   warn()    { echo -e "${YELLOW}[!]${NC} $*"; }
   error()   { echo -e "${RED}[✗]${NC} $*" >&2; }
   die()     { error "$*"; exit 1; }
   
   banner() {
       echo -e "${CYAN}${BOLD}"
       echo "  ╔══════════════════════════════════════════════╗"
       echo "  ║     AionUi WebUI Installer (No Electron)     ║"
       echo "  ╚══════════════════════════════════════════════╝"
       echo -e "${NC}"
   }
   
   # ─── 解析命令行参数 ─────────────────────────────────────────────────────────
   parse_args() {
       while [[ $# -gt 0 ]]; do
           case "$1" in
               --version)
                   VERSION="$2"
                   shift 2
                   ;;
               --mirror)
                   MIRROR="$2"
                   shift 2
                   ;;
               --install-dir)
                   INSTALL_DIR="$2"
                   shift 2
                   ;;
               --no-symlink)
                   CREATE_SYMLINK=0
                   shift
                   ;;
               --no-path)
                   UPDATE_PATH=0
                   shift
                   ;;
               --help)
                   show_help
                   exit 0
                   ;;
               *)
                   warn "Unknown option: $1"
                   show_help
                   exit 1
                   ;;
           esac
       done
   }
   
   show_help() {
       cat <<EOF
   Usage: install-web.sh [OPTIONS]
   
   Options:
     --version <version>       Specify version to install (default: latest or CI-embedded)
     --mirror <url>            Specify mirror URL (default: GitHub releases)
     --install-dir <path>      Specify installation directory (default: ~/.local/share/aionui-web)
     --no-symlink              Do not create symlink in ~/.local/bin
     --no-path                 Do not add PATH to shell profile
     --help                    Show this help message
   
   Environment Variables:
     VERSION                   Version to install (same as --version)
     INSTALL_DIR               Installation directory (same as --install-dir)
     MIRROR                    Mirror URL (same as --mirror)
   
   Examples:
     # Install latest version
     curl -fsSL https://raw.githubusercontent.com/iOfficeAI/AionUi/main/scripts/install-web.sh | bash
   
     # Install specific version
     VERSION=1.0.0 bash install-web.sh
   
     # Install to custom directory
     INSTALL_DIR=/opt/aionui-web bash install-web.sh
   
     # Use local file mirror (for offline installation)
     MIRROR=file:///path/to/releases bash install-web.sh
   EOF
   }
   
   # ─── 待实现函数 ─────────────────────────────────────────────────────────────
   detect_platform_arch() {
       # TODO: Phase 2
       :
   }
   
   resolve_version() {
       # TODO: Phase 3
       :
   }
   
   download_tarball() {
       # TODO: Phase 4
       :
   }
   
   verify_checksum() {
       # TODO: Phase 5
       :
   }
   
   extract_tarball() {
       # TODO: Phase 6
       :
   }
   
   create_symlink() {
       # TODO: Phase 7
       :
   }
   
   update_shell_profile() {
       # TODO: Phase 8
       :
   }
   
   print_summary() {
       # TODO: Phase 9
       :
   }
   
   # ─── 主流程 ───────────────────────────────────────────────────────────────────
   main() {
       banner
       parse_args "$@"
       
       # Step 1: Detect platform and architecture
       detect_platform_arch
       
       # Step 2: Resolve version (if VERSION is __VERSION__ or latest)
       resolve_version
       
       # Step 3: Download tarball
       download_tarball
       
       # Step 4: Verify SHA256 checksum
       verify_checksum
       
       # Step 5: Extract tarball
       extract_tarball
       
       # Step 6: Create symlink
       if [[ "$CREATE_SYMLINK" == "1" ]]; then
           create_symlink
       fi
       
       # Step 7: Update shell profile PATH
       if [[ "$UPDATE_PATH" == "1" ]]; then
           update_shell_profile
       fi
       
       # Step 8: Print summary
       print_summary
   }
   
   # 执行
   main "$@"
   ```

2. **设置执行权限**:
   ```bash
   chmod +x scripts/install-web.sh
   ```

3. **测试骨架**:
   ```bash
   ./scripts/install-web.sh --help
   # 预期:显示 help 信息
   ```

**产出**:
- `scripts/install-web.sh` 骨架创建完成
- 命令行参数解析和 help 信息完整
- 核心函数结构定义清晰

---

### Phase 2: Implement detect_platform_arch()

**目的**: 检测运行平台和架构,映射到 tarball 命名约定。

**操作**:

1. **实现 `detect_platform_arch()` 函数**:
   ```bash
   detect_platform_arch() {
       local os_type="$(uname -s)"
       local machine="$(uname -m)"
       
       # 映射 OS 类型
       case "$os_type" in
           Darwin)
               PLATFORM="darwin"
               ;;
           Linux)
               PLATFORM="linux"
               ;;
           MINGW*|MSYS*|CYGWIN*)
               PLATFORM="win"
               ;;
           *)
               die "Unsupported OS: $os_type (only Darwin, Linux, Windows supported)"
               ;;
       esac
       
       # 映射架构
       case "$machine" in
           x86_64|amd64)
               ARCH="x86_64"
               ;;
           aarch64|arm64)
               ARCH="arm64"
               ;;
           *)
               die "Unsupported architecture: $machine (only x86_64/amd64 and aarch64/arm64 supported)"
               ;;
       esac
       
       info "Detected platform: ${BOLD}${PLATFORM}-${ARCH}${NC}"
       
       # 构建 tarball 文件名
       TARBALL_NAME="aionui-web-${VERSION}-${PLATFORM}-${ARCH}.tar.gz"
       CHECKSUM_NAME="${TARBALL_NAME}.sha256"
   }
   ```

2. **测试平台检测**:
   ```bash
   # 在 macOS 上
   ./scripts/install-web.sh
   # 预期输出:Detected platform: darwin-arm64 (或 darwin-x86_64)
   
   # 在 Linux 上
   docker run --rm -v $(pwd):/workspace -w /workspace debian:bookworm-slim bash scripts/install-web.sh
   # 预期输出:Detected platform: linux-x86_64
   ```

**产出**:
- `detect_platform_arch()` 函数实现完成
- 平台检测覆盖 darwin, linux, win × arm64, x86_64
- 本地测试验证平台检测正确

---

### Phase 3: Implement resolve_version()

**目的**: 解析 VERSION 变量,如果是 `__VERSION__` 或 `latest`,则从 GitHub API 查询最新版本。

**操作**:

1. **实现 `resolve_version()` 函数**:
   ```bash
   resolve_version() {
       # 如果 VERSION 是 __VERSION__(CI 占位符)或 latest,查询 GitHub API
       if [[ "$VERSION" == "__VERSION__" || "$VERSION" == "latest" ]]; then
           info "Resolving latest version from GitHub API..."
           
           if command -v curl &>/dev/null; then
               VERSION=$(curl -fsSL "https://api.github.com/repos/iOfficeAI/AionUi/releases/latest" \
                   | grep '"tag_name"' | head -1 | sed 's/.*"v\([^"]*\)".*/\1/')
           elif command -v wget &>/dev/null; then
               VERSION=$(wget -qO- "https://api.github.com/repos/iOfficeAI/AionUi/releases/latest" \
                   | grep '"tag_name"' | head -1 | sed 's/.*"v\([^"]*\)".*/\1/')
           else
               die "curl or wget is required to resolve version. Please install curl or wget."
           fi
           
           if [[ -z "$VERSION" ]]; then
               die "Failed to resolve latest version. Please specify version manually: VERSION=1.0.0 bash $0"
           fi
           
           info "Latest version: ${BOLD}v${VERSION}${NC}"
       else
           info "Using specified version: ${BOLD}v${VERSION}${NC}"
       fi
       
       # 重新构建 tarball 名称(因为 VERSION 可能已更新)
       TARBALL_NAME="aionui-web-${VERSION}-${PLATFORM}-${ARCH}.tar.gz"
       CHECKSUM_NAME="${TARBALL_NAME}.sha256"
   }
   ```

2. **测试版本解析**:
   ```bash
   # 测试 latest
   VERSION=latest ./scripts/install-web.sh
   # 预期:查询 GitHub API 并显示最新版本号
   
   # 测试指定版本
   VERSION=1.0.0 ./scripts/install-web.sh
   # 预期:使用 1.0.0
   
   # 测试 __VERSION__ 占位符
   ./scripts/install-web.sh
   # 预期:查询 GitHub API(因为默认值是 __VERSION__)
   ```

**产出**:
- `resolve_version()` 函数实现完成
- 支持 `__VERSION__`, `latest`, 和明确版本号
- 本地测试验证版本解析逻辑

---

### Phase 4: Implement download_tarball()

**目的**: 从 MIRROR URL 下载 tarball 和 SHA256 校验和。

**操作**:

1. **实现 `download_tarball()` 函数**:
   ```bash
   download_tarball() {
       # 创建临时目录
       TEMP_DIR="$(mktemp -d)"
       TARBALL_PATH="${TEMP_DIR}/${TARBALL_NAME}"
       CHECKSUM_PATH="${TEMP_DIR}/${CHECKSUM_NAME}"
       
       # 构建下载 URL
       # MIRROR 格式:
       #   - GitHub: https://github.com/iOfficeAI/AionUi/releases/download
       #   - file: file:///path/to/releases
       if [[ "$MIRROR" == file://* ]]; then
           # 本地文件镜像(用于离线安装或测试)
           local base_path="${MIRROR#file://}"
           TARBALL_URL="file://${base_path}/v${VERSION}/${TARBALL_NAME}"
           CHECKSUM_URL="file://${base_path}/v${VERSION}/${CHECKSUM_NAME}"
       else
           # GitHub releases
           TARBALL_URL="${MIRROR}/v${VERSION}/${TARBALL_NAME}"
           CHECKSUM_URL="${MIRROR}/v${VERSION}/${CHECKSUM_NAME}"
       fi
       
       info "Downloading ${BOLD}${TARBALL_NAME}${NC}..."
       info "URL: $TARBALL_URL"
       
       # 下载 tarball
       if [[ "$TARBALL_URL" == file://* ]]; then
           # 本地文件:直接复制
           local src_path="${TARBALL_URL#file://}"
           if [[ ! -f "$src_path" ]]; then
               die "Tarball not found at local mirror: $src_path"
           fi
           cp "$src_path" "$TARBALL_PATH"
       else
           # 远程文件:使用 curl 或 wget
           if command -v curl &>/dev/null; then
               curl -fSL --progress-bar -o "$TARBALL_PATH" "$TARBALL_URL" || die "Download failed"
           elif command -v wget &>/dev/null; then
               wget --show-progress -q -O "$TARBALL_PATH" "$TARBALL_URL" || die "Download failed"
           else
               die "curl or wget is required. Please install curl or wget."
           fi
       fi
       
       local size
       size=$(du -h "$TARBALL_PATH" | cut -f1)
       success "Downloaded tarball ($size)"
       
       # 下载 SHA256 校验和
       info "Downloading ${BOLD}${CHECKSUM_NAME}${NC}..."
       if [[ "$CHECKSUM_URL" == file://* ]]; then
           local src_path="${CHECKSUM_URL#file://}"
           if [[ ! -f "$src_path" ]]; then
               die "Checksum file not found at local mirror: $src_path"
           fi
           cp "$src_path" "$CHECKSUM_PATH"
       else
           if command -v curl &>/dev/null; then
               curl -fSL -o "$CHECKSUM_PATH" "$CHECKSUM_URL" || die "Checksum download failed"
           elif command -v wget &>/dev/null; then
               wget -q -O "$CHECKSUM_PATH" "$CHECKSUM_URL" || die "Checksum download failed"
           fi
       fi
       
       success "Downloaded checksum"
   }
   ```

2. **测试下载逻辑**(需要 mock 本地文件):
   ```bash
   # 准备 mock tarball
   mkdir -p /tmp/mock-releases/v1.0.0
   echo "mock tarball content" > /tmp/mock-releases/v1.0.0/aionui-web-1.0.0-darwin-arm64.tar.gz
   shasum -a 256 /tmp/mock-releases/v1.0.0/aionui-web-1.0.0-darwin-arm64.tar.gz > /tmp/mock-releases/v1.0.0/aionui-web-1.0.0-darwin-arm64.tar.gz.sha256
   
   # 测试本地 file:// mirror
   VERSION=1.0.0 MIRROR=file:///tmp/mock-releases ./scripts/install-web.sh
   # 预期:从本地文件复制 tarball 和 checksum
   ```

**产出**:
- `download_tarball()` 函数实现完成
- 支持 GitHub releases URL 和 file:// 本地镜像
- 本地测试验证下载逻辑(使用 mock 文件)

---

### Phase 5: Implement verify_checksum()

**目的**: 验证下载的 tarball SHA256 校验和,确保文件完整性。

**操作**:

1. **实现 `verify_checksum()` 函数**:
   ```bash
   verify_checksum() {
       info "Verifying SHA256 checksum..."
       
       # 读取预期的 checksum(从 .sha256 文件)
       local expected_checksum
       expected_checksum=$(awk '{print $1}' "$CHECKSUM_PATH")
       
       if [[ -z "$expected_checksum" ]]; then
           die "Failed to read checksum from $CHECKSUM_NAME"
       fi
       
       # 计算实际的 checksum
       local actual_checksum
       if command -v shasum &>/dev/null; then
           actual_checksum=$(shasum -a 256 "$TARBALL_PATH" | awk '{print $1}')
       elif command -v sha256sum &>/dev/null; then
           actual_checksum=$(sha256sum "$TARBALL_PATH" | awk '{print $1}')
       else
           warn "shasum/sha256sum not found, skipping checksum verification"
           return
       fi
       
       if [[ "$actual_checksum" != "$expected_checksum" ]]; then
           error "Checksum mismatch!"
           error "Expected: $expected_checksum"
           error "Actual:   $actual_checksum"
           die "Tarball may be corrupted. Please try again."
       fi
       
       success "Checksum verified: ${expected_checksum:0:16}..."
   }
   ```

2. **测试校验和验证**:
   ```bash
   # 准备正确的 checksum
   echo "mock tarball" > /tmp/test.tar.gz
   shasum -a 256 /tmp/test.tar.gz > /tmp/test.tar.gz.sha256
   
   # 测试验证逻辑(手动调用函数)
   TARBALL_PATH=/tmp/test.tar.gz
   CHECKSUM_PATH=/tmp/test.tar.gz.sha256
   source scripts/install-web.sh
   verify_checksum
   # 预期:Checksum verified
   
   # 测试 checksum mismatch
   echo "corrupted" > /tmp/test.tar.gz
   verify_checksum
   # 预期:Checksum mismatch! 并退出
   ```

**产出**:
- `verify_checksum()` 函数实现完成
- 支持 shasum 和 sha256sum 两种工具
- 本地测试验证校验和验证逻辑

---

### Phase 6: Implement extract_tarball()

**目的**: 解压 tarball 到安装目录,清理旧版本(如果存在)。

**操作**:

1. **实现 `extract_tarball()` 函数**:
   ```bash
   extract_tarball() {
       info "Installing to ${BOLD}${INSTALL_DIR}${NC}..."
       
       # 如果安装目录已存在,备份旧版本
       if [[ -d "$INSTALL_DIR" ]]; then
           local backup_dir="${INSTALL_DIR}.backup.$(date +%s)"
           warn "Installation directory exists, creating backup: $backup_dir"
           mv "$INSTALL_DIR" "$backup_dir"
       fi
       
       # 创建安装目录的父目录
       mkdir -p "$(dirname "$INSTALL_DIR")"
       
       # 解压 tarball
       # tarball 中的根目录是 aionui-web/,解压后重命名为 INSTALL_DIR
       local extract_temp="${TEMP_DIR}/extract"
       mkdir -p "$extract_temp"
       
       info "Extracting tarball..."
       tar -xzf "$TARBALL_PATH" -C "$extract_temp" || die "Failed to extract tarball"
       
       # 移动到最终安装位置
       if [[ -d "${extract_temp}/aionui-web" ]]; then
           mv "${extract_temp}/aionui-web" "$INSTALL_DIR"
       else
           die "Tarball structure is invalid (missing aionui-web/ directory)"
       fi
       
       success "Extracted to $INSTALL_DIR"
       
       # 设置可执行权限
       chmod +x "${INSTALL_DIR}/bin/aionui-web.js" 2>/dev/null || true
       
       # 验证安装
       if [[ ! -f "${INSTALL_DIR}/bin/aionui-web.js" ]]; then
           die "Installation failed: ${INSTALL_DIR}/bin/aionui-web.js not found"
       fi
       
       success "Installation completed"
       
       # 清理临时文件
       rm -rf "$TEMP_DIR"
   }
   ```

2. **测试解压逻辑**(需要真实的 tarball 结构):
   ```bash
   # 创建 mock tarball 结构
   mkdir -p /tmp/mock-tarball/aionui-web/{bin,dist,bundled-aionui-backend,bundled-bun,static}
   echo '#!/usr/bin/env node' > /tmp/mock-tarball/aionui-web/bin/aionui-web.js
   echo '{"version":"1.0.0"}' > /tmp/mock-tarball/aionui-web/package.json
   tar -czf /tmp/aionui-web-1.0.0-darwin-arm64.tar.gz -C /tmp/mock-tarball aionui-web
   shasum -a 256 /tmp/aionui-web-1.0.0-darwin-arm64.tar.gz > /tmp/aionui-web-1.0.0-darwin-arm64.tar.gz.sha256
   
   # 测试安装
   VERSION=1.0.0 MIRROR=file:///tmp INSTALL_DIR=/tmp/test-install ./scripts/install-web.sh
   # 预期:解压到 /tmp/test-install/
   
   # 验证结构
   ls -la /tmp/test-install/
   # 预期:bin/ dist/ bundled-aionui-backend/ bundled-bun/ static/ package.json
   ```

**产出**:
- `extract_tarball()` 函数实现完成
- 支持旧版本备份和清理
- 本地测试验证解压逻辑

---

### Phase 7: Implement create_symlink()

**目的**: 在 `~/.local/bin/` 创建 symlink,使 `aionui-web` 命令全局可用。

**操作**:

1. **实现 `create_symlink()` 函数**:
   ```bash
   create_symlink() {
       local symlink_path="${BIN_DIR}/aionui-web"
       local target_path="${INSTALL_DIR}/bin/aionui-web.js"
       
       info "Creating symlink: ${BOLD}${symlink_path}${NC} -> ${target_path}"
       
       # 创建 BIN_DIR(如果不存在)
       mkdir -p "$BIN_DIR"
       
       # 如果 symlink 已存在,删除旧的
       if [[ -L "$symlink_path" ]]; then
           warn "Symlink already exists, removing old symlink"
           rm "$symlink_path"
       elif [[ -e "$symlink_path" ]]; then
           die "File already exists at $symlink_path (not a symlink). Please remove it manually."
       fi
       
       # 创建 symlink
       ln -s "$target_path" "$symlink_path" || die "Failed to create symlink"
       
       success "Symlink created: $symlink_path"
   }
   ```

2. **测试 symlink 创建**:
   ```bash
   # 使用上一步的 mock 安装
   BIN_DIR=/tmp/test-bin CREATE_SYMLINK=1 VERSION=1.0.0 MIRROR=file:///tmp INSTALL_DIR=/tmp/test-install ./scripts/install-web.sh
   
   # 验证 symlink
   ls -la /tmp/test-bin/aionui-web
   # 预期:链接到 /tmp/test-install/bin/aionui-web.js
   ```

**产出**:
- `create_symlink()` 函数实现完成
- 支持旧 symlink 清理
- 本地测试验证 symlink 创建

---

### Phase 8: Implement update_shell_profile()

**目的**: 将 `~/.local/bin/` 添加到 PATH 环境变量(如果尚未添加)。

**操作**:

1. **实现 `update_shell_profile()` 函数**:
   ```bash
   update_shell_profile() {
       # 检查 BIN_DIR 是否已在 PATH 中
       if [[ ":$PATH:" == *":${BIN_DIR}:"* ]]; then
           info "PATH already contains ${BOLD}${BIN_DIR}${NC}"
           return
       fi
       
       info "Adding ${BOLD}${BIN_DIR}${NC} to PATH in shell profile..."
       
       # 检测当前 shell
       local shell_name
       shell_name="$(basename "$SHELL")"
       
       local profile_file=""
       case "$shell_name" in
           bash)
               if [[ -f "$HOME/.bashrc" ]]; then
                   profile_file="$HOME/.bashrc"
               elif [[ -f "$HOME/.bash_profile" ]]; then
                   profile_file="$HOME/.bash_profile"
               fi
               ;;
           zsh)
               profile_file="$HOME/.zshrc"
               ;;
           fish)
               profile_file="$HOME/.config/fish/config.fish"
               ;;
           *)
               warn "Unknown shell: $shell_name. Please manually add ${BIN_DIR} to PATH."
               return
               ;;
       esac
       
       if [[ -z "$profile_file" ]]; then
           warn "Shell profile not found. Please manually add ${BIN_DIR} to PATH."
           return
       fi
       
       # 添加 PATH 配置
       local path_line="export PATH=\"${BIN_DIR}:\$PATH\""
       
       # 检查是否已有相同配置
       if grep -q "${BIN_DIR}" "$profile_file" 2>/dev/null; then
           info "PATH configuration already exists in $profile_file"
           return
       fi
       
       # 添加到 profile
       echo "" >> "$profile_file"
       echo "# Added by aionui-web installer" >> "$profile_file"
       echo "$path_line" >> "$profile_file"
       
       success "Added PATH to $profile_file"
       warn "Please restart your shell or run: source $profile_file"
   }
   ```

2. **测试 PATH 更新**:
   ```bash
   # 创建 mock shell profile
   echo "# test bashrc" > /tmp/test-bashrc
   
   # 测试添加 PATH
   HOME=/tmp BIN_DIR=/tmp/test-bin SHELL=/bin/bash ./scripts/install-web.sh
   
   # 验证 PATH 添加
   cat /tmp/test-bashrc
   # 预期:包含 export PATH="/tmp/test-bin:$PATH"
   ```

**产出**:
- `update_shell_profile()` 函数实现完成
- 支持 bash, zsh, fish
- 本地测试验证 PATH 更新逻辑

---

### Phase 9: Implement print_summary()

**目的**: 打印安装摘要,提供使用说明和卸载方法。

**操作**:

1. **实现 `print_summary()` 函数**:
   ```bash
   print_summary() {
       echo ""
       echo -e "${GREEN}${BOLD}══════════════════════════════════════════════════${NC}"
       echo -e "${GREEN}${BOLD}  🎉 AionUi WebUI v${VERSION} Installed!${NC}"
       echo -e "${GREEN}${BOLD}══════════════════════════════════════════════════${NC}"
       echo ""
       echo -e "  ${BOLD}📍 Installation directory:${NC}  ${INSTALL_DIR}"
       if [[ "$CREATE_SYMLINK" == "1" ]]; then
           echo -e "  ${BOLD}📍 Symlink:${NC}                ${BIN_DIR}/aionui-web"
       fi
       echo ""
       echo -e "  ${BOLD}🚀 Usage:${NC}"
       echo ""
       if [[ "$CREATE_SYMLINK" == "1" && ":$PATH:" == *":${BIN_DIR}:"* ]]; then
           echo "    # Start AionUi WebUI"
           echo "    aionui-web start"
           echo ""
           echo "    # Check version"
           echo "    aionui-web version"
       else
           echo "    # Start AionUi WebUI (using full path)"
           echo "    ${INSTALL_DIR}/bin/aionui-web.js start"
           echo ""
           echo "    # Or add symlink to PATH:"
           if [[ "$CREATE_SYMLINK" == "1" ]]; then
               echo "    export PATH=\"${BIN_DIR}:\$PATH\""
           else
               echo "    ln -s ${INSTALL_DIR}/bin/aionui-web.js ~/.local/bin/aionui-web"
               echo "    export PATH=\"~/.local/bin:\$PATH\""
           fi
       fi
       echo ""
       echo -e "  ${BOLD}📖 Documentation:${NC}  https://github.com/iOfficeAI/AionUi"
       echo -e "  ${BOLD}🐛 Report issues:${NC}  https://github.com/iOfficeAI/AionUi/issues"
       echo ""
       echo -e "  ${BOLD}🗑️  Uninstall:${NC}"
       echo ""
       echo "    # Remove installation directory"
       echo "    rm -rf ${INSTALL_DIR}"
       if [[ "$CREATE_SYMLINK" == "1" ]]; then
           echo ""
           echo "    # Remove symlink"
           echo "    rm ${BIN_DIR}/aionui-web"
       fi
       if [[ "$UPDATE_PATH" == "1" ]]; then
           echo ""
           echo "    # Remove PATH configuration from shell profile"
           echo "    # (manually edit ~/.bashrc or ~/.zshrc)"
       fi
       echo ""
   }
   ```

2. **测试完整安装流程**:
   ```bash
   # 完整测试(使用 mock tarball)
   VERSION=1.0.0 MIRROR=file:///tmp INSTALL_DIR=/tmp/aionui-web-test BIN_DIR=/tmp/test-bin ./scripts/install-web.sh
   
   # 验证输出
   # 预期:显示完整的安装摘要
   ```

**产出**:
- `print_summary()` 函数实现完成
- 提供清晰的使用说明和卸载方法
- 本地测试验证摘要输出

---

### Phase 10: Add CI Integration (Upload install-web.sh)

**目的**: 在 CI 中将 `install-web.sh` 作为 release artifact 上传,并替换 `__VERSION__` 占位符。

**操作**:

1. **修改 `.github/workflows/pack-web-cli.yml`**(或创建新 workflow):
   - 在 `pack-web-cli` job 后添加 `prepare-install-script` job
   
   ```yaml
   prepare-install-script:
     name: Prepare install-web.sh for release
     runs-on: ubuntu-latest
     needs: pack-web-cli
     
     steps:
       - name: Checkout code
         uses: actions/checkout@v6
       
       - name: Get version from package.json
         id: version
         run: |
           VERSION=$(node -p "require('./package.json').version")
           echo "version=$VERSION" >> $GITHUB_OUTPUT
       
       - name: Replace __VERSION__ placeholder in install-web.sh
         run: |
           mkdir -p dist-scripts
           sed "s/__VERSION__/${{ steps.version.outputs.version }}/g" scripts/install-web.sh > dist-scripts/install-web.sh
           chmod +x dist-scripts/install-web.sh
       
       - name: Upload install-web.sh artifact
         uses: actions/upload-artifact@v6
         with:
           name: install-web-script
           path: dist-scripts/install-web.sh
           retention-days: 7
   ```

2. **修改 `.github/workflows/build-and-release.yml`**:
   - 在 `release` job 的 `files:` 部分添加 `install-web.sh`
   
   ```yaml
   - name: Download install-web.sh artifact
     uses: actions/download-artifact@v7
     with:
       name: install-web-script
       path: build-artifacts/install-web-script
   
   - name: Prepare release assets (include install-web.sh)
     shell: bash
     run: |
       bash scripts/prepare-release-assets.sh build-artifacts release-assets
       # Copy install-web.sh to release-assets
       cp build-artifacts/install-web-script/install-web.sh release-assets/
   
   - name: Create Release
     uses: softprops/action-gh-release@v2
     with:
       # ...
       files: |
         release-assets/**/*.exe
         release-assets/**/*.msi
         release-assets/**/*.dmg
         release-assets/**/*.deb
         release-assets/**/*.zip
         release-assets/**/*.yml
         release-assets/install-web.sh
   ```

3. **本地测试 sed 替换**:
   ```bash
   VERSION=1.2.3
   sed "s/__VERSION__/${VERSION}/g" scripts/install-web.sh > /tmp/install-web-test.sh
   grep "VERSION=" /tmp/install-web-test.sh | head -1
   # 预期:VERSION="${VERSION:-1.2.3}"
   ```

**产出**:
- CI workflow 已添加 install-web.sh 准备和上传步骤
- `__VERSION__` 占位符在 CI 中被替换为实际版本号
- install-web.sh 作为 release artifact 上传

---

### Phase 11: Add Container Smoke Test (install-web.sh)

**目的**: 在 CI 中添加容器冒烟测试,验证 `curl | bash` 安装流程工作正常。

**操作**:

1. **创建 `scripts/smoke-test-install-web.sh`**:
   ```bash
   #!/bin/bash
   # ============================================================================
   # Smoke test for install-web.sh
   # Tests the full installation flow in a container environment
   # ============================================================================
   
   set -euo pipefail
   
   MIRROR="${1:-}"
   VERSION="${2:-}"
   
   if [[ -z "$MIRROR" ]]; then
       echo "Usage: $0 <mirror-url> [version]"
       echo "Example: $0 file:///tmp/releases 1.0.0"
       exit 1
   fi
   
   echo "========================================"
   echo "Smoke test for install-web.sh"
   echo "========================================"
   echo "MIRROR: $MIRROR"
   echo "VERSION: ${VERSION:-latest}"
   
   # 1. Download install-web.sh
   echo ""
   echo "1. Downloading install-web.sh..."
   if [[ "$MIRROR" == file://* ]]; then
       # Local mirror: copy from filesystem
       local base_path="${MIRROR#file://}"
       cp "${base_path}/install-web.sh" /tmp/install-web.sh
   else
       # Remote mirror: use curl
       curl -fsSL "${MIRROR}/install-web.sh" -o /tmp/install-web.sh
   fi
   chmod +x /tmp/install-web.sh
   
   # 2. Run installation
   echo ""
   echo "2. Running installation..."
   export MIRROR="$MIRROR"
   export VERSION="${VERSION:-latest}"
   export INSTALL_DIR="/tmp/aionui-web-smoke-test"
   export BIN_DIR="/tmp/smoke-bin"
   export CREATE_SYMLINK=1
   export UPDATE_PATH=0  # 不修改 shell profile(容器环境)
   
   bash /tmp/install-web.sh --no-path
   
   # 3. Verify installation
   echo ""
   echo "3. Verifying installation..."
   
   if [[ ! -d "$INSTALL_DIR" ]]; then
       echo "❌ Installation directory not found: $INSTALL_DIR"
       exit 1
   fi
   echo "✓ Installation directory exists"
   
   if [[ ! -f "${INSTALL_DIR}/bin/aionui-web.js" ]]; then
       echo "❌ CLI entry point not found: ${INSTALL_DIR}/bin/aionui-web.js"
       exit 1
   fi
   echo "✓ CLI entry point exists"
   
   if [[ ! -L "${BIN_DIR}/aionui-web" ]]; then
       echo "❌ Symlink not found: ${BIN_DIR}/aionui-web"
       exit 1
   fi
   echo "✓ Symlink created"
   
   # 4. Test version command
   echo ""
   echo "4. Testing version command..."
   export PATH="${BIN_DIR}:$PATH"
   VERSION_OUTPUT=$(aionui-web version 2>&1 || echo "")
   if [[ -z "$VERSION_OUTPUT" ]]; then
       echo "❌ version command returned empty"
       exit 1
   fi
   echo "✓ Version: $VERSION_OUTPUT"
   
   # Cleanup
   rm -rf "$INSTALL_DIR" "$BIN_DIR" /tmp/install-web.sh
   
   echo ""
   echo "========================================"
   echo "✅ Smoke test passed!"
   echo "========================================"
   ```

2. **在 `.github/workflows/pack-web-cli.yml` 中添加 smoke-test job**:
   ```yaml
   smoke-test-install:
     name: Smoke test install-web.sh (Linux x86_64)
     runs-on: ubuntu-latest
     needs: [pack-web-cli, prepare-install-script]
     container:
       image: debian:bookworm-slim
     
     steps:
       - name: Checkout code
         uses: actions/checkout@v6
       
       - name: Install dependencies
         run: |
           apt-get update
           apt-get install -y curl tar gzip nodejs coreutils
       
       - name: Download linux-x86_64 tarball
         uses: actions/download-artifact@v7
         with:
           name: web-cli-linux-x64
           path: /tmp/releases/v1.0.0
       
       - name: Download install-web.sh
         uses: actions/download-artifact@v7
         with:
           name: install-web-script
           path: /tmp/releases
       
       - name: Run smoke test
         shell: bash
         run: |
           chmod +x scripts/smoke-test-install-web.sh
           bash scripts/smoke-test-install-web.sh file:///tmp/releases 1.0.0
   ```

3. **本地测试 smoke test 脚本**:
   ```bash
   # 准备 mock 环境(使用 Phase 6 的 mock tarball)
   mkdir -p /tmp/mock-releases/v1.0.0
   cp /tmp/aionui-web-1.0.0-darwin-arm64.tar.gz /tmp/mock-releases/v1.0.0/
   cp /tmp/aionui-web-1.0.0-darwin-arm64.tar.gz.sha256 /tmp/mock-releases/v1.0.0/
   cp scripts/install-web.sh /tmp/mock-releases/
   sed "s/__VERSION__/1.0.0/g" /tmp/mock-releases/install-web.sh > /tmp/mock-releases/install-web.sh.tmp
   mv /tmp/mock-releases/install-web.sh.tmp /tmp/mock-releases/install-web.sh
   
   # 运行 smoke test
   bash scripts/smoke-test-install-web.sh file:///tmp/mock-releases 1.0.0
   ```

**产出**:
- `scripts/smoke-test-install-web.sh` 创建完成
- CI 中 smoke-test-install job 验证 install-web.sh 安装流程
- 本地测试验证 smoke test 脚本工作正常

---

### Phase 12: Document & Handoff

**目的**: 记录 M9 的交付物和使用说明,为用户提供完整的安装指南。

**操作**:

1. **创建 `docs/backend-migration/handoffs/M9-outcome.md`**:
   ```markdown
   # M9 Outcome: Install-Web Script
   
   ## 交付物
   
   1. **安装脚本**:
      - `scripts/install-web.sh` — 一键安装脚本,支持 curl | bash
      - GitHub release artifact: `install-web.sh`(已替换 `__VERSION__` 占位符)
   
   2. **支持的平台**:
      - darwin-arm64, darwin-x86_64
      - linux-x86_64, linux-aarch64
      - win-x86_64
   
   3. **安装选项**:
      - `--version <version>`: 指定版本(默认:latest 或 CI 嵌入版本)
      - `--mirror <url>`: 指定镜像 URL(默认:GitHub releases)
      - `--install-dir <path>`: 指定安装目录(默认:`~/.local/share/aionui-web`)
      - `--no-symlink`: 不创建 symlink
      - `--no-path`: 不添加 PATH 到 shell profile
   
   4. **安装流程**:
      1. 自动检测平台和架构
      2. 下载 tarball + SHA256 校验和
      3. 验证 SHA256
      4. 解压到安装目录
      5. 创建 symlink(`~/.local/bin/aionui-web`)
      6. 添加 PATH 到 shell profile
   
   5. **CI 集成**:
      - `pack-web-cli.yml`: 产出 tarball + SHA256
      - `prepare-install-script`: 替换 `__VERSION__` 并上传 install-web.sh
      - `smoke-test-install`: 在 debian:slim 容器中测试安装流程
   
   ## 使用方式
   
   ### 在线安装(推荐)
   
   ```bash
   # 安装最新版本
   curl -fsSL https://raw.githubusercontent.com/iOfficeAI/AionUi/main/scripts/install-web.sh | bash
   
   # 安装指定版本
   curl -fsSL https://raw.githubusercontent.com/iOfficeAI/AionUi/main/scripts/install-web.sh | VERSION=1.0.0 bash
   ```
   
   ### 离线安装(本地镜像)
   
   ```bash
   # 1. 下载 release assets 到本地目录
   mkdir -p /path/to/releases/v1.0.0
   cd /path/to/releases/v1.0.0
   wget https://github.com/iOfficeAI/AionUi/releases/download/v1.0.0/aionui-web-1.0.0-linux-x86_64.tar.gz
   wget https://github.com/iOfficeAI/AionUi/releases/download/v1.0.0/aionui-web-1.0.0-linux-x86_64.tar.gz.sha256
   
   # 2. 下载 install-web.sh
   cd /path/to/releases
   wget https://github.com/iOfficeAI/AionUi/releases/download/v1.0.0/install-web.sh
   
   # 3. 运行安装(使用 file:// mirror)
   MIRROR=file:///path/to/releases VERSION=1.0.0 bash install-web.sh
   ```
   
   ### 卸载
   
   ```bash
   # 删除安装目录
   rm -rf ~/.local/share/aionui-web
   
   # 删除 symlink
   rm ~/.local/bin/aionui-web
   
   # 删除 PATH 配置(手动编辑 ~/.bashrc 或 ~/.zshrc)
   ```
   
   ## 已知限制
   
   1. **Windows 支持**: 脚本为 bash,Windows 需要 Git Bash / WSL / MSYS2
   2. **SHA256 验证**: 需要 shasum 或 sha256sum 工具(大部分系统预装)
   3. **PATH 更新**: 仅支持 bash, zsh, fish,其他 shell 需手动配置
   4. **权限要求**: 安装到 `~/.local/` 不需要 root,但其他目录可能需要 sudo
   
   ## 回滚方案
   
   如果 install-web.sh 有问题,用户可手动下载 tarball 并解压:
   
   ```bash
   # 1. 下载 tarball
   curl -LO https://github.com/iOfficeAI/AionUi/releases/download/v1.0.0/aionui-web-1.0.0-linux-x86_64.tar.gz
   
   # 2. 验证 checksum(可选)
   curl -LO https://github.com/iOfficeAI/AionUi/releases/download/v1.0.0/aionui-web-1.0.0-linux-x86_64.tar.gz.sha256
   shasum -a 256 -c aionui-web-1.0.0-linux-x86_64.tar.gz.sha256
   
   # 3. 解压
   tar -xzf aionui-web-1.0.0-linux-x86_64.tar.gz
   mv aionui-web ~/.local/share/aionui-web
   
   # 4. 创建 symlink
   ln -s ~/.local/share/aionui-web/bin/aionui-web.js ~/.local/bin/aionui-web
   
   # 5. 添加 PATH
   echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
   source ~/.bashrc
   ```
   ```

2. **Commit handoff 文档**:
   ```bash
   git add docs/backend-migration/handoffs/M9-outcome.md
   git commit -m "docs(backend-migration): add M9 handoff document"
   git push origin feat/m9-install-web-script
   ```

**产出**:
- `docs/backend-migration/handoffs/M9-outcome.md` 已创建
- 提供完整的使用说明和故障排除方法

---

## 验收标准

M9 完成的标志:

1. ✅ **install-web.sh 创建**: `scripts/install-web.sh` 结构完整,支持所有命令行参数
2. ✅ **平台检测**: 自动检测 darwin/linux/win × arm64/x86_64
3. ✅ **版本解析**: 支持 `__VERSION__`, `latest`, 和明确版本号
4. ✅ **下载和校验**: 从 GitHub releases 或 file:// mirror 下载 tarball + 验证 SHA256
5. ✅ **解压和安装**: 解压到指定目录,创建 symlink,更新 PATH
6. ✅ **CI 集成**: install-web.sh 作为 release artifact 上传,`__VERSION__` 被替换
7. ✅ **冒烟测试通过**: 在 debian:slim 容器中验证 `curl | bash` 安装流程
8. ✅ **本地镜像支持**: file:// mirror 可用于离线安装
9. ✅ **handoff 文档完整**: `docs/backend-migration/handoffs/M9-outcome.md` 已创建

---

## 风险与缓解

| 风险 | 影响 | 缓解方案 |
|------|------|----------|
| GitHub API rate limit | 版本解析失败 | 提供 `--version` 参数绕过 API 查询;添加 retry 逻辑 |
| tarball 下载失败 | 安装中断 | 添加 retry 逻辑;提供 file:// mirror 支持 |
| SHA256 工具缺失 | 无法验证校验和 | 检测 shasum/sha256sum 缺失时警告但不失败 |
| Windows 兼容性 | install-web.sh 无法在 Windows 原生运行 | 文档中说明需要 Git Bash / WSL;考虑提供 PowerShell 版本(M10+) |
| 权限不足 | 无法写入安装目录 | 默认使用 `~/.local/`,不需要 root;提供 `--install-dir` 自定义 |

---

## 时间预估

| 阶段 | 预计时间 |
|------|----------|
| Phase 0: Baseline & Pre-Flight | 5 分钟 |
| Phase 1: Create install-web.sh Skeleton | 15 分钟 |
| Phase 2: Implement detect_platform_arch() | 10 分钟 |
| Phase 3: Implement resolve_version() | 10 分钟 |
| Phase 4: Implement download_tarball() | 15 分钟 |
| Phase 5: Implement verify_checksum() | 10 分钟 |
| Phase 6: Implement extract_tarball() | 15 分钟 |
| Phase 7: Implement create_symlink() | 10 分钟 |
| Phase 8: Implement update_shell_profile() | 15 分钟 |
| Phase 9: Implement print_summary() | 10 分钟 |
| Phase 10: Add CI Integration | 20 分钟 |
| Phase 11: Add Container Smoke Test | 20 分钟 |
| Phase 12: Document & Handoff | 15 分钟 |
| **总计** | **~2.5 小时** |

*(实际时间可能因调试、网络速度等因素浮动)*

---

## 参考文档

- `scripts/install-ubuntu.sh` — Ubuntu/Debian 安装脚本(参考实现)
- `docs/backend-migration/handoffs/M8-outcome.md` — M8 tarball 产物和接口约定
- `docs/backend-migration/plans/2026-05-07-m8-web-cli-tarball.md` — M8 详细计划(tarball 结构)
- `.github/workflows/build-and-release.yml` — CI release 流程
- `scripts/verify-release-assets.sh` — Release asset 验证脚本

---

## 后续里程碑依赖

- **M10+ (release automation)**: 将 install-web.sh 作为 stable release 的一部分,自动上传到 GitHub releases
- **未来增强**: PowerShell 版本的 install-web.ps1(用于 Windows 原生支持)

---

*本计划由 plan-writer-m9 生成,基于 M1/M7/M8 格式模板和源码探查结果。*
