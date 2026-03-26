#!/usr/bin/env bash
# PR Auto-Merge: Post-review phase
# Handles: final rebase, CI wait, merge, cleanup
#
# Usage: ./scripts/pr-auto-merge-postmerge.sh <pr_number> [review_result]
#   review_result: "approve" (default) | "reject" | "changes_requested"
# Exit codes:
#   0 = merged successfully
#   1 = failed (reason printed to stdout)

set -euo pipefail

PR_NUMBER="${1:?Usage: $0 <pr_number> [review_result]}"
REVIEW_RESULT="${2:-approve}"
REPO="${REPO:-iOfficeAI/AionUi}"

# ─── If review rejected, just cleanup ───

if [ "$REVIEW_RESULT" != "approve" ]; then
  # Labels already set by agent (bot:needs-fix or bot:needs-human-review)
  # Just remove the reviewing lock if still present
  gh pr edit "$PR_NUMBER" --repo "$REPO" --remove-label "bot:reviewing" 2>/dev/null || true
  git checkout main 2>/dev/null && git pull origin main 2>/dev/null || true
  echo "aborted:review result is ${REVIEW_RESULT}"
  exit 1
fi

# ─── Step 8: Final Rebase ───

PR_META=$(gh pr view "$PR_NUMBER" --repo "$REPO" \
  --json headRefName,baseRefName --jq '{head: .headRefName, base: .baseRefName}' 2>/dev/null)
BASE_BRANCH=$(echo "$PR_META" | jq -r '.base')

git fetch origin "$BASE_BRANCH" 2>/dev/null

if ! git rebase "origin/$BASE_BRANCH" 2>/dev/null; then
  git rebase --abort 2>/dev/null || true
  gh pr edit "$PR_NUMBER" --repo "$REPO" --remove-label "bot:reviewing" --add-label "bot:needs-fix" 2>/dev/null
  gh pr comment "$PR_NUMBER" --repo "$REPO" --body "<!-- pr-review-bot -->
## 合并前 Rebase 失败

Review 通过，但最终 rebase 时出现冲突。请手动解决后重新推送。" 2>/dev/null
  git checkout main 2>/dev/null || true
  echo "failed:final rebase conflict"
  exit 1
fi

git push --force-with-lease 2>/dev/null

# ─── Step 9: Wait for Full CI (including build) ───

echo "info:Waiting for full CI (including build)..."

# gh pr checks --watch waits for all checks to complete
if ! gh pr checks "$PR_NUMBER" --repo "$REPO" --watch --fail-fast 2>/dev/null; then
  # Check which jobs failed
  FAILED=$(gh pr view "$PR_NUMBER" --repo "$REPO" --json statusCheckRollup \
    --jq '[.statusCheckRollup[] | select(.conclusion == "FAILURE") | .name] | join(", ")' 2>/dev/null || echo "unknown")

  gh pr edit "$PR_NUMBER" --repo "$REPO" --remove-label "bot:reviewing" --add-label "bot:needs-fix" 2>/dev/null
  gh pr comment "$PR_NUMBER" --repo "$REPO" --body "<!-- pr-review-bot -->
## CI 全量检查未通过

Review 和 Fix 已完成，但最终 CI 检查失败：\`${FAILED}\`

请检查失败原因后重新推送。" 2>/dev/null
  git checkout main 2>/dev/null || true
  echo "failed:CI failed after fix — ${FAILED}"
  exit 1
fi

# ─── Step 10: Merge ───

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

# Post merge summary
gh pr comment "$PR_NUMBER" --repo "$REPO" --body "<!-- ai-merge-summary -->
🤖 **AI Auto-Merge Complete**

| Field | Value |
|-------|-------|
| Merge method | ${MERGE_METHOD} |
| Merged at | $(date -u +%Y-%m-%dT%H:%M:%SZ) |

Pipeline: CI ✅ → Review ✅ → Merge ✅" 2>/dev/null

# ─── Step 12: Cleanup ───

gh pr edit "$PR_NUMBER" --repo "$REPO" --remove-label "bot:reviewing" --add-label "bot:done" 2>/dev/null || true
git checkout main 2>/dev/null && git pull origin main 2>/dev/null || true

echo "merged:${MERGE_METHOD}"
