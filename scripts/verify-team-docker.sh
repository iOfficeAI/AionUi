#!/usr/bin/env bash
# Verify a team-hosted AionUi Compose stack is healthy and auth is enforced.
#
# Usage:
#   bash scripts/verify-team-docker.sh
#   COMPOSE_FILE=docker-compose.yml bash scripts/verify-team-docker.sh
#   AIONUI_HOST_PORT=25808 bash scripts/verify-team-docker.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.dev.yml}"
HOST_PORT="${AIONUI_HOST_PORT:-25808}"
BASE="http://127.0.0.1:${HOST_PORT}"

cd "$ROOT"

echo "=== AionUi team host verification ==="
echo "Compose file: ${COMPOSE_FILE}"
echo "URL:          ${BASE}"
echo

if ! docker compose -f "$COMPOSE_FILE" ps --status running 2>/dev/null | grep -q aionui; then
  echo "No running aionui service. Start with:"
  echo "  docker compose -f ${COMPOSE_FILE} up --build --detach"
  exit 1
fi

echo -n "1. Health /api/auth/status ... "
status_json="$(curl -fsS "${BASE}/api/auth/status")"
echo "$status_json" | grep -q '"success"[[:space:]]*:[[:space:]]*true' || {
  echo "FAIL"
  echo "$status_json"
  exit 1
}
echo "OK ($status_json)"

echo -n "2. Unauthenticated content API must be 401 ... "
code="$(curl -sS -o /dev/null -w '%{http_code}' "${BASE}/api/conversations" || true)"
if [ "$code" != "401" ]; then
  echo "FAIL (HTTP $code) — image may be running with --local (auth disabled). Rebuild."
  exit 1
fi
echo "OK (HTTP 401)"

echo -n "3. Public local-control routes blocked ... "
code="$(curl -sS -o /dev/null -w '%{http_code}' -X POST "${BASE}/api/webui/reset-password" || true)"
if [ "$code" != "404" ]; then
  echo "FAIL (HTTP $code, expected 404)"
  exit 1
fi
echo "OK (HTTP 404)"

echo -n "4. Container uses webui identity mode ... "
# shellcheck disable=SC2016
args="$(docker compose -f "$COMPOSE_FILE" exec -T aionui sh -c 'for p in /proc/[0-9]*; do tr "\0" " " <"$p/cmdline" 2>/dev/null; echo; done' 2>/dev/null || true)"
if ! printf '%s' "$args" | grep -q -- '--identity-mode webui'; then
  echo "FAIL (no --identity-mode webui in process list)"
  echo "$args" | head -20
  exit 1
fi
if printf '%s' "$args" | grep -E 'aioncore .*\-\-local( |$)' | grep -vq 'identity-mode'; then
  # pure --local without webui is unsafe for team host
  echo "WARN: saw --local flag; ensure production start uses webui"
fi
echo "OK"

echo -n "5. Bootstrap credential file (fresh installs only) ... "
# shellcheck disable=SC2016
if docker compose -f "$COMPOSE_FILE" exec -T aionui sh -c 'test -f "$AIONUI_INITIAL_ADMIN_CREDENTIALS_FILE"' 2>/dev/null; then
  echo "PRESENT — one-time admin login:"
  docker compose -f "$COMPOSE_FILE" exec -T aionui sh -c 'cat "$AIONUI_INITIAL_ADMIN_CREDENTIALS_FILE"'
  echo
else
  echo "absent (already claimed / password changed) — use Settings → Account or resetpass"
fi

echo
echo "=== All checks passed ==="
echo "Open ${BASE} and sign in."
echo "Admin creates users under Settings → Account → Users."
