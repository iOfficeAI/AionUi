#!/usr/bin/env bash
# pr-automation.sh — daemon entry point for PR automation
# Runs continuously: launch one Claude instance, wait, sleep, repeat.
#
# Environment variables:
#   SLEEP_SECONDS      Seconds to sleep between Claude runs (default: 30)
#   MAX_CLAUDE_SECS    Maximum seconds a Claude run may take (default: 3600)
#   LOG_DIR            Directory for log files (default: ~/Library/Logs/AionUi)
#   LOG_FILE           Full log file path (overrides LOG_DIR if set)
#   PR_DAYS_LOOKBACK   Only process PRs created within the last N days (default: 7)
#   CRITICAL_PATH_PATTERN  Regex for files that trigger human review (default: see pr-automation.conf)
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONF_FILE="$REPO_DIR/scripts/pr-automation.conf"

# Save env overrides before sourcing config (env vars take precedence)
_ENV_SLEEP=${SLEEP_SECONDS:-}
_ENV_MAX=${MAX_CLAUDE_SECS:-}
_ENV_PATTERN=${CRITICAL_PATH_PATTERN:-}
_ENV_LOOKBACK=${PR_DAYS_LOOKBACK:-}
_ENV_THRESHOLD=${LARGE_PR_FILE_THRESHOLD:-}
_ENV_MODEL=${CLAUDE_MODEL:-}

# Source config file for defaults
# shellcheck source=pr-automation.conf
[ -f "$CONF_FILE" ] && . "$CONF_FILE"

# Restore env overrides (if set before sourcing)
[ -n "$_ENV_SLEEP" ] && SLEEP_SECONDS="$_ENV_SLEEP"
[ -n "$_ENV_MAX" ] && MAX_CLAUDE_SECS="$_ENV_MAX"
[ -n "$_ENV_PATTERN" ] && CRITICAL_PATH_PATTERN="$_ENV_PATTERN"
[ -n "$_ENV_LOOKBACK" ] && PR_DAYS_LOOKBACK="$_ENV_LOOKBACK"
[ -n "$_ENV_THRESHOLD" ] && LARGE_PR_FILE_THRESHOLD="$_ENV_THRESHOLD"
[ -n "$_ENV_MODEL" ] && CLAUDE_MODEL="$_ENV_MODEL"

# Apply final defaults for anything still unset
SLEEP_SECONDS=${SLEEP_SECONDS:-30}
MAX_CLAUDE_SECS=${MAX_CLAUDE_SECS:-3600}
# Export vars that Claude's Bash tool needs to read at runtime
export CRITICAL_PATH_PATTERN=${CRITICAL_PATH_PATTERN:-""}
export LARGE_PR_FILE_THRESHOLD=${LARGE_PR_FILE_THRESHOLD:-50}
export PR_DAYS_LOOKBACK=${PR_DAYS_LOOKBACK:-7}
CLAUDE_MODEL=${CLAUDE_MODEL:-sonnet}
LOG_DIR=${LOG_DIR:-$HOME/Library/Logs/AionUi}
LOG_FILE=${LOG_FILE:-$LOG_DIR/pr-automation-$(date '+%Y-%m-%d').log}
PID_FILE="$LOG_DIR/pr-automation-daemon.pid"
mkdir -p "$LOG_DIR"

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
  # Clean up stale worktrees from killed Claude sessions
  local stale_wts
  stale_wts=$(find /tmp -maxdepth 1 -name 'aionui-pr-*' -type d 2>/dev/null || true)
  if [ -n "$stale_wts" ]; then
    log_warn "Cleaning up stale worktrees: $stale_wts"
    echo "$stale_wts" | while read -r wt; do
      git -C "$REPO_DIR" worktree remove "$wt" --force 2>/dev/null || rm -rf "$wt"
    done
    git -C "$REPO_DIR" worktree prune 2>/dev/null || true
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
log_info "PR automation daemon started. PID=$$, MODEL=$CLAUDE_MODEL, SLEEP_SECONDS=$SLEEP_SECONDS, MAX_CLAUDE_SECS=$MAX_CLAUDE_SECS, PR_DAYS_LOOKBACK=${PR_DAYS_LOOKBACK:-7}"
log_info "Log file: $LOG_FILE | Repo dir: $REPO_DIR"

ITERATION=0
cd "$REPO_DIR"

while true; do
  ITERATION=$((ITERATION + 1))
  log_info "=== Iteration $ITERATION: starting Claude run ==="

  CLAUDE_SESSION_TMP=$(mktemp /tmp/claude-session-XXXXXX.json)
  CLAUDE_LOG_FILE="${LOG_FILE%.log}-claude-iter${ITERATION}.log"
  > "$CLAUDE_LOG_FILE"

  # Stream: raw JSON → CLAUDE_SESSION_TMP (for session_id) + human-readable → CLAUDE_LOG_FILE
  claude --dangerously-skip-permissions --output-format stream-json --verbose --model "$CLAUDE_MODEL" -p "/pr-automation" \
    2>&1 | tee "$CLAUDE_SESSION_TMP" | \
    jq -r --unbuffered '
      if .type == "assistant" then
        ((.message.content // [])[] |
          if .type == "text" then .text
          elif .type == "tool_use" then "[tool_use] \(.name): \(.input | tostring | .[0:300])"
          else empty end)
      elif .type == "result" then
        "[done] stop_reason=\(.stop_reason // "?") duration_ms=\(.duration_ms // "?")"
      else empty end
    ' 2>/dev/null >> "$CLAUDE_LOG_FILE" &
  CURRENT_CLAUDE_PID=$!

  # Extract session_id from the first system init message (may take a moment to appear)
  # Once found, rename the log file to use session_id for easier correlation
  SESSION_ID=""
  for _i in 1 2 3 4 5; do
    sleep 2
    SESSION_ID=$(grep -o '"session_id":"[^"]*"' "$CLAUDE_SESSION_TMP" 2>/dev/null \
      | head -1 | cut -d'"' -f4 || true)
    [ -n "$SESSION_ID" ] && break
  done
  if [ -n "$SESSION_ID" ]; then
    CLAUDE_LOG_FILE_NAMED="${LOG_FILE%.log}-claude-${SESSION_ID}.log"
    mv "$CLAUDE_LOG_FILE" "$CLAUDE_LOG_FILE_NAMED" 2>/dev/null && CLAUDE_LOG_FILE="$CLAUDE_LOG_FILE_NAMED"
  fi
  log_info "Claude launched (PID $CURRENT_CLAUDE_PID, session=${SESSION_ID:-unknown}). Timeout: ${MAX_CLAUDE_SECS}s."
  log_info "Claude log: $CLAUDE_LOG_FILE  (tail -f to follow)"

  ELAPSED=0
  TIMED_OUT=false
  while kill -0 "$CURRENT_CLAUDE_PID" 2>/dev/null; do
    sleep 10
    ELAPSED=$((ELAPSED + 10))
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

  rm -f "$CLAUDE_SESSION_TMP"

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

  # Extract precise duration and exit summary from session log
  PRECISE_MS=$(grep -o 'duration_ms=[0-9]*' "$CLAUDE_LOG_FILE" 2>/dev/null | tail -1 | cut -d= -f2)
  if [ -n "$PRECISE_MS" ]; then
    DURATION_SECS=$(( PRECISE_MS / 1000 ))
  else
    DURATION_SECS=$ELAPSED
  fi
  EXIT_SUMMARY=$(grep -E '\[pr-automation:(exit|skip)\]' "$CLAUDE_LOG_FILE" 2>/dev/null)

  CURRENT_CLAUDE_PID=""
  if [ -n "$EXIT_SUMMARY" ]; then
    LINE_COUNT=$(echo "$EXIT_SUMMARY" | wc -l | tr -d ' ')
    if [ "$LINE_COUNT" -eq 1 ]; then
      log_info "Iteration $ITERATION summary (${DURATION_SECS}s): $EXIT_SUMMARY"
    else
      log_info "Iteration $ITERATION summary (${DURATION_SECS}s): $LINE_COUNT actions:"
      while IFS= read -r line; do
        log_info "  $line"
      done <<< "$EXIT_SUMMARY"
    fi
  else
    log_info "Iteration $ITERATION: Claude ran for ${DURATION_SECS}s (no exit summary)."
  fi
  log_info "Sleeping ${SLEEP_SECONDS}s before next iteration..."
  sleep "$SLEEP_SECONDS"
done
