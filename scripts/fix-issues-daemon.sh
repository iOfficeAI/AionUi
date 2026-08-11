#!/usr/bin/env bash
# Fix-Issues Daemon
# Continuously launches Claude processes to fix GitHub bug issues one at a time.
# Claude handles all GitHub API interaction via gh CLI — daemon is just a scheduler.
#
# Usage:
#   ./scripts/fix-issues-daemon.sh              # start daemon
#   ./scripts/fix-issues-daemon.sh stop         # stop daemon (kills all child processes)
#   nohup ./scripts/fix-issues-daemon.sh &      # survives terminal close
#
# Logs:
#   Main log:    ~/.aionui-fix-issues/daemon.log
#   Session logs: ~/.aionui-fix-issues/tmp/session-<uuid>.log

set -euo pipefail

# ─── Stop command ───

LOG_DIR="${HOME}/.aionui-fix-issues"
LOCK_FILE="${LOG_DIR}/daemon.lock"

if [ "${1:-}" = "stop" ]; then
  if [ -f "$LOCK_FILE" ]; then
    PID=$(cat "$LOCK_FILE")
    if kill -0 "$PID" 2>/dev/null; then
      kill -- -"$PID" 2>/dev/null || kill "$PID" 2>/dev/null
      echo "Daemon stopped (PID: $PID)"
    else
      echo "Daemon not running (stale lock). Cleaning up."
      rm -f "$LOCK_FILE"
    fi
  else
    echo "Daemon not running (no lock file)."
  fi
  exit 0
fi

# ─── Configuration ───

COOLDOWN=60                    # seconds to wait after each Claude process
IDLE_BASE=1800                 # base idle time when no fixable issues (30 min)
IDLE_MAX=7200                  # max idle time with exponential backoff (2 hours)

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_FILE="${LOG_DIR}/daemon.log"
MAX_LOG_SIZE=10485760          # 10MB log rotation threshold

# ─── Setup ───

mkdir -p "${LOG_DIR}/tmp"

# Clean up session logs older than 7 days
find "${LOG_DIR}/tmp" -name "session-*.log" -mtime +7 -delete 2>/dev/null || true

# Prevent multiple instances
if [ -f "$LOCK_FILE" ]; then
  OTHER_PID=$(cat "$LOCK_FILE")
  if kill -0 "$OTHER_PID" 2>/dev/null; then
    echo "Another daemon is already running (PID: $OTHER_PID). Exiting."
    exit 1
  fi
  rm -f "$LOCK_FILE"
fi

echo $$ > "$LOCK_FILE"

# Prevent macOS from sleeping
CAFFEINATE_PID="disabled"
if command -v caffeinate &>/dev/null; then
  caffeinate -i -w $$ &
  CAFFEINATE_PID=$!
fi

STOPPING=0

cleanup() {
  # Prevent re-entrant cleanup (EXIT fires after INT/TERM handler)
  [ "$STOPPING" -eq 1 ] && return
  STOPPING=1
  rm -f "$LOCK_FILE"
  # Kill child processes (caffeinate, sleep, claude, etc.)
  jobs -p | xargs kill 2>/dev/null || true
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) Daemon stopped." >> "$LOG_FILE"
  exit 0
}

trap cleanup EXIT INT TERM

# ─── Helpers ───

log() {
  local msg="$(date -u +%Y-%m-%dT%H:%M:%SZ) $*"
  echo "$msg" | tee -a "$LOG_FILE"

  # Rotate log if too large
  if [ -f "$LOG_FILE" ] && [ "$(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null)" -gt "$MAX_LOG_SIZE" ]; then
    mv "$LOG_FILE" "${LOG_FILE}.1"
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) Log rotated." > "$LOG_FILE"
  fi
}

# ─── Main loop ───

NO_FIX_STREAK=0

log "Daemon started (PID: $$, cooldown: ${COOLDOWN}s, caffeinate: ${CAFFEINATE_PID})"

while true; do
  # Ensure we're on main with latest code
  cd "$REPO_ROOT"
  git checkout main 2>/dev/null || true
  git pull origin main 2>/dev/null || true

  SESSION_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
  ISSUE_LOG="${LOG_DIR}/tmp/session-${SESSION_ID}.log"

  log ">>> Launching Claude (session: ${SESSION_ID})"

  # Claude handles everything: fetch issues via gh, triage, fix, create PR
  (cd "$REPO_ROOT" && claude -p \
    --output-format stream-json --verbose \
    "/fix-issues limit=1" \
    --session-id "$SESSION_ID" \
    --dangerously-skip-permissions < /dev/null 2>&1) \
    > "$ISSUE_LOG" || true

  log "<<< Claude done (session: ${SESSION_ID}, log: ${ISSUE_LOG})"

  # Extract PR URLs from gh pr create results only (ignore PR URLs in issue bodies / triage)
  PR_URLS=$(python3 -c "
import json, re, sys
ids = set()
urls = set()
for line in open(sys.argv[1]):
    try:
        for c in (json.loads(line).get('message') or {}).get('content') or []:
            if not isinstance(c, dict): continue
            if c.get('type') == 'tool_use' and c.get('name') == 'Bash' and 'gh pr create' in (c.get('input') or {}).get('command', ''):
                ids.add(c['id'])
            if c.get('type') == 'tool_result' and c.get('tool_use_id') in ids:
                urls.update(re.findall(r'https://github\.com/[^/]+/[^/]+/pull/\d+', str(c.get('content',''))))
    except: pass
for u in sorted(urls): print(u)
" "$ISSUE_LOG" 2>/dev/null || true)
  if [ -n "$PR_URLS" ]; then
    while IFS= read -r pr_url; do
      log "    PR created: ${pr_url}"
    done <<< "$PR_URLS"
  else
    log "    No PR created this session"
  fi

  # Return to main after Claude finishes (Claude should do this, but ensure it)
  cd "$REPO_ROOT"
  git checkout main 2>/dev/null || true

  # Check if Claude found anything to fix — adjust wait time accordingly
  if grep -q '\[NO_FIXABLE_ISSUES\]' "$ISSUE_LOG" 2>/dev/null; then
    NO_FIX_STREAK=$((NO_FIX_STREAK + 1))
    IDLE=$((IDLE_BASE * NO_FIX_STREAK))
    [ "$IDLE" -gt "$IDLE_MAX" ] && IDLE=$IDLE_MAX
    log "--- No fixable issues (streak: ${NO_FIX_STREAK}). Sleeping ${IDLE}s ---"
    sleep "$IDLE"
  else
    NO_FIX_STREAK=0
    log "--- Cooldown ${COOLDOWN}s ---"
    sleep "$COOLDOWN"
  fi
done
