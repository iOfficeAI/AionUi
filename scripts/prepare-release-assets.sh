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
VERSION="${MOCK_VERSION:-$(node -p "require('./package.json').version")}"

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
  -name "*.msi" -o \
  -name "*.dmg" -o \
  -name "*.deb" -o \
  -name "*.zip" \
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
# 1b) Copy web-cli tarballs (+ sha256 checksums)
# ---------------------------------------------------------------------------
echo "==> Copying web-cli tarballs from $ARTIFACTS_DIR ..."
WEB_CLI_FILES=()
while IFS= read -r file; do
  WEB_CLI_FILES+=("$file")
done < <(find "$ARTIFACTS_DIR" -type f \( \
  -name "csbu-workmate-web-*.tar.gz" -o \
  -name "csbu-workmate-web-*.tar.gz.sha256" \
\) | sort)

WEB_CLI_DUPS=$(for file in "${WEB_CLI_FILES[@]}"; do basename "$file"; done | sort | uniq -d || true)
if [ -n "$WEB_CLI_DUPS" ]; then
  echo "::error::Duplicate web-cli artifact basenames:"
  echo "$WEB_CLI_DUPS"
  exit 1
fi

for file in "${WEB_CLI_FILES[@]}"; do
  cp -f "$file" "$OUTPUT_DIR/"
done

# ---------------------------------------------------------------------------
# 1c) Copy install-web.sh (version-substituted)
# ---------------------------------------------------------------------------
echo "==> Copying install-web.sh ..."
INSTALL_SCRIPT=$(find "$ARTIFACTS_DIR" -type f -name 'install-web.sh' | head -n 1 || true)
if [ -n "$INSTALL_SCRIPT" ]; then
  cp -f "$INSTALL_SCRIPT" "$OUTPUT_DIR/install-web.sh"
  chmod +x "$OUTPUT_DIR/install-web.sh"
fi

# ---------------------------------------------------------------------------
# 2) Collect updater metadata from each platform artifact directory
# ---------------------------------------------------------------------------
echo "==> Collecting updater metadata ..."

WIN_X64_LATEST=$(find "$ARTIFACTS_DIR" -type f -path "*/windows-build-x64/*" -name "latest.yml" | sort | head -n 1 || true)
WIN_ARM64_LATEST=$(find "$ARTIFACTS_DIR" -type f -path "*/windows-build-arm64/*" -name "latest.yml" | sort | head -n 1 || true)
MAC_X64_LATEST=$(find "$ARTIFACTS_DIR" -type f -path "*/macos-build-x64/*" -name "latest-mac.yml" | sort | head -n 1 || true)
MAC_ARM64_LATEST=$(find "$ARTIFACTS_DIR" -type f -path "*/macos-build-arm64/*" -name "latest-mac.yml" | sort | head -n 1 || true)
LINUX_X64_LATEST=$(find "$ARTIFACTS_DIR" -type f -path "*/linux-build-x64/*" -name "latest-linux.yml" | sort | head -n 1 || true)
LINUX_ARM64_LATEST=$(find "$ARTIFACTS_DIR" -type f -path "*/linux-build-arm64/*" -name "latest-linux-arm64.yml" | sort | head -n 1 || true)

# ---------------------------------------------------------------------------
# 3) Publish deterministic canonical metadata for electron-updater
#    (avoid nondeterministic overwrite when multiple jobs produce same names)
# ---------------------------------------------------------------------------
echo "==> Writing canonical updater metadata ..."

[ -n "$WIN_X64_LATEST" ]    && cp -f "$WIN_X64_LATEST"    "$OUTPUT_DIR/latest.yml"
[ -n "$MAC_X64_LATEST" ]    && cp -f "$MAC_X64_LATEST"    "$OUTPUT_DIR/latest-mac.yml"
[ -n "$LINUX_X64_LATEST" ]  && cp -f "$LINUX_X64_LATEST"  "$OUTPUT_DIR/latest-linux.yml"
[ -n "$LINUX_ARM64_LATEST" ] && cp -f "$LINUX_ARM64_LATEST" "$OUTPUT_DIR/latest-linux-arm64.yml"

# ---------------------------------------------------------------------------
# 4) Architecture-specific metadata required by electron-updater
# ---------------------------------------------------------------------------
echo "==> Writing architecture-specific updater metadata ..."

[ -n "$WIN_ARM64_LATEST" ]  && cp -f "$WIN_ARM64_LATEST"  "$OUTPUT_DIR/latest-win-arm64.yml"

# electron-updater on macOS constructs the yml filename as "${channel}-mac.yml".
# For arm64, channel is "latest-arm64", so it looks for "latest-arm64-mac.yml".
[ -n "$MAC_ARM64_LATEST" ]  && cp -f "$MAC_ARM64_LATEST"  "$OUTPUT_DIR/latest-arm64-mac.yml"

# ---------------------------------------------------------------------------
# 5) Embed sanitized Chinese release notes for offline internal updates
# ---------------------------------------------------------------------------
echo "==> Embedding internal release notes ..."

node - "$OUTPUT_DIR" "$VERSION" <<'NODE'
const fs = require('fs');
const path = require('path');

const outputDir = process.argv[2];
const version = process.argv[3];
const override = process.env.INTERNAL_RELEASE_NOTES?.trim();
let releaseNotes = override;

if (!releaseNotes) {
  const changelog = fs.readFileSync('CHANGELOG.md', 'utf8').replace(/\r\n/g, '\n');
  const versionHeading = new RegExp(`^## \\[${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\].*$`, 'm');
  const versionMatch = changelog.match(versionHeading);
  if (!versionMatch || versionMatch.index === undefined) {
    throw new Error(`CHANGELOG.md does not contain release ${version}`);
  }
  const versionSectionStart = versionMatch.index + versionMatch[0].length;
  const remainingChangelog = changelog.slice(versionSectionStart);
  const nextVersionOffset = remainingChangelog.search(/^## \[/m);
  const versionSection = nextVersionOffset === -1 ? remainingChangelog : remainingChangelog.slice(0, nextVersionOffset);
  const notesMatch = versionSection.match(
    /<!-- internal-release-notes:start -->\s*([\s\S]*?)\s*<!-- internal-release-notes:end -->/
  );
  releaseNotes = notesMatch?.[1]?.trim();
}

if (!releaseNotes) {
  throw new Error(`Chinese internal release notes are required for release ${version}`);
}
if (!releaseNotes.includes('由运营管理部提供')) {
  throw new Error('Internal release notes must identify 运营管理部 as the provider');
}
if (!/[\u3400-\u9fff]/u.test(releaseNotes)) {
  throw new Error('Internal release notes must be written in Chinese');
}
if (/https?:\/\/|github|suoak|@[-\w]+|co-authored-by|author|作者|提交者/iu.test(releaseNotes)) {
  throw new Error('Internal release notes must not expose repository links or author identities');
}

const manifests = fs.readdirSync(outputDir).filter((name) => /^latest.*\.yml$/.test(name));
for (const name of manifests) {
  const manifestPath = path.join(outputDir, name);
  const lines = fs.readFileSync(manifestPath, 'utf8').replace(/\r\n/g, '\n').trimEnd().split('\n');
  const existingNotesIndex = lines.findIndex((line) => /^releaseNotes:/.test(line));
  if (existingNotesIndex >= 0) {
    let end = existingNotesIndex + 1;
    while (end < lines.length && (lines[end].trim() === '' || /^\s+/.test(lines[end]))) end += 1;
    lines.splice(existingNotesIndex, end - existingNotesIndex);
  }
  const yamlReleaseNotes = ['releaseNotes: |-'].concat(releaseNotes.split('\n').map((line) => `  ${line}`));
  fs.writeFileSync(manifestPath, `${lines.join('\n')}\n${yamlReleaseNotes.join('\n')}\n`);
  console.log(`Embedded sanitized Chinese release notes in ${name}`);
}
NODE

# ---------------------------------------------------------------------------
# 6) Hard validation for required updater metadata
# ---------------------------------------------------------------------------
echo "==> Validating required metadata ..."

MISSING=0
for required in latest.yml latest-win-arm64.yml latest-mac.yml latest-arm64-mac.yml latest-linux.yml latest-linux-arm64.yml; do
  if [ ! -f "$OUTPUT_DIR/$required" ]; then
    echo "::error::Missing required updater metadata: $required"
    MISSING=1
  fi
done

node - "$OUTPUT_DIR" <<'NODE'
const fs = require('fs');
const path = require('path');
const outputDir = process.argv[2];
const manifests = fs.readdirSync(outputDir).filter((name) => /^latest.*\.yml$/.test(name));
let invalid = false;
for (const manifestName of manifests) {
  const manifest = fs.readFileSync(path.join(outputDir, manifestName), 'utf8');
  const assetUrls = [...manifest.matchAll(/^\s*-\s+url:\s*(?:"([^"]+)"|'([^']+)'|([^#\r\n]+?))\s*$/gm)].map(
    (match) => (match[1] || match[2] || match[3] || '').trim(),
  );
  if (assetUrls.length === 0) {
    console.error(`::error::${manifestName} does not contain any updater asset URLs`);
    invalid = true;
  }
  for (const assetUrl of assetUrls) {
    const assetName = path.basename(assetUrl);
    if (!assetName || !fs.existsSync(path.join(outputDir, assetName))) {
      console.error(`::error::${manifestName} references missing asset: ${assetName || assetUrl}`);
      invalid = true;
    }
  }
}
if (invalid) process.exit(1);
NODE

# ---------------------------------------------------------------------------
# 6b) Hard validation for desktop release assets
# ---------------------------------------------------------------------------
echo "==> Validating desktop release assets ..."

for arch in x64 arm64; do
  for ext in dmg zip; do
    asset="CSBU-WorkMate-${VERSION}-mac-${arch}.${ext}"
    if [ ! -f "$OUTPUT_DIR/$asset" ]; then
      if [ "$ext" = "zip" ]; then
        echo "::error::Missing macOS zip artifact: $asset"
      else
        echo "::error::Missing macOS DMG artifact: $asset"
      fi
      MISSING=1
    fi
  done
done

# ---------------------------------------------------------------------------
# 6c) Hard validation for web-cli release assets
# ---------------------------------------------------------------------------
echo "==> Validating web-cli assets ..."

WEB_PLATFORMS=(
  "darwin-arm64"
  "darwin-x86_64"
  "linux-arm64"
  "linux-x86_64"
  "win-x86_64"
)

for plat in "${WEB_PLATFORMS[@]}"; do
  tarball="csbu-workmate-web-${VERSION}-${plat}.tar.gz"
  if [ ! -f "$OUTPUT_DIR/$tarball" ]; then
    echo "::error::Missing web-cli tarball: $tarball"
    MISSING=1
  fi
  if [ ! -f "$OUTPUT_DIR/${tarball}.sha256" ]; then
    echo "::error::Missing web-cli checksum: ${tarball}.sha256"
    MISSING=1
  fi
done

if [ ! -f "$OUTPUT_DIR/install-web.sh" ]; then
  echo "::error::Missing install-web.sh"
  MISSING=1
fi

if [ "$MISSING" -ne 0 ]; then
  exit 1
fi

echo ""
echo "==> Prepared release assets:"
ls -lh "$OUTPUT_DIR"
echo ""
echo "==> Done."
