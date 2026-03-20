#!/usr/bin/env bash
set -euo pipefail

TARGET_DIR="${1:-$HOME/Star-Office-UI}"
PORT_FRONTEND="${PORT_FRONTEND:-19000}"
PORT_BACKEND="${PORT_BACKEND:-18791}"
URL_FRONTEND="http://127.0.0.1:${PORT_FRONTEND}"
URL_BACKEND="http://127.0.0.1:${PORT_BACKEND}"

echo "[star-office-doctor] target: $TARGET_DIR"
echo "[star-office-doctor] frontend: $URL_FRONTEND"
echo "[star-office-doctor] backend:  $URL_BACKEND"
echo

check_cmd() {
  local c="$1"
  if command -v "$c" >/dev/null 2>&1; then
    echo "OK   command: $c"
  else
    echo "MISS command: $c"
  fi
}

check_http() {
  local url="$1"
  local name="$2"
  local code
  code="$(curl -s -o /tmp/star_office_doctor_body.txt -w "%{http_code}" "$url" || true)"
  if [ "$code" = "200" ] || [ "$code" = "401" ]; then
    echo "OK   $name http=$code url=$url"
    if rg -q "Unauthorized" /tmp/star_office_doctor_body.txt 2>/dev/null; then
      echo "WARN $name returns Unauthorized (likely backend auth/session not ready)"
    fi
  else
    echo "FAIL $name http=$code url=$url"
  fi
}

check_port() {
  local p="$1"
  if lsof -nP -iTCP:"$p" -sTCP:LISTEN >/tmp/star_office_port_"$p".txt 2>/dev/null; then
    echo "OK   port $p listening"
    head -n 3 /tmp/star_office_port_"$p".txt
  else
    echo "FAIL port $p not listening"
  fi
}

check_cmd python3
check_cmd git
check_cmd curl
check_cmd lsof
check_cmd rg
echo

if [ -d "$TARGET_DIR" ]; then
  echo "OK   directory exists: $TARGET_DIR"
else
  echo "FAIL directory missing: $TARGET_DIR"
fi

if [ -f "$TARGET_DIR/backend/requirements.txt" ]; then
  echo "OK   backend requirements found"
else
  echo "FAIL backend requirements missing"
fi

if [ -d "$TARGET_DIR/.venv" ]; then
  echo "OK   .venv exists"
else
  echo "WARN .venv missing (run setup script)"
fi
echo

check_port "$PORT_FRONTEND"
check_port "$PORT_BACKEND"
echo

check_http "$URL_FRONTEND" "frontend"
check_http "$URL_BACKEND" "backend-root"

echo
cat <<'EOF'
Checklist:
1) If pip failed with externally-managed-environment, use:
   python3 -m venv .venv && .venv/bin/python -m pip install -r backend/requirements.txt
2) If browser shows Unauthorized, backend may be running but not initialized/session missing.
3) If frontend opens but no animation, verify OpenClaw events are actually flowing to Star Office backend.
4) In Aion preview panel, use exact URL of running frontend (usually http://127.0.0.1:19000).
EOF
