#!/usr/bin/env bash
# prepare-release-assets.sh
#
# Normalize electron-updater metadata from multi-arch build artifacts
# into a deterministic release-assets/ directory.
#
# Usage:
#   ./scripts/prepare-release-assets.sh [ARTIFACTS_DIR] [OUTPUT_DIR]
#
# Defaults:
#   ARTIFACTS_DIR = build-artifacts
#   OUTPUT_DIR    = release-assets

set -euo pipefail

ARTIFACTS_DIR="${1:-build-artifacts}"
OUTPUT_DIR="${2:-release-assets}"

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# ---------------------------------------------------------------------------
# 1) Copy all distributables (unique file names)
# ---------------------------------------------------------------------------
echo "==> Copying distributables from $ARTIFACTS_DIR ..."
DISTRIBUTABLES=()
while IFS= read -r file; do
  DISTRIBUTABLES+=("$file")
done < <(find "$ARTIFACTS_DIR" -type f \( \
  -name "*.exe" -o \
  -name "*.dmg" \
\) | sort)

DUPLICATE_BASENAMES=$(for file in "${DISTRIBUTABLES[@]}"; do basename "$file"; done | sort | uniq -d || true)
if [ -n "$DUPLICATE_BASENAMES" ]; then
  echo "::error::Found duplicate distributable basenames that would be overwritten in flat output:"
  echo "$DUPLICATE_BASENAMES"
  exit 1
fi

for file in "${DISTRIBUTABLES[@]}"; do
  cp -f "$file" "$OUTPUT_DIR/"
done

# ---------------------------------------------------------------------------
# 2) Collect updater metadata from each platform artifact directory
# ---------------------------------------------------------------------------
echo "==> Collecting updater metadata ..."

WIN_X64_LATEST=$(find "$ARTIFACTS_DIR" -type f -path "*/windows-build-x64/*" -name "latest.yml" | sort | head -n 1 || true)
WIN_ARM64_LATEST=$(find "$ARTIFACTS_DIR" -type f -path "*/windows-build-arm64/*" -name "latest.yml" | sort | head -n 1 || true)

# ---------------------------------------------------------------------------
# 3) Publish deterministic canonical metadata for electron-updater
#    (avoid nondeterministic overwrite when multiple jobs produce same names)
# ---------------------------------------------------------------------------
echo "==> Writing canonical updater metadata ..."

[ -n "$WIN_X64_LATEST" ]    && cp -f "$WIN_X64_LATEST"    "$OUTPUT_DIR/latest.yml"

# ---------------------------------------------------------------------------
# 4) Architecture-specific metadata required by electron-updater
# ---------------------------------------------------------------------------
echo "==> Writing architecture-specific updater metadata ..."

[ -n "$WIN_ARM64_LATEST" ]  && cp -f "$WIN_ARM64_LATEST"  "$OUTPUT_DIR/latest-win-arm64.yml"

# macOS releases use manual DMG installation; do not publish a ZIP updater feed.

# ---------------------------------------------------------------------------
# 5) Hard validation for required updater metadata
# ---------------------------------------------------------------------------
echo "==> Validating required metadata ..."

VERSION="${MOCK_VERSION:-$(node -p "require('./package.json').version")}"
MISSING=0
for required in latest.yml latest-win-arm64.yml; do
  if [ ! -f "$OUTPUT_DIR/$required" ]; then
    echo "::error::Missing required updater metadata: $required"
    MISSING=1
  fi
done

# ---------------------------------------------------------------------------
# 5b) Hard validation for desktop release assets
# ---------------------------------------------------------------------------
echo "==> Validating desktop release assets ..."

for arch in x64 arm64; do
  for platform_ext in mac.dmg win.exe; do
    platform="${platform_ext%.*}"
    ext="${platform_ext#*.}"
    asset="GEAUi-${VERSION}-${platform}-${arch}.${ext}"
    if [ ! -f "$OUTPUT_DIR/$asset" ]; then
      echo "::error::Missing desktop installer: $asset"
      MISSING=1
    fi
  done
done

if [ "$MISSING" -ne 0 ]; then
  exit 1
fi

# Bind every published installer and updater metadata file to its content.
node - "$OUTPUT_DIR" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dir = process.argv[2];
const names = fs.readdirSync(dir).sort();
const lines = names.map(name => {
  const digest = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, name))).digest('hex');
  return `${digest}  ${name}`;
});
fs.writeFileSync(path.join(dir, 'SHA256SUMS.txt'), lines.join('\n') + '\n');
NODE

echo ""
echo "==> Prepared release assets:"
ls -lh "$OUTPUT_DIR"
echo ""
echo "==> Done."
