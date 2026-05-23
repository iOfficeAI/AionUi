#!/usr/bin/env bash

set -euo pipefail

ARTIFACTS_DIR="${1:-build-artifacts}"
VERSION="${MOCK_VERSION:-$(node -p "require('./package.json').version")}"

rm -rf "$ARTIFACTS_DIR"
mkdir -p "$ARTIFACTS_DIR/windows-build-x64"
mkdir -p "$ARTIFACTS_DIR/windows-build-arm64"
mkdir -p "$ARTIFACTS_DIR/macos-build-x64"
mkdir -p "$ARTIFACTS_DIR/macos-build-arm64"
mkdir -p "$ARTIFACTS_DIR/linux-build-x64"
mkdir -p "$ARTIFACTS_DIR/linux-build-arm64"

# Windows x64
touch "$ARTIFACTS_DIR/windows-build-x64/POUNDING-${VERSION}-win-x64.exe"
cat > "$ARTIFACTS_DIR/windows-build-x64/latest.yml" <<'EOF'
version: VERSION_PLACEHOLDER
files:
  - url: POUNDING-VERSION_PLACEHOLDER-win-x64.exe
    sha512: fake-sha512-x64
    size: 100000
path: POUNDING-VERSION_PLACEHOLDER-win-x64.exe
sha512: fake-sha512-x64
releaseDate: '2025-01-01'
EOF
sed -i '' "s/VERSION_PLACEHOLDER/${VERSION}/g" "$ARTIFACTS_DIR/windows-build-x64/latest.yml"

# Windows arm64
touch "$ARTIFACTS_DIR/windows-build-arm64/POUNDING-${VERSION}-win-arm64.exe"
cat > "$ARTIFACTS_DIR/windows-build-arm64/latest.yml" <<'EOF'
version: VERSION_PLACEHOLDER
files:
  - url: POUNDING-VERSION_PLACEHOLDER-win-arm64.exe
    sha512: fake-sha512-arm64
    size: 100000
path: POUNDING-VERSION_PLACEHOLDER-win-arm64.exe
sha512: fake-sha512-arm64
releaseDate: '2025-01-01'
EOF
sed -i '' "s/VERSION_PLACEHOLDER/${VERSION}/g" "$ARTIFACTS_DIR/windows-build-arm64/latest.yml"

# macOS x64
  touch "$ARTIFACTS_DIR/macos-build-x64/POUNDING-${VERSION}-mac-x64.dmg"
  touch "$ARTIFACTS_DIR/macos-build-x64/POUNDING-${VERSION}-mac-x64.zip"
  cat > "$ARTIFACTS_DIR/macos-build-x64/latest-mac.yml" <<'EOF'
version: VERSION_PLACEHOLDER
files:
  - url: POUNDING-VERSION_PLACEHOLDER-mac-x64.dmg
    sha512: fake-sha512-mac-x64
    size: 200000
EOF
sed -i '' "s/VERSION_PLACEHOLDER/${VERSION}/g" "$ARTIFACTS_DIR/macos-build-x64/latest-mac.yml"

# macOS arm64
  touch "$ARTIFACTS_DIR/macos-build-arm64/POUNDING-${VERSION}-mac-arm64.dmg"
  touch "$ARTIFACTS_DIR/macos-build-arm64/POUNDING-${VERSION}-mac-arm64.zip"
  cat > "$ARTIFACTS_DIR/macos-build-arm64/latest-mac.yml" <<'EOF'
version: VERSION_PLACEHOLDER
files:
  - url: POUNDING-VERSION_PLACEHOLDER-mac-arm64.dmg
    sha512: fake-sha512-mac-arm64
    size: 200000
EOF
sed -i '' "s/VERSION_PLACEHOLDER/${VERSION}/g" "$ARTIFACTS_DIR/macos-build-arm64/latest-mac.yml"

# Linux x64
  touch "$ARTIFACTS_DIR/linux-build-x64/POUNDING-${VERSION}-linux-x64.deb"
  cat > "$ARTIFACTS_DIR/linux-build-x64/latest-linux.yml" <<'EOF'
version: VERSION_PLACEHOLDER
files:
  - url: POUNDING-VERSION_PLACEHOLDER-linux-x64.deb
    sha512: fake-sha512-linux
    size: 300000
EOF
sed -i '' "s/VERSION_PLACEHOLDER/${VERSION}/g" "$ARTIFACTS_DIR/linux-build-x64/latest-linux.yml"

# Linux arm64
  touch "$ARTIFACTS_DIR/linux-build-arm64/POUNDING-${VERSION}-linux-arm64.deb"
  cat > "$ARTIFACTS_DIR/linux-build-arm64/latest-linux-arm64.yml" <<'EOF'
version: VERSION_PLACEHOLDER
files:
  - url: POUNDING-VERSION_PLACEHOLDER-linux-arm64.deb
    sha512: fake-sha512-linux-arm64
    size: 300000
EOF
sed -i '' "s/VERSION_PLACEHOLDER/${VERSION}/g" "$ARTIFACTS_DIR/linux-build-arm64/latest-linux-arm64.yml"

# Web-CLI tarballs (5 platforms)
WEB_PLATFORMS=(
  "darwin-arm64"
  "darwin-x86_64"
  "linux-arm64"
  "linux-x86_64"
  "win-x86_64"
)

for plat in "${WEB_PLATFORMS[@]}"; do
  dir="$ARTIFACTS_DIR/web-cli-${plat}"
  mkdir -p "$dir"
  tarball="aionui-web-${VERSION}-${plat}.tar.gz"
  touch "$dir/$tarball"
  # Produce a deterministic fake SHA256 file in the expected format:
  # "<64 hex chars>  <filename>"
  echo "0000000000000000000000000000000000000000000000000000000000000000  ${tarball}" > "$dir/${tarball}.sha256"
done

# install-web.sh (version-substituted placeholder)
mkdir -p "$ARTIFACTS_DIR/install-web-script"
cat > "$ARTIFACTS_DIR/install-web-script/install-web.sh" <<'EOF'
#!/usr/bin/env bash
# Mock install-web.sh for release-script-test
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/tmp/pounding-web-smoke-test}"
BIN_DIR="${BIN_DIR:-/tmp/smoke-bin}"
CREATE_SYMLINK="${CREATE_SYMLINK:-1}"

mkdir -p "$INSTALL_DIR" "$BIN_DIR"
cat > "$INSTALL_DIR/aionui-web" <<'EOS'
#!/usr/bin/env bash
if [[ "${1:-}" == "version" ]]; then
  echo "1.0.0"
  exit 0
fi
echo "POUNDING WebUI mock"
EOS
chmod +x "$INSTALL_DIR/aionui-web"

if [[ "$CREATE_SYMLINK" == "1" ]]; then
  ln -sf "$INSTALL_DIR/aionui-web" "$BIN_DIR/aionui-web"
fi

echo "mock install-web.sh"
EOF
chmod +x "$ARTIFACTS_DIR/install-web-script/install-web.sh"

echo "Mock artifacts created in $ARTIFACTS_DIR:"
find "$ARTIFACTS_DIR" -type f | sort
