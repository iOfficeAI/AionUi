#!/usr/bin/env bash
# PR Auto-Merge: Pre-check phase
# Handles: lock acquisition, CI verification, conflict check & rebase
#
# Usage: ./scripts/pr-auto-merge-precheck.sh <pr_number>
# Exit codes:
#   0 = ready for AI review
#   1 = abort (reason printed to stdout)

set -euo pipefail

PR_NUMBER="${1:?Usage: $0 <pr_number>}"
REPO="${REPO:-iOfficeAI/AionUi}"
LOCK_TIMEOUT_MIN=30
REQUIRED_JOBS=(
  "Code Quality"
  "Unit Tests (ubuntu-latest)"
  "Unit Tests (macos-14)"
  "Unit Tests (windows-2022)"
  "Coverage Test"
)

# ─── Step 1: Lock Acquisition ───

# Check for existing lock
LABELS=$(gh pr view "$PR_NUMBER" --repo "$REPO" --json labels --jq '[.labels[].name]' 2>/dev/null || echo "[]")

if echo "$LABELS" | jq -e 'index("hold")' >/dev/null 2>&1; then
  echo "abort:PR #${PR_NUMBER} has 'hold' label"
  exit 1
fi

if echo "$LABELS" | jq -e 'index("bot:reviewing")' >/dev/null 2>&1; then
  # Check if stale
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
🤖 **AI Auto-Merge Pipeline Started**
| Field | Value |
|-------|-------|
| Agent | $(hostname) |
| Time | $(date -u +%Y-%m-%dT%H:%M:%SZ) |
| Phase | precheck |" 2>/dev/null

# ─── Step 2: CI Pre-check ───

CI_DATA=$(gh pr view "$PR_NUMBER" --repo "$REPO" --json statusCheckRollup \
  --jq '.statusCheckRollup[] | {name: .name, status: .status, conclusion: .conclusion}' 2>/dev/null || echo "")

FAILED_JOBS=()
PENDING_JOBS=()

for job in "${REQUIRED_JOBS[@]}"; do
  JOB_STATUS=$(echo "$CI_DATA" | jq -r "select(.name == \"$job\") | .status" 2>/dev/null || echo "")
  JOB_CONCLUSION=$(echo "$CI_DATA" | jq -r "select(.name == \"$job\") | .conclusion" 2>/dev/null || echo "")

  # Job not present = skipped (e.g. docs-only PR)
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
  # Release lock before aborting
  gh pr edit "$PR_NUMBER" --repo "$REPO" --remove-label "bot:reviewing" --add-label "bot:needs-fix" 2>/dev/null
  gh pr comment "$PR_NUMBER" --repo "$REPO" --body "<!-- pr-review-bot -->
## CI 检查未通过

以下 job 未通过，请修复：

| Job | 结论 |
|-----|------|
$(printf '| %s | ❌ |\n' "${FAILED_JOBS[@]}")

本次自动审合暂缓，待 CI 全部通过后将重新执行。" 2>/dev/null
  echo "abort:CI failed — ${FAILED_JOBS[*]}"
  exit 1
fi

if [ ${#PENDING_JOBS[@]} -gt 0 ]; then
  # Wait up to 10 minutes for pending jobs
  echo "info:Waiting for CI jobs: ${PENDING_JOBS[*]}"
  WAITED=0
  while [ $WAITED -lt 600 ]; do
    sleep 60
    WAITED=$((WAITED + 60))

    ALL_DONE=true
    for job in "${REQUIRED_JOBS[@]}"; do
      JOB_INFO=$(gh pr view "$PR_NUMBER" --repo "$REPO" --json statusCheckRollup \
        --jq ".statusCheckRollup[] | select(.name == \"$job\")" 2>/dev/null || echo "")
      [ -z "$JOB_INFO" ] && continue
      STATUS=$(echo "$JOB_INFO" | jq -r '.status')
      CONCLUSION=$(echo "$JOB_INFO" | jq -r '.conclusion')
      if [ "$STATUS" != "COMPLETED" ]; then
        ALL_DONE=false
        break
      fi
      if [ "$CONCLUSION" != "SUCCESS" ]; then
        gh pr edit "$PR_NUMBER" --repo "$REPO" --remove-label "bot:reviewing" --add-label "bot:needs-fix" 2>/dev/null
        echo "abort:CI job '$job' failed with $CONCLUSION"
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
  echo "info:PR has conflicts, attempting rebase"

  # Checkout PR branch
  gh pr checkout "$PR_NUMBER" --repo "$REPO" 2>/dev/null
  git fetch origin "$BASE_BRANCH" 2>/dev/null

  if git rebase "origin/$BASE_BRANCH" 2>/dev/null; then
    git push --force-with-lease 2>/dev/null
    echo "info:Rebase successful, conflicts resolved"
  else
    git rebase --abort 2>/dev/null || true
    git checkout "$BASE_BRANCH" 2>/dev/null || true

    gh pr edit "$PR_NUMBER" --repo "$REPO" --remove-label "bot:reviewing" --add-label "bot:needs-fix" 2>/dev/null
    gh pr comment "$PR_NUMBER" --repo "$REPO" --body "<!-- pr-review-bot -->
## 合并冲突

PR 与 \`$BASE_BRANCH\` 存在冲突，自动 rebase 失败。请手动解决冲突后重新推送。" 2>/dev/null
    echo "abort:Merge conflicts cannot be auto-resolved"
    exit 1
  fi
else
  # Checkout PR for the agent to work on
  gh pr checkout "$PR_NUMBER" --repo "$REPO" 2>/dev/null
fi

echo "ready:${HEAD_BRANCH}:${BASE_BRANCH}:${IS_FORK}"
