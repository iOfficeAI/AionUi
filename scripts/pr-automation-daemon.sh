#!/usr/bin/env bash
# PR Auto-Merge Daemon
# Scans eligible PRs, launches a separate Claude process for each one.
# Each PR gets a fresh context — zero accumulation across PRs.
#
# Usage:
#   ./scripts/pr-automation-daemon.sh                      # defaults: 5min, 3 PRs/cycle
#   ./scripts/pr-automation-daemon.sh --interval 180       # 3min interval
#   ./scripts/pr-automation-daemon.sh --max-prs 5          # 5 PRs per cycle
#   ./scripts/pr-automation-daemon.sh --interval 60 --max-prs 1   # 1min, 1 PR
#   nohup ./scripts/pr-automation-daemon.sh &              # survives terminal close
#
# Logs: ~/.aionui-auto-merge/daemon.log
# Stop: kill $(cat ~/.aionui-auto-merge/daemon.lock)

set -euo pipefail

# Defaults
POLL_INTERVAL="${POLL_INTERVAL:-300}"
MAX_PRS_PER_CYCLE="${MAX_PRS_PER_CYCLE:-3}"

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --interval) POLL_INTERVAL="$2"; shift 2 ;;
    --max-prs) MAX_PRS_PER_CYCLE="$2"; shift 2 ;;
    *) echo "Unknown arg: $1. Usage: $0 [--interval SEC] [--max-prs N]"; exit 1 ;;
  esac
done
REPO="${REPO:-iOfficeAI/AionUi}"
TEAM_SLUG="${TEAM_SLUG:-trusted-contributors}"
SKIP_LABELS="hold bot:reviewing bot:fixing bot:needs-fix bot:needs-human-review bot:done"

LOG_DIR="${HOME}/.aionui-auto-merge"
LOG_FILE="${LOG_DIR}/daemon.log"
LOCK_FILE="${LOG_DIR}/daemon.lock"

mkdir -p "$LOG_DIR"

# Prevent multiple daemon instances
if [ -f "$LOCK_FILE" ]; then
  OTHER_PID=$(cat "$LOCK_FILE")
  if kill -0 "$OTHER_PID" 2>/dev/null; then
    echo "Another daemon is already running (PID: $OTHER_PID). Exiting."
    exit 1
  fi
  rm -f "$LOCK_FILE"
fi

echo $$ > "$LOCK_FILE"

# Prevent macOS from sleeping while daemon runs.
# caffeinate -i keeps system awake (allows display sleep).
# -w $$ auto-exits when daemon exits (even on kill -9).
if command -v caffeinate &>/dev/null; then
  caffeinate -i -w $$ &
  CAFFEINATE_PID=$!
fi

trap 'rm -f "$LOCK_FILE"; kill "$CAFFEINATE_PID" 2>/dev/null; echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) Daemon stopped." >> "$LOG_FILE"; exit 0' EXIT INT TERM

MAX_LOG_SIZE="${MAX_LOG_SIZE:-10485760}"  # 10MB default

log() {
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" | tee -a "$LOG_FILE"

  # Rotate log if exceeds max size
  if [ -f "$LOG_FILE" ] && [ "$(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null)" -gt "$MAX_LOG_SIZE" ]; then
    mv "$LOG_FILE" "${LOG_FILE}.1"
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) Log rotated." > "$LOG_FILE"
  fi
}

# Fetch trusted team members (cached per cycle)
get_trusted_members() {
  gh api "orgs/iOfficeAI/teams/${TEAM_SLUG}/members" --jq '.[].login' 2>/dev/null || echo ""
}

# Get eligible PR numbers, sorted by priority (trusted first, then by date)
get_eligible_prs() {
  local trusted_members
  trusted_members=$(get_trusted_members)

  # Fetch all open PRs with status check info
  local all_prs
  all_prs=$(gh pr list --repo "$REPO" --state open \
    --json number,title,author,labels,createdAt,statusCheckRollup,isDraft \
    --jq '.[] | {number, title, author: .author.login, labels: [.labels[].name], createdAt, checks: .statusCheckRollup, isDraft}' 2>/dev/null) || return

  # Filter and sort in a single pass
  echo "$all_prs" | while IFS= read -r pr; do
    local number title author labels is_draft
    number=$(echo "$pr" | jq -r '.number')
    title=$(echo "$pr" | jq -r '.title')
    author=$(echo "$pr" | jq -r '.author')
    labels=$(echo "$pr" | jq -r '.labels[]' 2>/dev/null || echo "")
    is_draft=$(echo "$pr" | jq -r '.isDraft')

    # Skip draft PRs
    [ "$is_draft" = "true" ] && continue

    # Skip WIP PRs (title contains "WIP", case-insensitive)
    echo "$title" | grep -qi 'WIP' && continue

    # Skip if has blocking label
    local skip=false
    for label in $SKIP_LABELS; do
      if echo "$labels" | grep -qx "$label"; then
        skip=true
        break
      fi
    done
    $skip && continue

    # Check CI status: required jobs must pass (or not be present)
    local ci_ok=true
    local required_jobs="Code Quality|Unit Tests (ubuntu-latest)|Unit Tests (macos-14)|Unit Tests (windows-2022)|Coverage Test"
    local checks
    checks=$(echo "$pr" | jq -c '.checks[]?' 2>/dev/null || echo "")

    if [ -n "$checks" ]; then
      echo "$checks" | while IFS= read -r check; do
        local name status conclusion
        name=$(echo "$check" | jq -r '.name')
        status=$(echo "$check" | jq -r '.status')
        conclusion=$(echo "$check" | jq -r '.conclusion')

        # Only check required jobs
        if echo "$name" | grep -qE "^($required_jobs)$"; then
          if [ "$status" != "COMPLETED" ] || [ "$conclusion" != "SUCCESS" ]; then
            ci_ok=false
          fi
        fi
      done
    fi

    $ci_ok || continue

    # Priority: trusted=0, non-trusted=1
    local priority=1
    if echo "$trusted_members" | grep -qx "$author"; then
      priority=0
    fi

    echo "${priority} ${number}"
  done | sort -k1,1n | awk '{print $2}'
}

log "Daemon started (PID: $$, interval: ${POLL_INTERVAL}s, max-prs: ${MAX_PRS_PER_CYCLE}, repo: ${REPO}, caffeinate: ${CAFFEINATE_PID:-disabled})"

while true; do
  log "--- Cycle start: scanning eligible PRs ---"

  # Get sorted list of eligible PR numbers
  PR_LIST=$(get_eligible_prs)

  if [ -z "$PR_LIST" ]; then
    log "No eligible PRs found. Sleeping."
  else
    PR_COUNT=$(echo "$PR_LIST" | wc -l | tr -d ' ')
    log "Found ${PR_COUNT} eligible PR(s): $(echo "$PR_LIST" | tr '\n' ' ')"

    # Process each PR in a separate Claude process (capped per cycle)
    PROCESSED=0
    for pr_number in $PR_LIST; do
      if [ "$PROCESSED" -ge "$MAX_PRS_PER_CYCLE" ]; then
        log "Reached max PRs per cycle (${MAX_PRS_PER_CYCLE}). Remaining deferred to next cycle."
        break
      fi
      REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
      SKILL_SCRIPTS="$REPO_ROOT/.claude/skills/pr-automation/scripts"
      log ">>> PR #${pr_number}: starting pipeline"

      # Phase 1: Pre-check (shell — lock, CI, rebase)
      PRECHECK_RESULT=$("$SKILL_SCRIPTS/pr-automation-precheck.sh" "$pr_number" 2>&1) || true
      PRECHECK_STATUS=$(echo "$PRECHECK_RESULT" | tail -1)
      log "    PR #${pr_number} precheck: ${PRECHECK_STATUS}"

      if [[ "$PRECHECK_STATUS" == abort:* ]]; then
        log "<<< PR #${pr_number}: ABORTED at precheck — ${PRECHECK_STATUS#abort:}"
        PROCESSED=$((PROCESSED + 1))
        sleep 5
        continue
      fi

      # Phase 2: AI Review + Fix (Claude — the only part that needs AI)
      log "    PR #${pr_number}: starting AI review"
      claude -p "/pr-automation ${pr_number}" --dangerously-skip-permissions 2>&1 | tee -a "$LOG_FILE" || true

      # Determine review outcome from PR labels/comments
      REVIEW_RESULT="approve"
      PR_LABELS=$(gh pr view "$pr_number" --repo "$REPO" --json labels --jq '[.labels[].name]' 2>/dev/null || echo "[]")
      if echo "$PR_LABELS" | jq -e 'index("bot:needs-fix") or index("bot:needs-human-review")' >/dev/null 2>&1; then
        REVIEW_RESULT="reject"
      fi

      # Phase 3: Post-merge (shell — rebase, CI wait, merge, cleanup)
      log "    PR #${pr_number}: post-merge phase (review=${REVIEW_RESULT})"
      POSTMERGE_RESULT=$("$SKILL_SCRIPTS/pr-automation-postmerge.sh" "$pr_number" "$REVIEW_RESULT" 2>&1) || true
      POSTMERGE_STATUS=$(echo "$POSTMERGE_RESULT" | tail -1)

      case "$POSTMERGE_STATUS" in
        merged:*)  log "<<< PR #${pr_number}: MERGED (${POSTMERGE_STATUS#merged:})" ;;
        aborted:*) log "<<< PR #${pr_number}: ABORTED — ${POSTMERGE_STATUS#aborted:}" ;;
        failed:*)  log "<<< PR #${pr_number}: FAILED — ${POSTMERGE_STATUS#failed:}" ;;
        *)         log "<<< PR #${pr_number}: UNKNOWN — ${POSTMERGE_STATUS}" ;;
      esac

      PROCESSED=$((PROCESSED + 1))

      # Brief pause between PRs to avoid rate limiting
      sleep 5
    done
  fi

  log "--- Cycle end. Next in ${POLL_INTERVAL}s ---"
  sleep "$POLL_INTERVAL"
done
