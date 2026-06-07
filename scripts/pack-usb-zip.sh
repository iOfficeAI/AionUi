#!/usr/bin/env bash
# scripts/pack-usb-zip.sh
#
# Create a dealer-kit.zip with PORTABLE + dealer-config.json template.
# Dealers download the platform zip + dealer-kit.zip, extract both to a USB drive.
#
# Usage:
#   bash scripts/pack-usb-zip.sh [OUT_DIR]

set -euo pipefail

OUT_DIR="$(cd "${1:-out}" && pwd)"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT

DEALER_CONFIG='{"aff": "YOUR_AFF_CODE"}'

WORKDIR="$TEMP_DIR/dealer-kit"
mkdir -p "$WORKDIR"
echo "$DEALER_CONFIG" > "$WORKDIR/dealer-config.json"
touch "$WORKDIR/PORTABLE"

# Cross-platform zip: use 7z on Windows, native zip elsewhere
if command -v 7z &>/dev/null; then
  (cd "$WORKDIR" && 7z a "$OUT_DIR/dealer-kit.zip" . -tzip -mx=5 -bso0 -bsp0 > /dev/null)
else
  (cd "$WORKDIR" && zip -qr "$OUT_DIR/dealer-kit.zip" .)
fi

echo "==> Created dealer-kit.zip"
ls -lh "$OUT_DIR/dealer-kit.zip"
