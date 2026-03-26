#!/usr/bin/env bash
# pr-automation.sh — cron entry point for PR automation
# Usage: ./scripts/pr-automation.sh [N]
#   N: number of parallel Claude instances (default: 1)
set -euo pipefail

N=${1:-1}
LOCK_FILE="/tmp/pr-automation.lock"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_TS() { date '+%Y-%m-%d %H:%M:%S'; }

# ---------------------------------------------------------------------------
# Cleanup: remove lock file and stale bot labels
# ---------------------------------------------------------------------------
cleanup_labels() {
  cd "$REPO_DIR"
  local nums
  nums=$(gh pr list --state open --label "bot:reviewing" --json number \
    --jq '.[].number' 2>/dev/null || true)
  if [ -n "$nums" ]; then
    echo "$nums" | xargs -I{} gh pr edit {} --remove-label "bot:reviewing" 2>/dev/null || true
  fi
  nums=$(gh pr list --state open --label "bot:fixing" --json number \
    --jq '.[].number' 2>/dev/null || true)
  if [ -n "$nums" ]; then
    echo "$nums" | xargs -I{} gh pr edit {} --remove-label "bot:fixing" 2>/dev/null || true
  fi
}

cleanup() {
  echo "[$(LOG_TS)] Cleaning up lock file and stale labels..."
  rm -f "$LOCK_FILE"
  cleanup_labels
}

# Register cleanup for normal exit, interrupt, and termination
trap cleanup EXIT INT TERM

# ---------------------------------------------------------------------------
# Lock file check (PID-based)
# ---------------------------------------------------------------------------
if [ -f "$LOCK_FILE" ]; then
  PREV_PID=$(cat "$LOCK_FILE")
  if kill -0 "$PREV_PID" 2>/dev/null; then
    echo "[$(LOG_TS)] Previous run (PID $PREV_PID) is still running. Exiting without cleanup."
    # Disable trap so we don't interfere with the running instance
    trap - EXIT INT TERM
    exit 0
  else
    echo "[$(LOG_TS)] Previous run (PID $PREV_PID) appears to have crashed. Cleaning up stale labels..."
    cleanup_labels
    rm -f "$LOCK_FILE"
  fi
fi

# Write current script PID to lock file
echo $$ > "$LOCK_FILE"
echo "[$(LOG_TS)] PR automation started. PID: $$, instances: $N"

# ---------------------------------------------------------------------------
# Launch N Claude instances
# ---------------------------------------------------------------------------
cd "$REPO_DIR"
declare -a PIDS=()

for i in $(seq 1 "$N"); do
  echo "[$(LOG_TS)] Launching instance $i of $N..."
  claude --dangerously-skip-permissions -p "/pr-automation" &
  PIDS+=($!)
done

# Wait for all instances to complete
EXIT_CODE=0
for PID in "${PIDS[@]}"; do
  if ! wait "$PID"; then
    echo "[$(LOG_TS)] Instance (PID $PID) exited with non-zero status."
    EXIT_CODE=1
  fi
done

echo "[$(LOG_TS)] All instances completed. Exit code: $EXIT_CODE"
# cleanup is called automatically via trap EXIT
exit "$EXIT_CODE"
