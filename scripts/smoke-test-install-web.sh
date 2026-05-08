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
    base_path="${MIRROR#file://}"
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
export UPDATE_PATH=0  # Don't modify shell profile in container

bash /tmp/install-web.sh --no-path

# 3. Verify installation
echo ""
echo "3. Verifying installation..."

if [[ ! -d "$INSTALL_DIR" ]]; then
    echo "❌ Installation directory not found: $INSTALL_DIR"
    exit 1
fi
echo "✓ Installation directory exists"

if [[ ! -x "${INSTALL_DIR}/aionui-web" ]]; then
    echo "❌ CLI executable not found or not executable: ${INSTALL_DIR}/aionui-web"
    exit 1
fi
echo "✓ CLI executable exists"

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
