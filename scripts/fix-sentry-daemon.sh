#!/usr/bin/env bash
# Fix-Sentry Daemon
# Continuously launches Claude processes to fix Sentry issues one at a time.
# Claude handles all Sentry API interaction via MCP — daemon is just a scheduler.
#
# Usage:
#   ./scripts/fix-sentry-daemon.sh              # start daemon
#   ./scripts/fix-sentry-daemon.sh stop         # stop daemon (kills all child processes)
#   nohup ./scripts/fix-sentry-daemon.sh &      # survives terminal close
#
# Logs:
#   Main log:    ~/.aionui-fix-sentry/daemon.log
#   Session logs: ~/.aionui-fix-sentry/tmp/session-<uuid>.log

set -euo pipefail

# ─── Stop command ───

LOG_DIR="${HOME}/.aionui-fix-sentry"
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
SENTRY_PROJECT="electron"     # Sentry project slug passed to skill
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

# Kill all child processes on exit
trap 'kill 0 2>/dev/null; rm -f "$LOCK_FILE"; echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) Daemon stopped." >> "$LOG_FILE"' EXIT INT TERM

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

log "Daemon started (PID: $$, cooldown: ${COOLDOWN}s, project: ${SENTRY_PROJECT}, caffeinate: ${CAFFEINATE_PID})"

while true; do
  # Create isolated worktree from latest main
  WORKTREE_DIR="${REPO_ROOT}/.worktrees/fix-sentry-$(date +%s)"
  git -C "$REPO_ROOT" fetch origin main 2>/dev/null || true
  git -C "$REPO_ROOT" worktree add "$WORKTREE_DIR" origin/main --detach 2>/dev/null || {
    log "Failed to create worktree, retrying in ${COOLDOWN}s"
    sleep "$COOLDOWN"
    continue
  }

  SESSION_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
  ISSUE_LOG="${LOG_DIR}/tmp/session-${SESSION_ID}.log"

  log ">>> Launching Claude (session: ${SESSION_ID}, worktree: ${WORKTREE_DIR})"

  # Claude handles everything: fetch issues via MCP, triage, fix, create PR
  # stream-json outputs realtime (plain -p buffers everything until exit)
  (cd "$WORKTREE_DIR" && claude -p \
    --output-format stream-json --verbose \
    "/fix-sentry limit=1 project=${SENTRY_PROJECT}" \
    --session-id "$SESSION_ID" \
    --dangerously-skip-permissions < /dev/null 2>&1) \
    > "$ISSUE_LOG" || true

  log "<<< Claude done (session: ${SESSION_ID}, log: ${ISSUE_LOG})"

  # Cleanup worktree
  git -C "$REPO_ROOT" worktree remove "$WORKTREE_DIR" --force 2>/dev/null || true

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
