#!/usr/bin/env bash
# PR Automation: Pre-check phase
# Handles: lock acquisition, CI verification (with workflow approval), conflict check & rebase
#
# Usage: .claude/skills/pr-automation/scripts/pr-automation-precheck.sh <pr_number>
# Output (last line):
#   ready:<head>:<base>:<is_fork>            — proceed, no conflicts
#   ready:<head>:<base>:<is_fork>:has_conflicts — proceed, Claude must resolve conflicts
#   abort:<reason>                           — skip this PR
# Exit codes:
#   0 = ready for AI review
#   1 = abort

set -euo pipefail

PR_NUMBER="${1:?Usage: $0 <pr_number>}"
REPO="${REPO:-$(gh repo view --json nameWithOwner --jq '.nameWithOwner' 2>/dev/null)}"
LOCK_TIMEOUT_MIN=30
REQUIRED_JOBS=(
  "Code Quality"
  "Unit Tests (ubuntu-latest)"
  "Unit Tests (macos-14)"
  "Unit Tests (windows-2022)"
  "Coverage Test"
  "i18n-check"
)

# ─── Step 1: Lock Acquisition ───

LABELS=$(gh pr view "$PR_NUMBER" --repo "$REPO" --json labels --jq '[.labels[].name]' 2>/dev/null || echo "[]")

if echo "$LABELS" | jq -e 'index("hold")' >/dev/null 2>&1; then
  echo "abort:PR #${PR_NUMBER} has 'hold' label"
  exit 1
fi

if echo "$LABELS" | jq -e 'index("bot:reviewing")' >/dev/null 2>&1; then
  # Check if stale lock (older than LOCK_TIMEOUT_MIN)
  LAST_LOCK=$(gh pr view "$PR_NUMBER" --repo "$REPO" --json comments \
    --jq '[.comments[] | select(.body | startswith("<!-- ai-lock -->")) | .createdAt] | last // empty' 2>/dev/null)

  if [ -n "$LAST_LOCK" ]; then
    LOCK_AGE_SEC=$(( $(date +%s) - $(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$LAST_LOCK" +%s 2>/dev/null || date -d "$LAST_LOCK" +%s 2>/dev/null) ))
    if [ "$LOCK_AGE_SEC" -lt $((LOCK_TIMEOUT_MIN * 60)) ]; then
      echo "abort:PR #${PR_NUMBER} is being processed by another agent (locked ${LOCK_AGE_SEC}s ago)"
      exit 1
    fi
  fi
  echo "info:Stale lock detected on PR #${PR_NUMBER}, taking over"
fi

# Acquire lock
gh pr edit "$PR_NUMBER" --repo "$REPO" --add-label "bot:reviewing" 2>/dev/null
gh pr comment "$PR_NUMBER" --repo "$REPO" --body "<!-- ai-lock -->
🤖 **PR Automation Pipeline Started**
| Field | Value |
|-------|-------|
| Agent | $(hostname) |
| Time | $(date -u +%Y-%m-%dT%H:%M:%SZ) |
| Phase | precheck |" 2>/dev/null

# ─── Step 2: CI Pre-check ───

CI_DATA=$(gh pr view "$PR_NUMBER" --repo "$REPO" --json statusCheckRollup \
  --jq '.statusCheckRollup[]? | {name: .name, status: .status, conclusion: .conclusion}' 2>/dev/null || echo "")

# CI never triggered — attempt to approve pending workflow runs
if [ -z "$CI_DATA" ]; then
  echo "info:CI not triggered yet on PR #${PR_NUMBER}, approving pending workflows"
  RUN_IDS=$(gh run list --repo "$REPO" --json databaseId,status \
    --jq '.[] | select(.status == "action_required") | .databaseId' 2>/dev/null || echo "")
  for RUN_ID in $RUN_IDS; do
    gh run approve "$RUN_ID" --repo "$REPO" 2>/dev/null || true
  done
  gh pr edit "$PR_NUMBER" --repo "$REPO" --remove-label "bot:reviewing" 2>/dev/null
  echo "abort:CI not triggered yet — approved pending workflows, will retry next round"
  exit 1
fi

FAILED_JOBS=()
PENDING_JOBS=()

for job in "${REQUIRED_JOBS[@]}"; do
  JOB_STATUS=$(echo "$CI_DATA" | jq -r "select(.name == \"$job\") | .status" 2>/dev/null || echo "")
  JOB_CONCLUSION=$(echo "$CI_DATA" | jq -r "select(.name == \"$job\") | .conclusion" 2>/dev/null || echo "")

  # Job not present = not required for this PR (e.g. docs-only PR skips some jobs)
  [ -z "$JOB_STATUS" ] && continue

  if [ "$JOB_STATUS" = "COMPLETED" ] && [ "$JOB_CONCLUSION" = "SUCCESS" ]; then
    continue
  elif [ "$JOB_STATUS" = "COMPLETED" ]; then
    FAILED_JOBS+=("$job ($JOB_CONCLUSION)")
  else
    PENDING_JOBS+=("$job ($JOB_STATUS)")
  fi
done

if [ ${#FAILED_JOBS[@]} -gt 0 ]; then
  gh pr edit "$PR_NUMBER" --repo "$REPO" --remove-label "bot:reviewing" --add-label "bot:needs-fix" 2>/dev/null
  gh pr comment "$PR_NUMBER" --repo "$REPO" --body "<!-- pr-automation-bot -->
## CI 检查未通过

以下 job 未通过，请修复后重新推送：

| Job | 结论 |
|-----|------|
$(printf '| %s | ❌ |\n' "${FAILED_JOBS[@]}")

CI 全部通过后本系统将自动重新处理。" 2>/dev/null
  echo "abort:CI failed — ${FAILED_JOBS[*]}"
  exit 1
fi

if [ ${#PENDING_JOBS[@]} -gt 0 ]; then
  echo "info:Waiting for CI jobs: ${PENDING_JOBS[*]}"
  WAITED=0
  while [ $WAITED -lt 600 ]; do
    sleep 60
    WAITED=$((WAITED + 60))

    ALL_DONE=true
    for job in "${REQUIRED_JOBS[@]}"; do
      JOB_INFO=$(gh pr view "$PR_NUMBER" --repo "$REPO" --json statusCheckRollup \
        --jq ".statusCheckRollup[]? | select(.name == \"$job\")" 2>/dev/null || echo "")
      [ -z "$JOB_INFO" ] && continue
      STATUS=$(echo "$JOB_INFO" | jq -r '.status')
      CONCLUSION=$(echo "$JOB_INFO" | jq -r '.conclusion')
      if [ "$STATUS" != "COMPLETED" ]; then
        ALL_DONE=false
        break
      fi
      if [ "$CONCLUSION" != "SUCCESS" ]; then
        gh pr edit "$PR_NUMBER" --repo "$REPO" --remove-label "bot:reviewing" --add-label "bot:needs-fix" 2>/dev/null
        echo "abort:CI job '$job' failed with $CONCLUSION after wait"
        exit 1
      fi
    done

    $ALL_DONE && break
  done

  if ! $ALL_DONE; then
    gh pr edit "$PR_NUMBER" --repo "$REPO" --remove-label "bot:reviewing" 2>/dev/null
    echo "abort:CI jobs still pending after 10 minutes"
    exit 1
  fi
fi

# ─── Step 3: Conflict Pre-check & Rebase ───

PR_META=$(gh pr view "$PR_NUMBER" --repo "$REPO" \
  --json headRefName,baseRefName,isCrossRepository,mergeable \
  --jq '{head: .headRefName, base: .baseRefName, fork: .isCrossRepository, mergeable: .mergeable}' 2>/dev/null)

HEAD_BRANCH=$(echo "$PR_META" | jq -r '.head')
BASE_BRANCH=$(echo "$PR_META" | jq -r '.base')
IS_FORK=$(echo "$PR_META" | jq -r '.fork')
MERGEABLE=$(echo "$PR_META" | jq -r '.mergeable')

if [ "$MERGEABLE" = "CONFLICTING" ]; then
  echo "info:PR has conflicts, attempting automatic rebase"

  gh pr checkout "$PR_NUMBER" --repo "$REPO" 2>/dev/null
  git fetch origin "$BASE_BRANCH" 2>/dev/null

  if git rebase "origin/$BASE_BRANCH" 2>/dev/null; then
    git push --force-with-lease 2>/dev/null
    git checkout "$BASE_BRANCH" 2>/dev/null || true
    echo "info:Automatic rebase successful"
    echo "ready:${HEAD_BRANCH}:${BASE_BRANCH}:${IS_FORK}"
  else
    # Simple rebase failed — pass to Claude for intelligent conflict resolution
    git rebase --abort 2>/dev/null || true
    git checkout "$BASE_BRANCH" 2>/dev/null || true
    echo "info:Automatic rebase failed, delegating conflict resolution to Claude"
    echo "ready:${HEAD_BRANCH}:${BASE_BRANCH}:${IS_FORK}:has_conflicts"
  fi
else
  # Checkout PR for Claude to work on
  gh pr checkout "$PR_NUMBER" --repo "$REPO" 2>/dev/null
  echo "ready:${HEAD_BRANCH}:${BASE_BRANCH}:${IS_FORK}"
fi
