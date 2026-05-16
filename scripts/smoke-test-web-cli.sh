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

# New layout (bun compile standalone binary):
#   aionui-web/
#   ├── aionui-web           ← single compiled executable (no bin/, no dist/, no node_modules)
#   ├── package.json         ← for version lookup
#   ├── static/              ← SPA assets
#   └── bundled-aionui-backend/<plat-arch>/...
for dir in static bundled-aionui-backend; do
  if [ ! -d "$dir" ]; then
    echo "❌ Missing $dir directory"
    exit 1
  fi
  echo "✓ Found $dir/"
done

if [ ! -f "package.json" ]; then
  echo "❌ Missing package.json"
  exit 1
fi
echo "✓ Found package.json"

# 3. Check executable
echo ""
echo "3. Checking executable..."
if [ ! -x "aionui-web" ]; then
  echo "❌ aionui-web is not executable"
  exit 1
fi
echo "✓ aionui-web is executable"

# 4. Test version command
echo ""
echo "4. Testing version command..."
VERSION=$(./aionui-web version)
if [ -z "$VERSION" ]; then
  echo "❌ version command returned empty"
  exit 1
fi
echo "✓ Version: $VERSION"

# 5. Test backend binary
echo ""
echo "5. Checking backend binary..."
BACKEND_DIR="bundled-aionui-backend/$(uname -s | tr '[:upper:]' '[:lower:]')-$(uname -m | sed 's/aarch64/arm64/; s/x86_64/x64/')"
BACKEND_BINARY="$BACKEND_DIR/aionui-backend"
if [ ! -x "$BACKEND_BINARY" ]; then
  echo "❌ Backend binary missing or not executable: $BACKEND_BINARY"
  exit 1
fi
# aionui-backend has no --version flag. Read the pinned version from manifest.json
# (which prepareAionuiBackend writes at pack time) and use --help to confirm the
# binary loads successfully on this platform's GLIBC / libstdc++ / etc.
if [ -f "$BACKEND_DIR/manifest.json" ]; then
  BACKEND_VERSION=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$BACKEND_DIR/manifest.json" | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
  echo "✓ Backend version (from manifest): ${BACKEND_VERSION:-unknown}"
fi
if ! "$BACKEND_BINARY" --help > /dev/null 2>&1; then
  echo "❌ Backend binary failed to exec (--help returned non-zero)"
  "$BACKEND_BINARY" --help 2>&1 | head -5
  exit 1
fi
echo "✓ Backend binary loads on this platform"

# 6. HTTP-level smoke: start web-cli, curl the root, check for SPA shell
echo ""
echo "6. Testing HTTP server responds with SPA index..."
HTTP_PORT=25899
DATA_DIR="$(mktemp -d)/aionui-web-data"
# Full-stack start: backend is bundled, so we can also exercise /login below.
# If the bundled backend is missing the CLI falls back to frontend-only mode
# and later login probe is skipped.
./aionui-web start --port "$HTTP_PORT" --data-dir "$DATA_DIR" > /tmp/aionui-web.log 2>&1 &
SERVER_PID=$!

# Wait up to 30s for HTTP to come up. With backend spawned, first start spends
# time on SQLite migrations on slower CI runners.
for i in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:${HTTP_PORT}/" > /tmp/aionui-web.html 2>/dev/null; then
    break
  fi
  sleep 1
done

if [ ! -s /tmp/aionui-web.html ]; then
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
  echo "❌ HTTP probe failed — no response body. Server log:"
  cat /tmp/aionui-web.log
  exit 1
fi

# Look for the SPA shell signature — <html + <div id="root" or similar marker
if grep -q '<html' /tmp/aionui-web.html && grep -qE '<(div id="root"|script)' /tmp/aionui-web.html; then
  echo "✓ HTTP root returns SPA index ($(wc -c < /tmp/aionui-web.html) bytes)"
else
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
  echo "❌ HTTP root response does not look like SPA index:"
  head -20 /tmp/aionui-web.html
  echo "---server log---"
  cat /tmp/aionui-web.log
  exit 1
fi

# 7. Auth-setup smoke: verify stdout announces a generated admin password on
#    first launch, then POST it to /login and check for success + session cookie.
#    Skip when the bundled backend was unavailable — there's no /login to call.
echo ""
echo "7. Testing first-launch admin password seeding + login..."
if grep -q 'Backend binary not found' /tmp/aionui-web.log; then
  echo "⚠️  frontend-only mode detected (no bundled backend) — skipping login probe"
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
else
  # Wait up to 20s for the "Generated initial admin password" line — the backend
  # needs to finish migrations before /api/auth/status replies.
  PASSWORD=""
  for i in $(seq 1 20); do
    PASSWORD=$(grep -oE 'Generated initial admin password: [^ ]+' /tmp/aionui-web.log | head -1 | sed 's/^Generated initial admin password: //')
    if [ -n "$PASSWORD" ]; then
      break
    fi
    sleep 1
  done

  if [ -z "$PASSWORD" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
    echo "❌ Never saw 'Generated initial admin password: ...' in stdout."
    echo "---server log---"
    cat /tmp/aionui-web.log
    exit 1
  fi
  echo "✓ Captured initial admin password from stdout"

  # POST /login — static server proxies to backend. Expect 200, success:true,
  # and at least one Set-Cookie header containing a session cookie.
  LOGIN_BODY=$(printf '{"username":"admin","password":"%s","remember":false}' "$PASSWORD")
  LOGIN_RESP_HEADERS=$(mktemp)
  LOGIN_RESP_BODY=$(mktemp)
  HTTP_CODE=$(curl -sS -o "$LOGIN_RESP_BODY" -D "$LOGIN_RESP_HEADERS" -w '%{http_code}' \
    -X POST "http://127.0.0.1:${HTTP_PORT}/login" \
    -H 'Content-Type: application/json' \
    --data "$LOGIN_BODY" || echo "000")

  # Stop the server before asserting so we don't leak a process on failure.
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true

  if [ "$HTTP_CODE" != "200" ]; then
    echo "❌ /login returned HTTP $HTTP_CODE"
    echo "---headers---"
    cat "$LOGIN_RESP_HEADERS"
    echo "---body---"
    cat "$LOGIN_RESP_BODY"
    echo "---server log---"
    cat /tmp/aionui-web.log
    exit 1
  fi

  if ! grep -q '"success":[[:space:]]*true' "$LOGIN_RESP_BODY"; then
    echo "❌ /login returned 200 but body had no success:true"
    cat "$LOGIN_RESP_BODY"
    exit 1
  fi

  if ! grep -iq '^set-cookie:' "$LOGIN_RESP_HEADERS"; then
    echo "❌ /login returned success but no Set-Cookie header"
    cat "$LOGIN_RESP_HEADERS"
    exit 1
  fi
  echo "✓ Login with printed password succeeded (HTTP 200 + Set-Cookie present)"
fi

# Cleanup
cd -
rm -rf "$TEMP_DIR"

echo ""
echo "========================================"
echo "✅ Smoke test passed!"
echo "========================================"
