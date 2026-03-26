#!/usr/bin/env bash
# pr-automation.sh — daemon entry point for PR automation
# Runs continuously: launch one Claude instance, wait, sleep, repeat.
#
# Environment variables:
#   SLEEP_SECONDS   Seconds to sleep between Claude runs (default: 30)
#   MAX_CLAUDE_SECS Maximum seconds a Claude run may take (default: 3600)
#   LOG_FILE        Log file path (default: /tmp/pr-automation.log)
set -euo pipefail

SLEEP_SECONDS=${SLEEP_SECONDS:-30}
MAX_CLAUDE_SECS=${MAX_CLAUDE_SECS:-3600}
LOG_FILE=${LOG_FILE:-/tmp/pr-automation.log}
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="/tmp/pr-automation-daemon.pid"

log() {
  local level="$1"; shift
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $*" | tee -a "$LOG_FILE"
}
log_info()  { log "INFO " "$@"; }
log_warn()  { log "WARN " "$@"; }
log_error() { log "ERROR" "$@"; }

cleanup_labels() {
  log_info "Cleaning up residual bot:reviewing / bot:fixing / bot:ready-to-fix labels..."
  local nums
  for label in "bot:reviewing" "bot:fixing" "bot:ready-to-fix"; do
    nums=$(gh pr list --state open --label "$label" --json number \
      --jq '.[].number' 2>/dev/null || true)
    if [ -n "$nums" ]; then
      echo "$nums" | xargs -I{} gh pr edit {} --remove-label "$label" 2>/dev/null || true
      log_info "Removed $label from: $nums"
    fi
  done
  # Abort any in-progress rebase that a killed Claude may have left behind
  if git -C "$REPO_DIR" rebase --show-current-patch >/dev/null 2>&1; then
    log_warn "Detected in-progress rebase. Aborting..."
    git -C "$REPO_DIR" rebase --abort 2>/dev/null || true
  fi
}

CURRENT_CLAUDE_PID=""
shutdown() {
  log_info "Shutdown signal received. Stopping daemon..."
  if [ -n "$CURRENT_CLAUDE_PID" ] && kill -0 "$CURRENT_CLAUDE_PID" 2>/dev/null; then
    log_warn "Killing current Claude process (PID $CURRENT_CLAUDE_PID)..."
    kill "$CURRENT_CLAUDE_PID" 2>/dev/null || true
    sleep 5
    kill -9 "$CURRENT_CLAUDE_PID" 2>/dev/null || true
  fi
  cleanup_labels
  rm -f "$PID_FILE"
  log_info "Daemon stopped."
  exit 0
}
trap shutdown SIGTERM SIGINT

if [ -f "$PID_FILE" ]; then
  PREV_PID=$(cat "$PID_FILE")
  if kill -0 "$PREV_PID" 2>/dev/null; then
    log_warn "Another daemon instance is already running (PID $PREV_PID). Exiting."
    exit 1
  else
    log_warn "Stale PID file found (PID $PREV_PID no longer running). Cleaning up..."
    cleanup_labels
    rm -f "$PID_FILE"
  fi
fi

echo $$ > "$PID_FILE"
log_info "PR automation daemon started. PID=$$, SLEEP_SECONDS=$SLEEP_SECONDS, MAX_CLAUDE_SECS=$MAX_CLAUDE_SECS"
log_info "Log file: $LOG_FILE | Repo dir: $REPO_DIR"

ITERATION=0
cd "$REPO_DIR"

while true; do
  ITERATION=$((ITERATION + 1))
  log_info "=== Iteration $ITERATION: starting Claude run ==="

  claude --dangerously-skip-permissions -p "/pr-automation" \
    >> "$LOG_FILE" 2>&1 &
  CURRENT_CLAUDE_PID=$!
  log_info "Claude launched (PID $CURRENT_CLAUDE_PID). Timeout: ${MAX_CLAUDE_SECS}s."

  ELAPSED=0
  TIMED_OUT=false
  while kill -0 "$CURRENT_CLAUDE_PID" 2>/dev/null; do
    sleep 5
    ELAPSED=$((ELAPSED + 5))
    if [ "$ELAPSED" -ge "$MAX_CLAUDE_SECS" ]; then
      log_warn "Claude run exceeded ${MAX_CLAUDE_SECS}s (PID $CURRENT_CLAUDE_PID). Killing..."
      kill "$CURRENT_CLAUDE_PID" 2>/dev/null || true
      sleep 5
      kill -9 "$CURRENT_CLAUDE_PID" 2>/dev/null || true
      cleanup_labels
      TIMED_OUT=true
      break
    fi
  done

  if [ "$TIMED_OUT" = "true" ]; then
    log_warn "Iteration $ITERATION: Claude timed out after ${MAX_CLAUDE_SECS}s."
  else
    EXIT_CODE=0
    wait "$CURRENT_CLAUDE_PID" 2>/dev/null || EXIT_CODE=$?
    if [ "$EXIT_CODE" -eq 0 ]; then
      log_info "Iteration $ITERATION: Claude exited successfully."
    else
      log_warn "Iteration $ITERATION: Claude exited with code $EXIT_CODE."
    fi
  fi

  CURRENT_CLAUDE_PID=""
  log_info "Iteration $ITERATION: Claude ran for ${ELAPSED}s."
  log_info "Sleeping ${SLEEP_SECONDS}s before next iteration..."
  sleep "$SLEEP_SECONDS"
done
