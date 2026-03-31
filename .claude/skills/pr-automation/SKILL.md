---
name: pr-automation
description: |
  PR Automation Orchestrator: poll open PRs, check CI, run review, fix, and merge eligible PRs.
  Use when: (1) Invoked by daemon via scripts/pr-automation.sh, (2) User says "/pr-automation".
---

# PR Automation

Orchestrate the full PR automation lifecycle using a label-based state machine.
Each invocation performs at most one "heavy" action (review or fix), then exits.
Pure skips continue within the same session to find the next eligible PR.

**Announce at start:** "I'm using pr-automation skill to process PRs."

## Usage

```
/pr-automation
```

No arguments required. The daemon script `scripts/pr-automation.sh` manages the automation loop.

## Configuration

```
TRUSTED_CONTRIBUTORS_TEAM: detected from REPO org (e.g. iOfficeAI/trusted-contributors)
CRITICAL_PATH_PATTERN: env var, default in scripts/pr-automation.conf
LARGE_PR_FILE_THRESHOLD: env var (default: 50), also in scripts/pr-automation.conf
PR_DAYS_LOOKBACK: env var (default: 7), also in scripts/pr-automation.conf
```

**REPO** is detected automatically at runtime — do not hardcode it:

```bash
REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner')
ORG=$(echo "$REPO" | cut -d'/' -f1)
```

## Label State Machine

| Label                    | Meaning                                                                 | Terminal? |
| ------------------------ | ----------------------------------------------------------------------- | --------- |
| `bot:reviewing`          | Review in progress (mutex)                                              | No        |
| `bot:ready-to-fix`       | CONDITIONAL review done, waiting for bot to fix next session            | No        |
| `bot:fixing`             | Fix in progress (mutex)                                                 | No        |
| `bot:ci-waiting`         | CI failed and author notified — snoozed until author pushes new commits | No        |
| `bot:needs-human-review` | Blocking issues or unresolvable conflicts — human must intervene        | Yes       |
| `bot:ready-to-merge`     | Bot done, code is clean — human just needs to confirm and merge         | Yes       |
| `bot:done`               | Auto-merged by bot                                                      | Yes       |

## Exit Rules

- **Any substantive action** (approve workflow, post comment, run review, run fix) → EXIT after completing
- **Pure skip** (WIP, draft, terminal label, CI running, mergeability unknown, `bot:ci-waiting`) → continue to find next PR in same session

---

## Steps

### Step 1 — Fetch Candidate PRs

Read the lookback window from the environment (default 7 days):

```bash
DAYS=${PR_DAYS_LOOKBACK:-7}
gh pr list \
  --state open \
  --search "created:>=$(date -v-${DAYS}d '+%Y-%m-%d' 2>/dev/null || date -d "${DAYS} days ago" '+%Y-%m-%d') -is:draft" \
  --json number,title,labels,createdAt,author \
  --limit 50
```

Save the result as `candidate_prs`.

If `candidate_prs` is empty: log `[pr-automation] No open PRs found. Exiting.` then log `[pr-automation:exit] action=no_prs reason="no open PRs"` and EXIT.

### Step 2 — Get Trusted Contributors

```bash
gh api orgs/${ORG}/teams/trusted-contributors/members --jq '[.[].login]'
```

Save as `trusted_logins`. If API call fails, treat as empty array.

### Step 3 — Select Target PR

Sort `candidate_prs` using this **three-key** order:

1. **Primary**: has label `bot:ready-to-fix` → these PRs first
2. **Secondary**: author.login in `trusted_logins` → trusted PRs next
3. **Tertiary**: createdAt ascending (oldest first / FIFO)

Iterate through sorted list to find the **first eligible PR**.

**Skip conditions** (skip this PR, try next — stay in session):

| Condition                               | Check                                                                       |
| --------------------------------------- | --------------------------------------------------------------------------- |
| Title contains `WIP` (case-insensitive) | `title.toLowerCase().includes('wip')`                                       |
| Has label `bot:needs-human-review`      | check labels array                                                          |
| Has label `bot:ready-to-merge`          | check labels array                                                          |
| Has label `bot:done`                    | check labels array                                                          |
| Has label `bot:reviewing`               | check labels array                                                          |
| Has label `bot:fixing`                  | check labels array                                                          |
| Has label `bot:ci-waiting`              | check labels array — wake-up check runs as fallback if no eligible PR found |

**When eligible PR found:**

For **fresh PRs** (no bot: label): add `bot:reviewing` to claim it:

```bash
gh pr edit <PR_NUMBER> --add-label "bot:reviewing"
```

For **`bot:ready-to-fix` PRs**: swap label atomically:

```bash
gh pr edit <PR_NUMBER> --remove-label "bot:ready-to-fix" --add-label "bot:fixing"
```

Save this PR as `target_pr` (number, title, author.login, is_ready_to_fix).

**If no eligible PR found after full iteration:** run the ci-waiting wake-up check as a fallback before giving up.

**Fallback: Wake Up Snoozed PRs**

Fetch all open PRs with `bot:ci-waiting` and check if the author has pushed new commits since the last CI failure comment:

```bash
WAITING_PRS=$(gh pr list --state open --label "bot:ci-waiting" \
  --json number,createdAt,author --limit 50)
```

For each PR in `WAITING_PRS` (sorted by createdAt ascending, oldest first):

```bash
PR_NUMBER=<number>

LAST_CI_COMMENT_TIME=$(gh pr view $PR_NUMBER --json comments \
  --jq '[.comments[] | select(.body | test("<!-- pr-review-bot -->") and test("CI 检查未通过"))] | last | .createdAt // ""')

LATEST_COMMIT_TIME=$(gh pr view $PR_NUMBER --json commits \
  --jq '.commits | last | .committedDate')
```

If `LATEST_COMMIT_TIME > LAST_CI_COMMENT_TIME` (author pushed new commits since the CI failure comment):

```bash
gh pr edit $PR_NUMBER --remove-label "bot:ci-waiting" --add-label "bot:reviewing"
```

Log: `[pr-automation] PR #<PR_NUMBER> woke up from ci-waiting: new commits detected. Claiming as target.`

Save this PR as `target_pr` and **continue to Step 4** (treat it as a freshly claimed PR).

If no PRs were woken up: log `[pr-automation] No eligible PR found this round.` then log `[pr-automation:exit] action=no_eligible_pr reason="all PRs skipped, no ci-waiting PRs woken up"` and EXIT.

### Step 3b — Handle bot:ready-to-fix PR

Taken when selected PR had `bot:ready-to-fix` (CONDITIONAL review already done in a previous session).

**First: check for new commits since the review** (author may have pushed fixes):

```bash
LAST_REVIEW_TIME=$(gh pr view <PR_NUMBER> --json comments \
  --jq '[.comments[] | select(.body | startswith("<!-- pr-review-bot -->"))] | last | .createdAt // ""')

LATEST_COMMIT_TIME=$(gh pr view <PR_NUMBER> --json commits \
  --jq '.commits | last | .committedDate')
```

If `LATEST_COMMIT_TIME > LAST_REVIEW_TIME` (author pushed new commits since review):

```bash
gh pr edit <PR_NUMBER> --remove-label "bot:fixing"
```

Log: `[pr-automation] PR #<PR_NUMBER> has new commits since review — re-queuing for fresh review.`
Log: `[pr-automation:exit] action=requeue pr=#<PR_NUMBER> reason="new commits since review"`

**EXIT.** (PR re-enters normal queue with no bot: label → will be fully re-reviewed next round)

If no new commits, continue below.

**Re-check CI** (new commits may have been pushed since review):

```bash
gh pr view <PR_NUMBER> --json statusCheckRollup \
  --jq '.statusCheckRollup[] | {name: .name, status: .status, conclusion: .conclusion}'
```

Required jobs: `Code Quality`, `Unit Tests (ubuntu-latest)`, `Unit Tests (macos-14)`, `Unit Tests (windows-2022)`, `Coverage Test`, `i18n-check`

| Condition                                                          | Action                                                              |
| ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| All required jobs SUCCESS                                          | Continue to pr-fix below                                            |
| Any job QUEUED or IN_PROGRESS                                      | Remove `bot:fixing` → log "CI still running for PR #N" → EXIT       |
| Any **non-informational** job FAILURE or CANCELLED (excl. codecov) | Remove `bot:fixing` → log "CI failed for PR #N, re-queueing" → EXIT |

**Load the existing review report into the current session** (pr-fix requires it to be present):

```bash
gh pr view <PR_NUMBER> --json comments \
  --jq '.comments[] | select(.body | startswith("<!-- pr-review-bot -->")) | .body' \
  | tail -1
```

Output the fetched review report in the conversation so pr-fix can find it. If no review comment is found, abort:

```bash
gh pr edit <PR_NUMBER> --remove-label "bot:fixing" --add-label "bot:needs-human-review"
```

Log: `[pr-automation] PR #<PR_NUMBER> no review report found — cannot fix. Transferred to human review.`
Log: `[pr-automation:exit] action=needs_human pr=#<PR_NUMBER> reason="no review report found"`

**EXIT.**

**Run pr-fix:**

```
/pr-fix <PR_NUMBER> --automation
```

After pr-fix completes, check if pr-fix already handled everything (fork fallback path):

```bash
PR_STATE=$(gh pr view <PR_NUMBER> --json state --jq '.state')
```

If `PR_STATE` is `CLOSED` (pr-fix used fork fallback — closed the original PR and created a replacement):

Log: `[pr-automation] PR #<PR_NUMBER> fork fallback handled by pr-fix — original closed, replacement PR created.`
Log: `[pr-automation:exit] action=fork_fallback pr=#<PR_NUMBER> reason="pr-fix closed original and created replacement PR"`

**EXIT.**

Otherwise, **compute merge gate** (using remote refs — no checkout needed):

```bash
git fetch origin pull/${PR_NUMBER}/head
BASE_REF=$(gh pr view <PR_NUMBER> --json baseRefName --jq '.baseRefName')
FILES_CHANGED=$(git diff origin/${BASE_REF}...FETCH_HEAD --name-only | wc -l | tr -d ' ')
# CRITICAL_PATH_PATTERN: defined in Configuration section above
HAS_CRITICAL=false
CRITICAL_FILES=""
if [ -n "$CRITICAL_PATH_PATTERN" ]; then
  CRITICAL_FILES=$(git diff origin/${BASE_REF}...FETCH_HEAD --name-only | grep -E "$CRITICAL_PATH_PATTERN")
  [ -n "$CRITICAL_FILES" ] && HAS_CRITICAL=true
fi

if [ "$FILES_CHANGED" -gt 50 ] || [ "$HAS_CRITICAL" = "true" ]; then
  NEEDS_HUMAN_REVIEW=true
else
  NEEDS_HUMAN_REVIEW=false
fi
```

**If `NEEDS_HUMAN_REVIEW=true`**:

```bash
gh pr edit <PR_NUMBER> --remove-label "bot:fixing" --add-label "bot:ready-to-merge"
```

Log: `[pr-automation] PR #<PR_NUMBER> fix complete, large PR (files=${FILES_CHANGED}) — marked bot:ready-to-merge.`
Log: `[pr-automation:exit] action=ready_to_merge pr=#<PR_NUMBER> reason="large PR, needs human confirmation to merge"`

**EXIT.**

**If `NEEDS_HUMAN_REVIEW=false`**:

```bash
gh pr merge <PR_NUMBER> --squash --auto

# Verify merge was actually enabled or PR already merged
# GitHub mergeStateStatus can briefly be UNKNOWN right after CI completes — retry once
check_merge() {
  gh pr view <PR_NUMBER> --json state,autoMergeRequest \
    --jq '{state: .state, autoMerge: (.autoMergeRequest != null)}'
}

MERGE_CHECK=$(check_merge)
MERGE_STATE=$(echo "$MERGE_CHECK" | jq -r '.state')
AUTO_MERGE=$(echo "$MERGE_CHECK" | jq -r '.autoMerge')

if [ "$MERGE_STATE" != "MERGED" ] && [ "$AUTO_MERGE" != "true" ]; then
  # First check failed — wait 10s for GitHub state to stabilize, then retry once
  sleep 10
  gh pr merge <PR_NUMBER> --squash --auto
  MERGE_CHECK=$(check_merge)
  MERGE_STATE=$(echo "$MERGE_CHECK" | jq -r '.state')
  AUTO_MERGE=$(echo "$MERGE_CHECK" | jq -r '.autoMerge')
fi

if [ "$MERGE_STATE" = "MERGED" ] || [ "$AUTO_MERGE" = "true" ]; then
  gh pr edit <PR_NUMBER> --remove-label "bot:fixing" --add-label "bot:done"
else
  # Both attempts failed — fall back to human review
  gh pr edit <PR_NUMBER> --remove-label "bot:fixing" --add-label "bot:ready-to-merge"
  gh pr comment <PR_NUMBER> --body "<!-- pr-automation-bot -->
⚠️ 自动合并触发失败（auto-merge 未成功启用），已标记 bot:ready-to-merge，请人工确认后合并。"
fi
```

Log: `[pr-automation] PR #<PR_NUMBER> fix complete, auto-merge triggered.`
Log: `[pr-automation:exit] action=fixed pr=#<PR_NUMBER> reason="fix complete, auto-merge triggered"`

**EXIT.**

### Step 4 — Check CI Status

```bash
gh pr view <PR_NUMBER> --json statusCheckRollup \
  --jq '.statusCheckRollup[] | {name: .name, status: .status, conclusion: .conclusion}'
```

Required jobs: `Code Quality`, `Unit Tests (ubuntu-latest)`, `Unit Tests (macos-14)`, `Unit Tests (windows-2022)`, `Coverage Test`, `i18n-check`

| Condition                                                                                | Action                                                                                                                             |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| All required jobs SUCCESS **and** no non-informational jobs FAILURE/CANCELLED            | Continue to Step 4.5                                                                                                               |
| Any **required** job QUEUED or IN_PROGRESS                                               | Remove `bot:reviewing` → log `[pr-automation:skip] action=ci_running pr=#<PR_NUMBER> reason="CI still running"` → **find next PR** |
| `statusCheckRollup` empty (CI never triggered)                                           | Approve workflow (see below) → remove `bot:reviewing` → **EXIT**                                                                   |
| Any **non-informational** job (required or not) FAILURE or CANCELLED (excl. `codecov/*`) | Check dedup (see below) → **find next PR** or post comment → **EXIT**                                                              |

**Workflow approval** (CI never triggered):

Use the PR's head commit SHA to precisely find `action_required` runs for this PR
(avoids missing fork PRs that `gh run list` may not return in default pagination):

```bash
HEAD_SHA=$(gh pr view <PR_NUMBER> --json headRefOid --jq '.headRefOid')
RUN_IDS=$(gh api "repos/$REPO/actions/runs?head_sha=$HEAD_SHA&status=action_required" \
  --jq '.workflow_runs[].id')
for RUN_ID in $RUN_IDS; do
  gh run approve "$RUN_ID" --repo "$REPO"
done
```

Log: `[pr-automation] Approved workflow runs for PR #<PR_NUMBER>.`
Log: `[pr-automation:exit] action=workflow_approved pr=#<PR_NUMBER> reason="CI not triggered, approved workflow runs"`

Remove `bot:reviewing`:

```bash
gh pr edit <PR_NUMBER> --remove-label "bot:reviewing"
```

**EXIT.**

**CI failure dedup check:**

```bash
# Last CI failure bot comment time
LAST_CI_COMMENT_TIME=$(gh pr view <PR_NUMBER> --json comments \
  --jq '[.comments[] | select(.body | test("<!-- pr-review-bot -->") and test("CI 检查未通过"))] | last | .createdAt // ""')

# Latest commit time
LATEST_COMMIT_TIME=$(gh pr view <PR_NUMBER> --json commits \
  --jq '.commits | last | .committedDate')
```

- If `LAST_CI_COMMENT_TIME` is non-empty AND `LATEST_COMMIT_TIME <= LAST_CI_COMMENT_TIME`:
  No new commits since last CI failure comment — swap labels and find next PR:

  ```bash
  gh pr edit <PR_NUMBER> --remove-label "bot:reviewing" --add-label "bot:ci-waiting"
  ```

  Log `[pr-automation:skip] action=ci_failure_dedup pr=#<PR_NUMBER> reason="CI failed, no new commits since last comment"` → **find next PR**

- Otherwise: post CI failure comment below → log `[pr-automation:exit] action=ci_failed pr=#<PR_NUMBER> reason="CI failure, commented"` → remove `bot:reviewing` → **EXIT**

**CI failure comment:**

```bash
gh pr comment <PR_NUMBER> --body "<!-- pr-review-bot -->

## CI 检查未通过

以下 job 在本次自动化 review 时未通过，请修复：

| Job | 结论 |
|-----|------|
| <失败的 job 名称> | ❌ <FAILURE 或 CANCELLED> |

本次自动化 review 暂缓，待 CI 全部通过后将重新处理。"
```

### Step 4.5 — Resolve Merge Conflicts

```bash
gh pr view <PR_NUMBER> --json mergeable,mergeStateStatus,headRefName,baseRefName \
  --jq '{mergeable, mergeStateStatus, head: .headRefName, base: .baseRefName}'
```

| `mergeable`   | `mergeStateStatus` | Action                                                                                                                                                |
| ------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MERGEABLE`   | any                | Continue to Step 5                                                                                                                                    |
| `UNKNOWN`     | any                | Remove `bot:reviewing` → log `[pr-automation:skip] action=merge_unknown pr=#<PR_NUMBER> reason="mergeability unknown, will retry"` → **find next PR** |
| `CONFLICTING` | any                | Run conflict dedup check (see below)                                                                                                                  |

**Merge conflict dedup check:**

```bash
# Last conflict bot comment time
LAST_CONFLICT_COMMENT_TIME=$(gh pr view <PR_NUMBER> --json comments \
  --jq '[.comments[] | select(.body | test("<!-- pr-review-bot -->") and test("合并冲突"))] | last | .createdAt // ""')

LATEST_COMMIT_TIME=$(gh pr view <PR_NUMBER> --json commits \
  --jq '.commits | last | .committedDate')
```

- If `LAST_CONFLICT_COMMENT_TIME` is non-empty AND `LATEST_COMMIT_TIME <= LAST_CONFLICT_COMMENT_TIME`:
  No new commits — remove `bot:reviewing` → log `[pr-automation:skip] action=conflict_dedup pr=#<PR_NUMBER> reason="conflict already notified, no new commits"` → **find next PR** (no new action)

- Otherwise: attempt auto-rebase below.

**Auto-rebase attempt (in worktree):**

```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
WORKTREE_DIR="/tmp/aionui-pr-${PR_NUMBER}"

# Clean up any stale worktree
git worktree remove "$WORKTREE_DIR" --force 2>/dev/null || true

# Create worktree on the PR's head branch
git fetch origin <head_branch>
git worktree add "$WORKTREE_DIR" origin/<head_branch>

# Symlink node_modules so tsc/lint can run in the worktree
ln -s "$REPO_ROOT/node_modules" "$WORKTREE_DIR/node_modules"

cd "$WORKTREE_DIR"
git checkout <head_branch>
git rebase origin/<base_branch>
```

If rebase succeeds, run quality check:

```bash
cd "$WORKTREE_DIR"
bunx tsc --noEmit
bun run lint:fix
```

If quality check passes:

```bash
cd "$WORKTREE_DIR"
git push --force-with-lease origin <head_branch>
cd "$REPO_ROOT"
git worktree remove "$WORKTREE_DIR" --force 2>/dev/null || true
gh pr edit <PR_NUMBER> --remove-label "bot:reviewing"
```

Log: `[pr-automation] Resolved merge conflicts for PR #<PR_NUMBER>, pushed rebase.`

**EXIT** (CI re-triggers automatically).

**Fallback** — if rebase fails OR quality check fails:

```bash
cd "$REPO_ROOT"
git worktree remove "$WORKTREE_DIR" --force 2>/dev/null || true
```

Post comment:

```bash
gh pr comment <PR_NUMBER> --body "<!-- pr-review-bot -->

## 合并冲突（无法自动解决）

本 PR 与目标分支存在冲突，自动 rebase 未能干净解决。请手动 rebase 后重新 push：

\`\`\`bash
git fetch origin
git rebase origin/<base_branch>
# 解决冲突后
git push --force-with-lease
\`\`\`"
```

```bash
gh pr edit <PR_NUMBER> --remove-label "bot:reviewing" --add-label "bot:needs-human-review"
```

Log: `[pr-automation:exit] action=conflict_unresolved pr=#<PR_NUMBER> reason="merge conflict, needs human rebase"`

**EXIT.**

### Step 5 — Assess PR Scale and Critical Path

No checkout needed — use remote refs to check the diff:

```bash
git fetch origin pull/${PR_NUMBER}/head
BASE_REF=$(gh pr view <PR_NUMBER> --json baseRefName --jq '.baseRefName')

FILES_CHANGED=$(git diff origin/${BASE_REF}...FETCH_HEAD --name-only | wc -l | tr -d ' ')

# CRITICAL_PATH_PATTERN: defined in Configuration section above
CRITICAL_FILES=""
if [ -n "$CRITICAL_PATH_PATTERN" ]; then
  CRITICAL_FILES=$(git diff origin/${BASE_REF}...FETCH_HEAD --name-only \
    | grep -E "$CRITICAL_PATH_PATTERN")
  [ -n "$CRITICAL_FILES" ] && HAS_CRITICAL=true || HAS_CRITICAL=false
else
  HAS_CRITICAL=false
fi
```

Save `FILES_CHANGED`, `HAS_CRITICAL`, and `CRITICAL_FILES` for later steps.

### Step 6 — Run pr-review (automation mode)

**Before running a new review, check if a valid cached review already exists:**

```bash
LAST_REVIEW_TIME=$(gh pr view <PR_NUMBER> --json comments \
  --jq '[.comments[] | select(.body | startswith("<!-- pr-review-bot -->"))] | last | .createdAt // ""')

# Exclude update-branch merge commits — these are automatically generated by GitHub
# when the PR branch is synced with base (e.g. via the update-branch API), and do
# not represent new author code changes that would invalidate the cached review.
# Such commits always have a messageHeadline of the form:
#   "Merge branch '<base>' into <head>"
BASE_REF=$(gh pr view <PR_NUMBER> --json baseRefName --jq '.baseRefName')
LATEST_COMMIT_TIME=$(gh pr view <PR_NUMBER> --json commits | \
  jq --arg base "$BASE_REF" \
  '.commits | map(select(.messageHeadline | test("^Merge branch '\''" + $base + "'\'' into ") | not)) | last | .committedDate // (.commits | last | .committedDate)')
```

If `LAST_REVIEW_TIME` is non-empty AND `LATEST_COMMIT_TIME <= LAST_REVIEW_TIME`:

The existing review is still valid (no new commits since it was posted). Load the cached conclusion from the existing comment:

```bash
gh pr view <PR_NUMBER> --json comments \
  --jq '[.comments[] | select(.body | startswith("<!-- pr-review-bot -->"))] | last | .body'
```

Parse the `<!-- automation-result -->` block from the cached comment. Set `CONCLUSION`, `IS_CRITICAL_PATH`, and `CRITICAL_PATH_FILES` from it, then **skip to Step 7** (do not run pr-review again).

Log: `[pr-automation] PR #<PR_NUMBER> has valid cached review (no new commits since review) — skipping re-review.`

Otherwise (no existing review, or new commits have been pushed since the last review): run a fresh review:

```
/pr-review <PR_NUMBER> --automation
```

After pr-review completes, parse the `<!-- automation-result -->` block:

```
<!-- automation-result -->
CONCLUSION: APPROVED | CONDITIONAL | REJECTED | CI_FAILED | CI_NOT_READY
IS_CRITICAL_PATH: true | false
CRITICAL_PATH_FILES:
- file1
- file2
PR_NUMBER: <number>
<!-- /automation-result -->
```

When `IS_CRITICAL_PATH` is false, `CRITICAL_PATH_FILES` is `(none)`.

Save `CONCLUSION`, `IS_CRITICAL_PATH`, and `CRITICAL_PATH_FILES` (override Step 5 values if different).

If block is missing: set `CONCLUSION=REJECTED`, log the error, continue to Step 7.

**Compute merge gate:**

```
NEEDS_HUMAN_REVIEW = (FILES_CHANGED > 50) OR (IS_CRITICAL_PATH = true)
```

When `NEEDS_HUMAN_REVIEW=true`, route to human review regardless of CONCLUSION (except REJECTED, which already goes to human).

### Step 7 — Execute Decision Matrix

#### CONCLUSION = APPROVED

**If `NEEDS_HUMAN_REVIEW=true`** (large PR or critical path):

1. Post comment:

   When `IS_CRITICAL_PATH=true`, include the matched files in the comment:

   ```bash
   # Build critical path file list for the comment
   if [ -n "$CRITICAL_FILES" ]; then
     CRITICAL_LIST=$(echo "$CRITICAL_FILES" | sed 's/^/   - `/' | sed 's/$/`/')
     CRITICAL_SECTION="
   > 📂 **命中核心路径的文件：**
   ${CRITICAL_LIST}"
   else
     CRITICAL_SECTION=""
   fi

   gh pr comment <PR_NUMBER> --body "<!-- pr-automation-bot -->
   ✅ 已自动 review，代码无阻塞性问题。

   > ⚠️ **本 PR 规模较大（改动文件 ${FILES_CHANGED} 个）或涉及核心路径，请人工确认后合并。**${CRITICAL_SECTION}"
   ```

2. Update labels:
   ```bash
   gh pr edit <PR_NUMBER> --remove-label "bot:reviewing" --add-label "bot:ready-to-merge"
   ```
3. Log: `[pr-automation] PR #<PR_NUMBER> approved but large/critical (files=${FILES_CHANGED}), marked bot:ready-to-merge.`
4. Log: `[pr-automation:exit] action=ready_to_merge pr=#<PR_NUMBER> reason="large PR or critical path, needs human confirmation"`
5. **EXIT.**

**If `NEEDS_HUMAN_REVIEW=false`**:

1. Post comment:
   ```bash
   gh pr comment <PR_NUMBER> --body "<!-- pr-automation-bot -->
   ✅ 已自动 review，无阻塞性问题，正在触发自动合并。"
   ```
2. Trigger auto-merge and verify:

   ```bash
   gh pr merge <PR_NUMBER> --squash --auto

   # Verify merge was actually enabled or PR already merged
   # GitHub mergeStateStatus can briefly be UNKNOWN right after CI completes — retry once
   check_merge() {
     gh pr view <PR_NUMBER> --json state,autoMergeRequest \
       --jq '{state: .state, autoMerge: (.autoMergeRequest != null)}'
   }

   MERGE_CHECK=$(check_merge)
   MERGE_STATE=$(echo "$MERGE_CHECK" | jq -r '.state')
   AUTO_MERGE=$(echo "$MERGE_CHECK" | jq -r '.autoMerge')

   if [ "$MERGE_STATE" != "MERGED" ] && [ "$AUTO_MERGE" != "true" ]; then
     # First check failed — wait 5s for GitHub state to stabilize, then retry once
     sleep 10
     gh pr merge <PR_NUMBER> --squash --auto
     MERGE_CHECK=$(check_merge)
     MERGE_STATE=$(echo "$MERGE_CHECK" | jq -r '.state')
     AUTO_MERGE=$(echo "$MERGE_CHECK" | jq -r '.autoMerge')
   fi

   if [ "$MERGE_STATE" = "MERGED" ] || [ "$AUTO_MERGE" = "true" ]; then
     gh pr edit <PR_NUMBER> --remove-label "bot:reviewing" --add-label "bot:done"
   else
     # Both attempts failed — fall back to human review
     gh pr edit <PR_NUMBER> --remove-label "bot:reviewing" --add-label "bot:ready-to-merge"
     gh pr comment <PR_NUMBER> --body "<!-- pr-automation-bot -->
   ⚠️ 自动合并触发失败（auto-merge 未成功启用），已标记 bot:ready-to-merge，请人工确认后合并。"
   fi
   ```

3. Log: `[pr-automation] PR #<PR_NUMBER> approved, auto-merge triggered.`
4. Log: `[pr-automation:exit] action=approved pr=#<PR_NUMBER> reason="review passed, auto-merge triggered"`
5. **EXIT.**

#### CONCLUSION = CONDITIONAL

1. Update labels (defer pr-fix to next session):
   ```bash
   gh pr edit <PR_NUMBER> --remove-label "bot:reviewing" --add-label "bot:ready-to-fix"
   ```
2. Log: `[pr-automation] PR #<PR_NUMBER> CONDITIONAL — marked bot:ready-to-fix for next session.`
3. Log: `[pr-automation:exit] action=conditional pr=#<PR_NUMBER> reason="review conditional, deferred fix to next session"`
4. **EXIT.**

#### CONCLUSION = REJECTED

1. Post comment:
   ```bash
   gh pr comment <PR_NUMBER> --body "<!-- pr-automation-bot -->
   ❌ 本 PR 存在阻塞性问题，无法自动处理，已转交人工 review。详见上方 review 报告。"
   ```
2. Update labels:
   ```bash
   gh pr edit <PR_NUMBER> --remove-label "bot:reviewing" --add-label "bot:needs-human-review"
   ```
3. Log: `[pr-automation] PR #<PR_NUMBER> rejected, transferred to human review.`
4. Log: `[pr-automation:exit] action=rejected pr=#<PR_NUMBER> reason="blocking issues, transferred to human review"`
5. **EXIT.**

#### CONCLUSION = CI_FAILED or CI_NOT_READY

Safety fallback (Step 4 should have caught these):

1. Remove `bot:reviewing`:
   ```bash
   gh pr edit <PR_NUMBER> --remove-label "bot:reviewing"
   ```
2. Log: `[pr-automation] PR #<PR_NUMBER> CI not ready at pr-review stage. Skipping.`
3. Log: `[pr-automation:exit] action=ci_not_ready pr=#<PR_NUMBER> reason="CI not ready at review stage"`
4. **EXIT.**

---

## Mandatory Rules

- **Single heavy action per session** — review OR fix, then EXIT
- **bot:reviewing / bot:fixing are mutexes** — always set immediately when claiming a PR
- **Clean up on skip** — whenever skipping a PR mid-flow, always remove `bot:reviewing` first
- **No AI signature** — no `Co-Authored-By`, no `Generated with` in any comment or commit
- **Label atomicity** — when swapping labels, do both in a single `gh pr edit` call
- **Comment dedup** — always check for existing bot comment before posting CI failure or conflict comments
