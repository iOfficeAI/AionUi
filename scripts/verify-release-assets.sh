#!/usr/bin/env bash

set -euo pipefail

OUTPUT_DIR="${1:-release-assets}"
ERRORS=0

for f in latest.yml latest-win-arm64.yml; do
  if [ ! -f "$OUTPUT_DIR/$f" ]; then
    echo "FAIL: missing canonical metadata: $f"
    ERRORS=$((ERRORS + 1))
  fi
done

extract_ref_file() {
  local metadata_file="$1"
  local ref
  ref=$(grep -E '^path:' "$metadata_file" | head -n 1 | sed -E 's/^path:[[:space:]]*//')
  if [ -z "$ref" ]; then
    ref=$(grep -E '^[[:space:]]*-?[[:space:]]*url:' "$metadata_file" | head -n 1 | sed -E 's/^[[:space:]]*-?[[:space:]]*url:[[:space:]]*//')
  fi
  echo "$ref"
}

assert_metadata_points_to_existing_file() {
  local metadata_name="$1"
  local expected_pattern="$2"
  local metadata_path="$OUTPUT_DIR/$metadata_name"

  local ref_file
  ref_file=$(extract_ref_file "$metadata_path")

  if [ -z "$ref_file" ]; then
    echo "FAIL: $metadata_name has no path/url entry"
    ERRORS=$((ERRORS + 1))
    return
  fi

  if [[ ! "$ref_file" =~ $expected_pattern ]]; then
    echo "FAIL: $metadata_name points to unexpected file: $ref_file"
    ERRORS=$((ERRORS + 1))
    return
  fi

  if [ ! -f "$OUTPUT_DIR/$ref_file" ]; then
    echo "FAIL: $metadata_name references missing file: $ref_file"
    ERRORS=$((ERRORS + 1))
    return
  fi

  echo "PASS: $metadata_name -> $ref_file"
}

assert_metadata_points_to_existing_file "latest.yml" "win-x64\.exe$"
assert_metadata_points_to_existing_file "latest-win-arm64.yml" "win-arm64\.exe$"

for f in latest-win-arm64.yml; do
  if [ ! -f "$OUTPUT_DIR/$f" ]; then
    echo "FAIL: missing arch-specific updater metadata: $f"
    ERRORS=$((ERRORS + 1))
  else
    echo "PASS: $f exists"
  fi
done

for f in GEAUi-1.0.0-win-x64.exe GEAUi-1.0.0-win-arm64.exe GEAUi-1.0.0-mac-x64.dmg GEAUi-1.0.0-mac-arm64.dmg; do
  if [ ! -f "$OUTPUT_DIR/$f" ]; then
    echo "FAIL: missing distributable: $f"
    ERRORS=$((ERRORS + 1))
  else
    echo "PASS: $f exists"
  fi
done

# The release contains only installers and Windows updater metadata.
for file in "$OUTPUT_DIR"/*; do
  case "${file##*/}" in
    *.dmg|*.exe|latest.yml|latest-win-arm64.yml|SHA256SUMS.txt) ;;
    *) echo "FAIL: unexpected release asset: $file"; ERRORS=$((ERRORS + 1)) ;;
  esac
done

if ! node - "$OUTPUT_DIR" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dir = process.argv[2];
const names = fs.readdirSync(dir).filter(name => name !== 'SHA256SUMS.txt').sort();
const expected = names.map(name => `${crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, name))).digest('hex')}  ${name}`).join('\n') + '\n';
if (fs.readFileSync(path.join(dir, 'SHA256SUMS.txt'), 'utf8') !== expected) {
  throw new Error('Release checksum content or file set mismatch');
}
NODE
then
  echo "FAIL: release checksums"
  ERRORS=$((ERRORS + 1))
fi

echo ""
if [ "$ERRORS" -gt 0 ]; then
  echo "FAILED: $ERRORS errors found"
  exit 1
fi

echo "ALL CHECKS PASSED"
