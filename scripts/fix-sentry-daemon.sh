#!/usr/bin/env bash
# Fix-Sentry Daemon
# Fetches high-frequency Sentry issues, launches a separate Claude process for each one.
# Each issue gets a fresh context — zero accumulation across issues.
#
# Usage:
#   ./scripts/fix-sentry-daemon.sh              # start daemon
#   ./scripts/fix-sentry-daemon.sh stop         # stop daemon (kills all child processes)
#   nohup ./scripts/fix-sentry-daemon.sh &      # survives terminal close
#
# Sentry auth token is auto-read from ~/.claude.json MCP config.
#
# Logs: ~/.aionui-fix-sentry/daemon.log

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

# ─── Configuration (edit here, no args needed) ───

POLL_INTERVAL=1800             # 30 minutes between cycles
MAX_ISSUES_PER_CYCLE=3         # max issues to fix per cycle
THRESHOLD=100                  # minimum occurrence count
SENTRY_ORG="iofficeai"
SENTRY_PROJECT="electron"
REPO="iOfficeAI/AionUi"
SENTRY_API="https://sentry.io/api/0"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="${HOME}/.aionui-fix-sentry"
LOG_FILE="${LOG_DIR}/daemon.log"
LOCK_FILE="${LOG_DIR}/daemon.lock"
PROCESSED_FILE="${LOG_DIR}/processed.json"
MAX_LOG_SIZE=10485760  # 10MB

# ─── Auto-detect Sentry auth token from ~/.claude.json ───

CLAUDE_CONFIG="${HOME}/.claude.json"

if [ -z "${SENTRY_AUTH_TOKEN:-}" ]; then
  if [ -f "$CLAUDE_CONFIG" ]; then
    # Extract --access-token=<token> from sentry MCP server args
    SENTRY_AUTH_TOKEN=$(jq -r '
      .mcpServers.sentry.args[]?
      | select(startswith("--access-token="))
      | sub("^--access-token="; "")
    ' "$CLAUDE_CONFIG" 2>/dev/null || echo "")
  fi

  if [ -z "$SENTRY_AUTH_TOKEN" ]; then
    echo "Error: Cannot find Sentry auth token."
    echo "Expected in ~/.claude.json under mcpServers.sentry.args (--access-token=...)"
    echo "Or set SENTRY_AUTH_TOKEN env var manually."
    exit 1
  fi
fi

# ─── Setup ───

mkdir -p "$LOG_DIR"

if [ ! -f "$PROCESSED_FILE" ]; then
  echo '{}' > "$PROCESSED_FILE"
fi

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
if command -v caffeinate &>/dev/null; then
  caffeinate -i -w $$ &
  CAFFEINATE_PID=$!
fi

# Kill all child processes (including claude) on exit
trap 'kill 0 2>/dev/null; rm -f "$LOCK_FILE"; echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) Daemon stopped." >> "$LOG_FILE"' EXIT INT TERM

# ─── Helpers ───

log() {
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" | tee -a "$LOG_FILE"

  if [ -f "$LOG_FILE" ] && [ "$(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null)" -gt "$MAX_LOG_SIZE" ]; then
    mv "$LOG_FILE" "${LOG_FILE}.1"
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) Log rotated." > "$LOG_FILE"
  fi
}

sentry_api() {
  curl -sS -H "Authorization: Bearer ${SENTRY_AUTH_TOKEN}" \
    "${SENTRY_API}${1}" 2>/dev/null
}

fetch_sentry_issues() {
  # URL-encode the query: > → %3E, : → %3A, space → %20
  local query="times_seen%3A%3E${THRESHOLD}%20is%3Aunresolved"
  local raw
  raw=$(sentry_api "/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/issues/?query=${query}&sort=freq&limit=25") || {
    log "Warning: Sentry API request failed"
    return 0
  }

  # Validate response is a JSON array (not an error object)
  if ! echo "$raw" | jq -e 'type == "array"' >/dev/null 2>&1; then
    local detail
    detail=$(echo "$raw" | jq -r '.detail // empty' 2>/dev/null)
    log "Warning: Sentry API returned non-array response: ${detail:-unknown error}"
    return 0
  fi

  echo "$raw" | jq -c '.[]? | {id: (.id | tostring), shortId: .shortId, title: .title, count: (.count // "0" | tostring), permalink: .permalink}' 2>/dev/null || true
}

is_processed() {
  local issue_id="$1"
  local ttl_hours=168  # 7 days

  local processed_at
  processed_at=$(jq -r ".\"${issue_id}\" // empty" "$PROCESSED_FILE" 2>/dev/null)
  [ -z "$processed_at" ] && return 1

  local now age
  now=$(date +%s)
  age=$(( now - processed_at ))
  [ "$age" -gt $((ttl_hours * 3600)) ] && return 1

  return 0
}

mark_processed() {
  local now
  now=$(date +%s)
  local tmp
  tmp=$(mktemp)
  jq ".\"${1}\" = ${now}" "$PROCESSED_FILE" > "$tmp" && mv "$tmp" "$PROCESSED_FILE"
}

has_existing_pr() {
  local short_id="$1"
  # Search by branch name pattern (fix/sentry-ELECTRON-XX) and by title keyword
  local result
  result=$(gh pr list --repo "$REPO" --state open \
    --head "fix/sentry-${short_id}" --json number --jq '.[].number' 2>/dev/null || echo "")
  if [ -n "$result" ]; then return 0; fi
  result=$(gh pr list --repo "$REPO" --state open \
    --search "${short_id}" --json number --jq '.[].number' 2>/dev/null || echo "")
  [ -n "$result" ]
}

clean_processed() {
  local now cutoff tmp
  now=$(date +%s)
  cutoff=$((now - 168 * 3600))
  tmp=$(mktemp)
  jq "to_entries | map(select(.value > ${cutoff})) | from_entries" "$PROCESSED_FILE" > "$tmp" && mv "$tmp" "$PROCESSED_FILE"
}

# ─── Main loop ───

log "Daemon started (PID: $$, interval: ${POLL_INTERVAL}s, max-issues: ${MAX_ISSUES_PER_CYCLE}, threshold: ${THRESHOLD}, org: ${SENTRY_ORG}, project: ${SENTRY_PROJECT}, caffeinate: ${CAFFEINATE_PID:-disabled})"

while true; do
  log "--- Cycle start: fetching Sentry issues (times_seen > ${THRESHOLD}, unresolved) ---"

  clean_processed

  ISSUES=$(fetch_sentry_issues) || true

  if [ -z "$ISSUES" ]; then
    log "No issues found above threshold."
  else
    TOTAL=$(echo "$ISSUES" | wc -l | tr -d ' ')
    log "Found ${TOTAL} issue(s) from Sentry"

    PROCESSED=0
    while IFS= read -r issue; do
      if [ "$PROCESSED" -ge "$MAX_ISSUES_PER_CYCLE" ]; then
        log "Reached max issues per cycle (${MAX_ISSUES_PER_CYCLE}). Remaining deferred."
        break
      fi

      # Parse issue fields (use <<< to avoid echo pipe issues with special chars)
      issue_id=$(jq -r '.id' <<< "$issue" 2>/dev/null) || { log "  Skipping: failed to parse issue JSON"; continue; }
      short_id=$(jq -r '.shortId' <<< "$issue" 2>/dev/null || echo "UNKNOWN")
      title=$(jq -r '.title' <<< "$issue" 2>/dev/null || echo "")
      count=$(jq -r '.count' <<< "$issue" 2>/dev/null || echo "0")
      permalink=$(jq -r '.permalink' <<< "$issue" 2>/dev/null || echo "")

      if [ -z "$issue_id" ] || [ -z "$permalink" ]; then
        log "  [${short_id}] Missing id or permalink, skipping"
        continue
      fi

      if is_processed "$issue_id"; then
        log "  [${short_id}] Already processed (within TTL). Skipping."
        continue
      fi

      if has_existing_pr "$short_id"; then
        log "  [${short_id}] Open PR already exists. Skipping."
        mark_processed "$issue_id"
        continue
      fi

      log ">>> [${short_id}] ${title} (${count} events) — starting fix"

      # Mark as processed BEFORE launching Claude (so daemon restart won't re-process)
      mark_processed "$issue_id"

      # Create isolated worktree so daemon doesn't interfere with main working directory
      WORKTREE_DIR="${REPO_ROOT}/.worktrees/fix-sentry-${short_id}"
      if [ -d "$WORKTREE_DIR" ]; then
        git -C "$REPO_ROOT" worktree remove "$WORKTREE_DIR" --force 2>/dev/null || rm -rf "$WORKTREE_DIR"
      fi
      git -C "$REPO_ROOT" fetch origin main 2>/dev/null || true
      git -C "$REPO_ROOT" worktree add "$WORKTREE_DIR" origin/main --detach 2>/dev/null || {
        log "  [${short_id}] Failed to create worktree, skipping"
        continue
      }

      # Launch Claude in the worktree directory
      SESSION_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
      log "    [${short_id}] Claude session: ${SESSION_ID} (worktree: ${WORKTREE_DIR})"
      (cd "$WORKTREE_DIR" && claude -p "/fix-sentry issue_url=${permalink}" \
        --session-id "$SESSION_ID" \
        --dangerously-skip-permissions < /dev/null 2>&1) | tee -a "$LOG_FILE" || true

      # Cleanup worktree
      git -C "$REPO_ROOT" worktree remove "$WORKTREE_DIR" --force 2>/dev/null || true

      log "<<< [${short_id}] Pipeline complete"
      PROCESSED=$((PROCESSED + 1))

      sleep 10
    done <<< "$ISSUES"
  fi

  log "--- Cycle end. Next in ${POLL_INTERVAL}s ---"
  sleep "$POLL_INTERVAL"
done
