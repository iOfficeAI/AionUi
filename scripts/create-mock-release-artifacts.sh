#!/usr/bin/env bash

set -euo pipefail

ARTIFACTS_DIR="${1:-build-artifacts}"

rm -rf "$ARTIFACTS_DIR"
mkdir -p "$ARTIFACTS_DIR/windows-build-x64"
mkdir -p "$ARTIFACTS_DIR/windows-build-arm64"
mkdir -p "$ARTIFACTS_DIR/macos-build-x64"
mkdir -p "$ARTIFACTS_DIR/macos-build-arm64"
mkdir -p "$ARTIFACTS_DIR/linux-build"

# Windows x64
touch "$ARTIFACTS_DIR/windows-build-x64/AionUi-1.0.0-win-x64.exe"
cat > "$ARTIFACTS_DIR/windows-build-x64/latest.yml" <<'EOF'
version: 1.0.0
files:
  - url: AionUi-1.0.0-win-x64.exe
    sha512: fake-sha512-x64
    size: 100000
path: AionUi-1.0.0-win-x64.exe
sha512: fake-sha512-x64
releaseDate: '2025-01-01'
EOF

# Windows arm64
touch "$ARTIFACTS_DIR/windows-build-arm64/AionUi-1.0.0-win-arm64.exe"
cat > "$ARTIFACTS_DIR/windows-build-arm64/latest.yml" <<'EOF'
version: 1.0.0
files:
  - url: AionUi-1.0.0-win-arm64.exe
    sha512: fake-sha512-arm64
    size: 100000
path: AionUi-1.0.0-win-arm64.exe
sha512: fake-sha512-arm64
releaseDate: '2025-01-01'
EOF

# macOS x64
touch "$ARTIFACTS_DIR/macos-build-x64/AionUi-1.0.0-mac-x64.dmg"
touch "$ARTIFACTS_DIR/macos-build-x64/AionUi-1.0.0-mac-x64.zip"
cat > "$ARTIFACTS_DIR/macos-build-x64/latest-mac.yml" <<'EOF'
version: 1.0.0
files:
  - url: AionUi-1.0.0-mac-x64.dmg
    sha512: fake-sha512-mac-x64
    size: 200000
EOF

# macOS arm64
touch "$ARTIFACTS_DIR/macos-build-arm64/AionUi-1.0.0-mac-arm64.dmg"
touch "$ARTIFACTS_DIR/macos-build-arm64/AionUi-1.0.0-mac-arm64.zip"
cat > "$ARTIFACTS_DIR/macos-build-arm64/latest-mac.yml" <<'EOF'
version: 1.0.0
files:
  - url: AionUi-1.0.0-mac-arm64.dmg
    sha512: fake-sha512-mac-arm64
    size: 200000
EOF

# Linux
touch "$ARTIFACTS_DIR/linux-build/AionUi-1.0.0.deb"
touch "$ARTIFACTS_DIR/linux-build/AionUi-1.0.0-arm64.deb"
cat > "$ARTIFACTS_DIR/linux-build/latest-linux.yml" <<'EOF'
version: 1.0.0
files:
  - url: AionUi-1.0.0.deb
    sha512: fake-sha512-linux
    size: 300000
EOF
cat > "$ARTIFACTS_DIR/linux-build/latest-linux-arm64.yml" <<'EOF'
version: 1.0.0
files:
  - url: AionUi-1.0.0-arm64.deb
    sha512: fake-sha512-linux-arm64
    size: 300000
EOF

echo "Mock artifacts created in $ARTIFACTS_DIR:"
find "$ARTIFACTS_DIR" -type f | sort
