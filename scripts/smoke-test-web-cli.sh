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
#   └── bundled-aioncore/<plat-arch>/...
for dir in static bundled-aioncore; do
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
BACKEND_DIR="bundled-aioncore/$(uname -s | tr '[:upper:]' '[:lower:]')-$(uname -m | sed 's/aarch64/arm64/; s/x86_64/x64/')"
BACKEND_BINARY="$BACKEND_DIR/aioncore"
if [ ! -x "$BACKEND_BINARY" ]; then
  echo "❌ Backend binary missing or not executable: $BACKEND_BINARY"
  exit 1
fi
# aioncore has no --version flag. Read the pinned version from manifest.json
# (which prepareAioncore writes at pack time) and use --help to confirm the
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
CREDENTIAL_FILE="$DATA_DIR/initial-admin-credentials.json"
# Full-stack start: backend is bundled, so we can also exercise /login below.
# If the bundled backend is missing the CLI falls back to frontend-only mode
# and later login probe is skipped.
./aionui-web start --port "$HTTP_PORT" --data-dir "$DATA_DIR" > /tmp/aionui-web.log 2>&1 &
SERVER_PID=$!
cleanup_server() {
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
}
trap cleanup_server EXIT

# Wait up to 30s for HTTP to come up. With backend spawned, first start spends
# time on SQLite migrations on slower CI runners.
for _ in {1..30}; do
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
  # The browser-facing host must never proxy backend control-plane routes that
  # intentionally trust loopback callers. The reset probe is destructive if it
  # reaches Core, so run it only against this disposable smoke-test data dir.
  PUBLIC_RESET_RESP=$(mktemp)
  PUBLIC_RESET_CODE=$(curl -sS -o "$PUBLIC_RESET_RESP" -w '%{http_code}' \
    -X POST "http://127.0.0.1:${HTTP_PORT}/api/webui/reset-password" || echo "000")
  if [ "$PUBLIC_RESET_CODE" != "404" ]; then
    echo "❌ Public password-reset control route returned HTTP $PUBLIC_RESET_CODE instead of 404"
    cat "$PUBLIC_RESET_RESP"
    exit 1
  fi

  PUBLIC_INTERNAL_RESP=$(mktemp)
  PUBLIC_INTERNAL_CODE=$(curl -sS -o "$PUBLIC_INTERNAL_RESP" -w '%{http_code}' \
    "http://127.0.0.1:${HTTP_PORT}/api/auth/internal/users/system" || echo "000")
  if [ "$PUBLIC_INTERNAL_CODE" != "404" ]; then
    echo "❌ Public internal-auth route returned HTTP $PUBLIC_INTERNAL_CODE instead of 404"
    cat "$PUBLIC_INTERNAL_RESP"
    exit 1
  fi
  echo "✓ Local-only backend control routes are unavailable on the public port"

  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
  echo "❌ HTTP root response does not look like SPA index:"
  head -20 /tmp/aionui-web.html
  echo "---server log---"
  cat /tmp/aionui-web.log
  exit 1
fi

# 7. Auth + multi-user smoke: read the protected one-time credential file,
#    replace the admin password, create a member, and prove the member cannot
#    call the administrator API. Skip when no bundled backend is available.
echo ""
echo "7. Testing first-launch admin + member account flow..."
if grep -q 'Backend binary not found' /tmp/aionui-web.log; then
  echo "⚠️  frontend-only mode detected (no bundled backend) — skipping login probe"
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
else
  # Core creates this file once with mode 0600. The plaintext password must
  # never be emitted to stdout/stderr where deployment logs can retain it.
  for _ in {1..20}; do
    if [ -s "$CREDENTIAL_FILE" ]; then
      break
    fi
    sleep 1
  done

  if [ ! -s "$CREDENTIAL_FILE" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
    echo "❌ Initial administrator credential file was not created."
    echo "---server log---"
    cat /tmp/aionui-web.log
    exit 1
  fi

  CREDENTIAL_MODE=$(node -e 'const fs=require("fs"); process.stdout.write((fs.statSync(process.argv[1]).mode & 0o777).toString(8))' "$CREDENTIAL_FILE")
  if [ "$CREDENTIAL_MODE" != "600" ]; then
    echo "❌ Credential file mode is $CREDENTIAL_MODE, expected 600"
    exit 1
  fi

  USERNAME=$(node -e 'const c=require(process.argv[1]); if(typeof c.username!=="string") process.exit(2); process.stdout.write(c.username)' "$CREDENTIAL_FILE")
  PASSWORD=$(node -e 'const c=require(process.argv[1]); if(typeof c.temporary_password!=="string") process.exit(2); process.stdout.write(c.temporary_password)' "$CREDENTIAL_FILE")
  MUST_CHANGE=$(node -e 'const c=require(process.argv[1]); process.stdout.write(String(c.must_change_password===true))' "$CREDENTIAL_FILE")
  CREATED_AT_VALID=$(node -e 'const c=require(process.argv[1]); process.stdout.write(String(Number.isSafeInteger(c.created_at)&&c.created_at>0))' "$CREDENTIAL_FILE")
  if [ -z "$USERNAME" ] || [ -z "$PASSWORD" ] || [ "$MUST_CHANGE" != "true" ] || [ "$CREATED_AT_VALID" != "true" ]; then
    echo "❌ Credential file does not match the expected one-time credential contract"
    exit 1
  fi
  if grep -Fq -- "$PASSWORD" /tmp/aionui-web.log; then
    echo "❌ Initial administrator password leaked into server logs"
    exit 1
  fi
  echo "✓ Protected one-time administrator credential created without a log leak"

  # POST /login — static server proxies to backend. Expect 200, success:true,
  # and at least one Set-Cookie header containing a session cookie.
  ADMIN_COOKIE_JAR=$(mktemp)
  LOGIN_BODY=$(node -e 'process.stdout.write(JSON.stringify({username:process.argv[1],password:process.argv[2],remember:false}))' "$USERNAME" "$PASSWORD")
  LOGIN_RESP_HEADERS=$(mktemp)
  LOGIN_RESP_BODY=$(mktemp)
  HTTP_CODE=$(curl -sS -o "$LOGIN_RESP_BODY" -D "$LOGIN_RESP_HEADERS" -w '%{http_code}' \
    -c "$ADMIN_COOKIE_JAR" \
    -X POST "http://127.0.0.1:${HTTP_PORT}/login" \
    -H 'Content-Type: application/json' \
    --data "$LOGIN_BODY" || echo "000")

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
  echo "✓ Login with the one-time password succeeded"

  CSRF_TOKEN=$(awk '$6 == "aionui-csrf-token" { print $7 }' "$ADMIN_COOKIE_JAR" | tail -1)
  if [ -z "$CSRF_TOKEN" ]; then
    echo "❌ Login did not seed the CSRF cookie"
    exit 1
  fi

  FORCED_BODY=$(mktemp)
  FORCED_CODE=$(curl -sS -o "$FORCED_BODY" -w '%{http_code}' \
    -b "$ADMIN_COOKIE_JAR" "http://127.0.0.1:${HTTP_PORT}/api/admin/users" || echo "000")
  if [ "$FORCED_CODE" != "403" ] || ! grep -q 'PASSWORD_CHANGE_REQUIRED' "$FORCED_BODY"; then
    echo "❌ Temporary-password session was not restricted (HTTP $FORCED_CODE)"
    cat "$FORCED_BODY"
    exit 1
  fi

  ADMIN_PASSWORD='Smoke-Admin-Password-25899!'
  CHANGE_BODY=$(node -e 'process.stdout.write(JSON.stringify({current_password:process.argv[1],new_password:process.argv[2]}))' "$PASSWORD" "$ADMIN_PASSWORD")
  CHANGE_RESP=$(mktemp)
  CHANGE_CODE=$(curl -sS -o "$CHANGE_RESP" -w '%{http_code}' \
    -b "$ADMIN_COOKIE_JAR" -c "$ADMIN_COOKIE_JAR" \
    -X POST "http://127.0.0.1:${HTTP_PORT}/api/auth/change-password" \
    -H 'Content-Type: application/json' \
    -H "X-CSRF-Token: $CSRF_TOKEN" \
    --data "$CHANGE_BODY" || echo "000")
  if [ "$CHANGE_CODE" != "200" ] || ! grep -q '"success":[[:space:]]*true' "$CHANGE_RESP"; then
    echo "❌ Administrator password replacement failed (HTTP $CHANGE_CODE)"
    cat "$CHANGE_RESP"
    exit 1
  fi

  for _ in {1..10}; do
    if [ ! -e "$CREDENTIAL_FILE" ]; then
      break
    fi
    sleep 1
  done
  if [ -e "$CREDENTIAL_FILE" ]; then
    echo "❌ One-time credential file was not removed after password replacement"
    exit 1
  fi
  echo "✓ Forced password replacement returned a fresh administrator session"

  CREATE_BODY='{"username":"smoke-member","role":"member"}'
  CREATE_RESP=$(mktemp)
  CREATE_CODE=$(curl -sS -o "$CREATE_RESP" -w '%{http_code}' \
    -b "$ADMIN_COOKIE_JAR" \
    -X POST "http://127.0.0.1:${HTTP_PORT}/api/admin/users" \
    -H 'Content-Type: application/json' \
    -H "X-CSRF-Token: $CSRF_TOKEN" \
    --data "$CREATE_BODY" || echo "000")
  if [ "$CREATE_CODE" != "201" ]; then
    echo "❌ Creating a member returned HTTP $CREATE_CODE"
    cat "$CREATE_RESP"
    exit 1
  fi
  MEMBER_PASSWORD=$(node -e 'const fs=require("fs"); const c=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const p=c.data?.temporary_password; if(typeof p!=="string") process.exit(2); process.stdout.write(p)' "$CREATE_RESP")

  MEMBER_COOKIE_JAR=$(mktemp)
  MEMBER_LOGIN_BODY=$(node -e 'process.stdout.write(JSON.stringify({username:"smoke-member",password:process.argv[1],remember:false}))' "$MEMBER_PASSWORD")
  MEMBER_LOGIN_RESP=$(mktemp)
  MEMBER_LOGIN_CODE=$(curl -sS -o "$MEMBER_LOGIN_RESP" -w '%{http_code}' \
    -c "$MEMBER_COOKIE_JAR" \
    -X POST "http://127.0.0.1:${HTTP_PORT}/login" \
    -H 'Content-Type: application/json' \
    --data "$MEMBER_LOGIN_BODY" || echo "000")
  if [ "$MEMBER_LOGIN_CODE" != "200" ]; then
    echo "❌ Member login returned HTTP $MEMBER_LOGIN_CODE"
    cat "$MEMBER_LOGIN_RESP"
    exit 1
  fi

  MEMBER_CSRF=$(awk '$6 == "aionui-csrf-token" { print $7 }' "$MEMBER_COOKIE_JAR" | tail -1)
  MEMBER_NEW_PASSWORD='Smoke-Member-Password-25899!'
  MEMBER_CHANGE_BODY=$(node -e 'process.stdout.write(JSON.stringify({current_password:process.argv[1],new_password:process.argv[2]}))' "$MEMBER_PASSWORD" "$MEMBER_NEW_PASSWORD")
  MEMBER_CHANGE_RESP=$(mktemp)
  MEMBER_CHANGE_CODE=$(curl -sS -o "$MEMBER_CHANGE_RESP" -w '%{http_code}' \
    -b "$MEMBER_COOKIE_JAR" -c "$MEMBER_COOKIE_JAR" \
    -X POST "http://127.0.0.1:${HTTP_PORT}/api/auth/change-password" \
    -H 'Content-Type: application/json' \
    -H "X-CSRF-Token: $MEMBER_CSRF" \
    --data "$MEMBER_CHANGE_BODY" || echo "000")
  if [ "$MEMBER_CHANGE_CODE" != "200" ]; then
    echo "❌ Member password replacement returned HTTP $MEMBER_CHANGE_CODE"
    cat "$MEMBER_CHANGE_RESP"
    exit 1
  fi

  MEMBER_ADMIN_RESP=$(mktemp)
  MEMBER_ADMIN_CODE=$(curl -sS -o "$MEMBER_ADMIN_RESP" -w '%{http_code}' \
    -b "$MEMBER_COOKIE_JAR" "http://127.0.0.1:${HTTP_PORT}/api/admin/users" || echo "000")
  if [ "$MEMBER_ADMIN_CODE" != "403" ] || ! grep -q 'ADMIN_REQUIRED' "$MEMBER_ADMIN_RESP"; then
    echo "❌ Member was not denied the administrator API (HTTP $MEMBER_ADMIN_CODE)"
    cat "$MEMBER_ADMIN_RESP"
    exit 1
  fi

  ADMIN_LIST_RESP=$(mktemp)
  ADMIN_LIST_CODE=$(curl -sS -o "$ADMIN_LIST_RESP" -w '%{http_code}' \
    -b "$ADMIN_COOKIE_JAR" "http://127.0.0.1:${HTTP_PORT}/api/admin/users" || echo "000")
  if [ "$ADMIN_LIST_CODE" != "200" ] || ! grep -q 'smoke-member' "$ADMIN_LIST_RESP"; then
    echo "❌ Administrator session did not survive the member lifecycle (HTTP $ADMIN_LIST_CODE)"
    cat "$ADMIN_LIST_RESP"
    exit 1
  fi

  # Collaboration: directory + share a conversation with the member (view).
  DIR_RESP=$(mktemp)
  DIR_CODE=$(curl -sS -o "$DIR_RESP" -w '%{http_code}' \
    -b "$ADMIN_COOKIE_JAR" "http://127.0.0.1:${HTTP_PORT}/api/users/directory" || echo "000")
  if [ "$DIR_CODE" != "200" ] || ! grep -q 'smoke-member' "$DIR_RESP"; then
    echo "❌ User directory did not list smoke-member (HTTP $DIR_CODE)"
    cat "$DIR_RESP"
    exit 1
  fi

  CONV_CREATE_RESP=$(mktemp)
  CONV_CREATE_CODE=$(curl -sS -o "$CONV_CREATE_RESP" -w '%{http_code}' \
    -b "$ADMIN_COOKIE_JAR" -c "$ADMIN_COOKIE_JAR" \
    -X POST "http://127.0.0.1:${HTTP_PORT}/api/conversations" \
    -H 'Content-Type: application/json' \
    -H "X-CSRF-Token: $CSRF_TOKEN" \
    --data '{"name":"smoke-shared","type":"aionrs","extra":{}}' || echo "000")
  if [ "$CONV_CREATE_CODE" != "200" ] && [ "$CONV_CREATE_CODE" != "201" ]; then
    echo "❌ Creating a conversation for share smoke returned HTTP $CONV_CREATE_CODE"
    cat "$CONV_CREATE_RESP"
    exit 1
  fi
  CONV_ID=$(node -e 'const fs=require("fs"); const c=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const id=c.data?.id||c.id||c.data?.conversation?.id; if(typeof id!=="string") process.exit(2); process.stdout.write(id)' "$CONV_CREATE_RESP")

  SHARE_BODY=$(node -e 'process.stdout.write(JSON.stringify({resource_type:"conversation",resource_id:process.argv[1],grantee_username:"smoke-member",permission:"view"}))' "$CONV_ID")
  SHARE_RESP=$(mktemp)
  SHARE_CODE=$(curl -sS -o "$SHARE_RESP" -w '%{http_code}' \
    -b "$ADMIN_COOKIE_JAR" -c "$ADMIN_COOKIE_JAR" \
    -X POST "http://127.0.0.1:${HTTP_PORT}/api/shares" \
    -H 'Content-Type: application/json' \
    -H "X-CSRF-Token: $CSRF_TOKEN" \
    --data "$SHARE_BODY" || echo "000")
  if [ "$SHARE_CODE" != "200" ] && [ "$SHARE_CODE" != "201" ]; then
    echo "❌ Sharing conversation with member returned HTTP $SHARE_CODE"
    cat "$SHARE_RESP"
    exit 1
  fi

  MEMBER_RECEIVED=$(mktemp)
  MEMBER_RECEIVED_CODE=$(curl -sS -o "$MEMBER_RECEIVED" -w '%{http_code}' \
    -b "$MEMBER_COOKIE_JAR" "http://127.0.0.1:${HTTP_PORT}/api/shares/received" || echo "000")
  if [ "$MEMBER_RECEIVED_CODE" != "200" ] || ! grep -q "$CONV_ID" "$MEMBER_RECEIVED"; then
    echo "❌ Member did not see received share for $CONV_ID (HTTP $MEMBER_RECEIVED_CODE)"
    cat "$MEMBER_RECEIVED"
    exit 1
  fi
  echo "✓ Collaboration directory, share grant, and received-share list passed"

  # Stop and restart the complete packaged runtime against the same data dir.
  # This proves SQLite/session bootstrap state is persistent and the one-time
  # credential cannot silently reappear after a normal container restart.
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
  : > /tmp/aionui-web-restart.log
  ./aionui-web start --port "$HTTP_PORT" --data-dir "$DATA_DIR" > /tmp/aionui-web-restart.log 2>&1 &
  SERVER_PID=$!

  for _ in {1..30}; do
    if curl -sf "http://127.0.0.1:${HTTP_PORT}/api/auth/status" > /dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  if ! curl -sf "http://127.0.0.1:${HTTP_PORT}/api/auth/status" > /dev/null 2>&1; then
    echo "❌ Restarted server did not become ready"
    cat /tmp/aionui-web-restart.log
    exit 1
  fi
  if [ -e "$CREDENTIAL_FILE" ]; then
    echo "❌ One-time credential file reappeared after restart"
    exit 1
  fi

  RESTART_ADMIN_JAR=$(mktemp)
  RESTART_ADMIN_BODY=$(node -e 'process.stdout.write(JSON.stringify({username:process.argv[1],password:process.argv[2],remember:false}))' "$USERNAME" "$ADMIN_PASSWORD")
  RESTART_ADMIN_RESP=$(mktemp)
  RESTART_ADMIN_CODE=$(curl -sS -o "$RESTART_ADMIN_RESP" -w '%{http_code}' \
    -c "$RESTART_ADMIN_JAR" \
    -X POST "http://127.0.0.1:${HTTP_PORT}/login" \
    -H 'Content-Type: application/json' \
    --data "$RESTART_ADMIN_BODY" || echo "000")
  if [ "$RESTART_ADMIN_CODE" != "200" ] || ! grep -q '"success":[[:space:]]*true' "$RESTART_ADMIN_RESP"; then
    echo "❌ Administrator could not sign in after restart (HTTP $RESTART_ADMIN_CODE)"
    cat "$RESTART_ADMIN_RESP"
    exit 1
  fi

  RESTART_MEMBER_JAR=$(mktemp)
  RESTART_MEMBER_BODY=$(node -e 'process.stdout.write(JSON.stringify({username:"smoke-member",password:process.argv[1],remember:false}))' "$MEMBER_NEW_PASSWORD")
  RESTART_MEMBER_RESP=$(mktemp)
  RESTART_MEMBER_CODE=$(curl -sS -o "$RESTART_MEMBER_RESP" -w '%{http_code}' \
    -c "$RESTART_MEMBER_JAR" \
    -X POST "http://127.0.0.1:${HTTP_PORT}/login" \
    -H 'Content-Type: application/json' \
    --data "$RESTART_MEMBER_BODY" || echo "000")
  if [ "$RESTART_MEMBER_CODE" != "200" ] || ! grep -q '"success":[[:space:]]*true' "$RESTART_MEMBER_RESP"; then
    echo "❌ Member could not sign in after restart (HTTP $RESTART_MEMBER_CODE)"
    cat "$RESTART_MEMBER_RESP"
    exit 1
  fi

  RESTART_LIST_RESP=$(mktemp)
  RESTART_LIST_CODE=$(curl -sS -o "$RESTART_LIST_RESP" -w '%{http_code}' \
    -b "$RESTART_ADMIN_JAR" "http://127.0.0.1:${HTTP_PORT}/api/admin/users" || echo "000")
  if [ "$RESTART_LIST_CODE" != "200" ] || ! grep -q 'smoke-member' "$RESTART_LIST_RESP"; then
    echo "❌ Persisted administrator could not list the persisted member (HTTP $RESTART_LIST_CODE)"
    cat "$RESTART_LIST_RESP"
    exit 1
  fi

  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
  echo "✓ Two-account auth, member RBAC, collaboration shares, public-route isolation, and restart persistence passed"
fi

trap - EXIT

# Cleanup
cd -
rm -rf "$TEMP_DIR"

echo ""
echo "========================================"
echo "✅ Smoke test passed!"
echo "========================================"
