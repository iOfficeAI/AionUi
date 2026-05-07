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

# ─── Default Configuration ──────────────────────────────────────────────────
VERSION="${VERSION:-__VERSION__}"  # CI will replace __VERSION__ with actual version
INSTALL_DIR="${INSTALL_DIR:-${HOME}/.local/share/aionui-web}"
BIN_DIR="${BIN_DIR:-${HOME}/.local/bin}"
MIRROR="${MIRROR:-https://github.com/iOfficeAI/AionUi/releases/download}"
CREATE_SYMLINK="${CREATE_SYMLINK:-1}"
UPDATE_PATH="${UPDATE_PATH:-1}"

# ─── Color Definitions ──────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ─── Helper Functions ───────────────────────────────────────────────────────
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

# ─── Parse Command-Line Arguments ───────────────────────────────────────────
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

# ─── Core Functions (To be implemented) ─────────────────────────────────────
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

# ─── Main Flow ──────────────────────────────────────────────────────────────
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

# Execute
main "$@"
