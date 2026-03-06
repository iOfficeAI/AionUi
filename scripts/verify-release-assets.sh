#!/usr/bin/env bash

set -euo pipefail

OUTPUT_DIR="${1:-release-assets}"
ERRORS=0

for f in latest.yml latest-mac.yml latest-linux.yml latest-linux-arm64.yml; do
  if [ ! -f "$OUTPUT_DIR/$f" ]; then
    echo "FAIL: missing canonical metadata: $f"
    ERRORS=$((ERRORS + 1))
  fi
done

if grep -q "fake-sha512-x64" "$OUTPUT_DIR/latest.yml"; then
  echo "PASS: latest.yml contains x64 metadata"
else
  echo "FAIL: latest.yml does not contain x64 metadata"
  ERRORS=$((ERRORS + 1))
fi

if grep -q "fake-sha512-mac-x64" "$OUTPUT_DIR/latest-mac.yml"; then
  echo "PASS: latest-mac.yml contains x64 metadata"
else
  echo "FAIL: latest-mac.yml does not contain x64 metadata"
  ERRORS=$((ERRORS + 1))
fi

for f in latest-win-x64.yml latest-win-arm64.yml latest-mac-x64.yml latest-mac-arm64.yml; do
  if [ ! -f "$OUTPUT_DIR/$f" ]; then
    echo "FAIL: missing arch-scoped metadata: $f"
    ERRORS=$((ERRORS + 1))
  else
    echo "PASS: $f exists"
  fi
done

for f in builder-debug-win-x64.yml builder-debug-win-arm64.yml builder-debug-mac-x64.yml builder-debug-mac-arm64.yml builder-debug-linux.yml builder-debug.yml; do
  if [ ! -f "$OUTPUT_DIR/$f" ]; then
    echo "FAIL: missing debug metadata: $f"
    ERRORS=$((ERRORS + 1))
  else
    echo "PASS: $f exists"
  fi
done

for f in AionUi-1.0.0-win-x64.exe AionUi-1.0.0-win-arm64.exe AionUi-1.0.0-mac-x64.dmg AionUi-1.0.0-mac-arm64.dmg AionUi-1.0.0.AppImage AionUi-1.0.0.deb; do
  if [ ! -f "$OUTPUT_DIR/$f" ]; then
    echo "FAIL: missing distributable: $f"
    ERRORS=$((ERRORS + 1))
  else
    echo "PASS: $f exists"
  fi
done

echo ""
if [ "$ERRORS" -gt 0 ]; then
  echo "FAILED: $ERRORS errors found"
  exit 1
fi

echo "ALL CHECKS PASSED"
