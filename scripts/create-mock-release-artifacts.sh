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
touch "$ARTIFACTS_DIR/windows-build-x64/AionUi-1.0.0-win-x64.exe.blockmap"
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
echo "debug: win-x64" > "$ARTIFACTS_DIR/windows-build-x64/builder-debug.yml"

# Windows arm64
touch "$ARTIFACTS_DIR/windows-build-arm64/AionUi-1.0.0-win-arm64.exe"
touch "$ARTIFACTS_DIR/windows-build-arm64/AionUi-1.0.0-win-arm64.exe.blockmap"
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
echo "debug: win-arm64" > "$ARTIFACTS_DIR/windows-build-arm64/builder-debug.yml"

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
echo "debug: mac-x64" > "$ARTIFACTS_DIR/macos-build-x64/builder-debug.yml"

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
echo "debug: mac-arm64" > "$ARTIFACTS_DIR/macos-build-arm64/builder-debug.yml"

# Linux
touch "$ARTIFACTS_DIR/linux-build/AionUi-1.0.0.AppImage"
touch "$ARTIFACTS_DIR/linux-build/AionUi-1.0.0-arm64.AppImage"
touch "$ARTIFACTS_DIR/linux-build/AionUi-1.0.0.deb"
cat > "$ARTIFACTS_DIR/linux-build/latest-linux.yml" <<'EOF'
version: 1.0.0
files:
  - url: AionUi-1.0.0.AppImage
    sha512: fake-sha512-linux
    size: 300000
EOF
cat > "$ARTIFACTS_DIR/linux-build/latest-linux-arm64.yml" <<'EOF'
version: 1.0.0
files:
  - url: AionUi-1.0.0-arm64.AppImage
    sha512: fake-sha512-linux-arm64
    size: 300000
EOF
echo "debug: linux" > "$ARTIFACTS_DIR/linux-build/builder-debug.yml"

echo "Mock artifacts created in $ARTIFACTS_DIR:"
find "$ARTIFACTS_DIR" -type f | sort
