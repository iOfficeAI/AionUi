#!/bin/bash
set -e

TARBALL_PATH=$1

if [ -z "$TARBALL_PATH" ]; then
  echo "Usage: $0 <tarball-path>"
  exit 1
fi

echo "========================================"
echo "Smoke test for web-cli tarball"
echo "========================================"
echo "Tarball: $TARBALL_PATH"

# 1. Extract tarball
echo ""
echo "1. Extracting tarball..."
TEMP_DIR=$(mktemp -d)
tar -xzf "$TARBALL_PATH" -C "$TEMP_DIR"

# 2. Verify directory structure
echo ""
echo "2. Verifying directory structure..."
if [ ! -d "$TEMP_DIR/aionui-web" ]; then
  echo "❌ Missing aionui-web directory"
  exit 1
fi

cd "$TEMP_DIR/aionui-web"

for dir in bin dist bundled-aionui-backend bundled-bun static; do
  if [ ! -d "$dir" ]; then
    echo "❌ Missing $dir directory"
    exit 1
  fi
  echo "✓ Found $dir/"
done

# 3. Check executables
echo ""
echo "3. Checking executables..."

if [ ! -x "bin/aionui-web.js" ]; then
  echo "❌ bin/aionui-web.js is not executable"
  exit 1
fi
echo "✓ bin/aionui-web.js is executable"

BACKEND_BINARY="bundled-aionui-backend/$(uname -s | tr '[:upper:]' '[:lower:]')-$(uname -m)/aionui-backend"
if [ ! -x "$BACKEND_BINARY" ]; then
  echo "❌ $BACKEND_BINARY is not executable"
  exit 1
fi
echo "✓ $BACKEND_BINARY is executable"

# 4. Test version command
echo ""
echo "4. Testing version command..."
VERSION=$(node bin/aionui-web.js version)
if [ -z "$VERSION" ]; then
  echo "❌ version command returned empty"
  exit 1
fi
echo "✓ Version: $VERSION"

# 5. Test backend binary --version
echo ""
echo "5. Testing backend binary..."
BACKEND_VERSION=$("$BACKEND_BINARY" --version 2>&1 || true)
if [ -z "$BACKEND_VERSION" ]; then
  echo "⚠️ backend --version returned empty (may be OK if binary expects different flags)"
else
  echo "✓ Backend version: $BACKEND_VERSION"
fi

# Cleanup
cd -
rm -rf "$TEMP_DIR"

echo ""
echo "========================================"
echo "✅ Smoke test passed!"
echo "========================================"
