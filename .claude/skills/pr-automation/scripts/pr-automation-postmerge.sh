#!/usr/bin/env bash
# PR Automation: Post-merge phase
# Handles: final rebase, full CI wait, merge, cleanup
#
# Usage: .claude/skills/pr-automation/scripts/pr-automation-postmerge.sh <pr_number> [review_result]
#   review_result: "approve" (default) | "reject"
# Output (last line):
#   merged:<method>  — merged successfully
#   aborted:<reason> — review rejected, labels already set by Claude
#   failed:<reason>  — unexpected failure
# Exit codes:
#   0 = merged
#   1 = aborted or failed

set -euo pipefail

PR_NUMBER="${1:?Usage: $0 <pr_number> [review_result]}"
REVIEW_RESULT="${2:-approve}"
REPO="${REPO:-$(gh repo view --json nameWithOwner --jq '.nameWithOwner' 2>/dev/null)}"

# ─── If review rejected, just release lock and exit ───

if [ "$REVIEW_RESULT" != "approve" ]; then
  # Labels already set by Claude (bot:needs-fix or bot:needs-human-review)
  gh pr edit "$PR_NUMBER" --repo "$REPO" --remove-label "bot:reviewing" 2>/dev/null || true
  git checkout main 2>/dev/null && git pull origin main 2>/dev/null || true
  echo "aborted:review result is ${REVIEW_RESULT}"
  exit 1
fi

# ─── Step 1: Final Rebase ───

PR_META=$(gh pr view "$PR_NUMBER" --repo "$REPO" \
  --json headRefName,baseRefName --jq '{head: .headRefName, base: .baseRefName}' 2>/dev/null)
BASE_BRANCH=$(echo "$PR_META" | jq -r '.base')

# Ensure we are on the PR branch before rebasing (precheck or Claude may have switched away)
gh pr checkout "$PR_NUMBER" --repo "$REPO" 2>/dev/null
git fetch origin "$BASE_BRANCH" 2>/dev/null

if ! git rebase "origin/$BASE_BRANCH" 2>/dev/null; then
  git rebase --abort 2>/dev/null || true
  gh pr edit "$PR_NUMBER" --repo "$REPO" --remove-label "bot:reviewing" --add-label "bot:needs-fix" 2>/dev/null
  gh pr comment "$PR_NUMBER" --repo "$REPO" --body "<!-- pr-automation-bot -->
## 合并前 Rebase 失败

Review 通过，但最终 rebase 时出现冲突。请手动解决后重新推送。" 2>/dev/null
  git checkout main 2>/dev/null || true
  echo "failed:final rebase conflict"
  exit 1
fi

git push --force-with-lease 2>/dev/null

# ─── Step 2: Wait for Full CI ───

echo "info:Waiting for full CI..."

if ! gh pr checks "$PR_NUMBER" --repo "$REPO" --watch --fail-fast 2>/dev/null; then
  FAILED=$(gh pr view "$PR_NUMBER" --repo "$REPO" --json statusCheckRollup \
    --jq '[.statusCheckRollup[] | select(.conclusion == "FAILURE") | .name] | join(", ")' 2>/dev/null || echo "unknown")

  gh pr edit "$PR_NUMBER" --repo "$REPO" --remove-label "bot:reviewing" --add-label "bot:needs-fix" 2>/dev/null
  gh pr comment "$PR_NUMBER" --repo "$REPO" --body "<!-- pr-automation-bot -->
## CI 全量检查未通过

Review 和 Fix 已完成，但最终 CI 检查失败：\`${FAILED}\`

请检查失败原因后重新推送。" 2>/dev/null
  git checkout main 2>/dev/null || true
  echo "failed:CI failed after review/fix — ${FAILED}"
  exit 1
fi

# ─── Step 3: Merge ───

echo "info:All CI passed, merging..."

if gh pr merge "$PR_NUMBER" --repo "$REPO" --rebase --delete-branch 2>/dev/null; then
  MERGE_METHOD="rebase"
elif gh pr merge "$PR_NUMBER" --repo "$REPO" --squash --delete-branch 2>/dev/null; then
  MERGE_METHOD="squash"
else
  gh pr edit "$PR_NUMBER" --repo "$REPO" --remove-label "bot:reviewing" 2>/dev/null
  git checkout main 2>/dev/null || true
  echo "failed:merge command failed"
  exit 1
fi

gh pr comment "$PR_NUMBER" --repo "$REPO" --body "<!-- pr-automation-bot -->
🤖 **PR Automation Complete**

| Field | Value |
|-------|-------|
| Merge method | ${MERGE_METHOD} |
| Merged at | $(date -u +%Y-%m-%dT%H:%M:%SZ) |

Pipeline: CI ✅ → Review ✅ → Merge ✅" 2>/dev/null

# ─── Step 4: Cleanup ───

gh pr edit "$PR_NUMBER" --repo "$REPO" --remove-label "bot:reviewing" --add-label "bot:done" 2>/dev/null || true
git checkout main 2>/dev/null && git pull origin main 2>/dev/null || true

echo "merged:${MERGE_METHOD}"
