---
name: pr-ship
description: |
  End-to-end PR lifecycle: create PR, wait for CI, review, fix issues, merge — all in one invocation.
  Use when: (1) User says "/pr-ship", (2) User wants to ship current changes as a complete PR lifecycle,
  (3) User wants to resume shepherding an existing PR.
---

# PR Ship

End-to-end PR lifecycle shepherd: create PR → wait for CI → review → fix → merge. Single invocation, single PR.

**Announce at start:** "Using pr-ship skill to shepherd this PR from creation to merge."

## Usage

```
/pr-ship [pr_number] [--no-auto-merge]
```

| Parameter         | Default | Description                                                  |
| ----------------- | ------- | ------------------------------------------------------------ |
| `pr_number`       | none    | Resume from an existing PR (skip creation)                   |
| `--no-auto-merge` | off     | Require user confirmation before merge instead of auto-merge |

## Session State

Track these values in conversation context throughout the session:

- `PR_NUMBER` — current PR number
- `PHASE` — current phase (create / ci-wait / review / fix / merge)
- `RETRY_COUNT` — CI failure + review fix retry counter (max 3, shared), initialized to 0
- `AUTO_MERGE` — true unless `--no-auto-merge` is passed
- `EMPTY_CI_COUNT` — consecutive empty CI check counter (max 3), initialized to 0

---

## Phase 0 — Create PR

**Skip if `pr_number` is provided.** When skipping, set `PR_NUMBER` from the argument and jump to Phase 1.

**Parse arguments:**

```bash
# Detect --no-auto-merge flag
AUTO_MERGE=true
if echo "$ARGUMENTS" | grep -q -- '--no-auto-merge'; then
  AUTO_MERGE=false
fi

# Detect pr_number (first numeric argument)
PR_NUMBER=$(echo "$ARGUMENTS" | grep -oE '[0-9]+' | head -1)
```

**If `PR_NUMBER` is set:** set `RETRY_COUNT = 0`, `EMPTY_CI_COUNT = 0`, skip to Phase 1.

**If `PR_NUMBER` is not set:** invoke oss-pr to create the PR:

```
/oss-pr
```

After oss-pr completes, extract `PR_NUMBER` from the PR URL in its output. Set `RETRY_COUNT = 0`, `EMPTY_CI_COUNT = 0`.

---

## Phase 1 — CI Wait

Check CI status:

```bash
gh pr view $PR_NUMBER --json statusCheckRollup \
  --jq '.statusCheckRollup[] | {name: .name, status: .status, conclusion: .conclusion}'
```

**Required jobs** (same list as pr-review):

- `Code Quality`
- `Unit Tests (ubuntu-latest)`
- `Unit Tests (macos-14)`
- `Unit Tests (windows-2022)`
- `Coverage Test`
- `i18n-check`

**Informational exclusions:** `codecov/patch` and `codecov/project` — always excluded from failure checks.

### Decision Matrix

| CI Status                                                | Action                                            |
| -------------------------------------------------------- | ------------------------------------------------- |
| All required jobs SUCCESS, no non-informational failures | → Phase 2                                         |
| Any required job QUEUED or IN_PROGRESS                   | ScheduleWakeup 270s, re-check                     |
| `statusCheckRollup` empty (CI never triggered)           | Approve workflow (see below), ScheduleWakeup 270s |
| Any non-informational job FAILURE or CANCELLED           | → CI Failure Handler                              |

### Workflow Approval (CI not triggered)

```bash
HEAD_SHA=$(gh pr view $PR_NUMBER --json headRefOid --jq '.headRefOid')
REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner')
RUN_IDS=$(gh api "repos/$REPO/actions/runs?head_sha=$HEAD_SHA&status=action_required" \
  --jq '.workflow_runs[].id')
for RUN_ID in $RUN_IDS; do
  gh run approve "$RUN_ID" --repo "$REPO"
done
```

Then `EMPTY_CI_COUNT++` and ScheduleWakeup 270s to re-check. If `EMPTY_CI_COUNT >= 3` (~13.5 minutes), abort:

> CI 持续未触发（已等待约 13.5 分钟）。请检查仓库 CI 配置后重新调用 `/pr-ship $PR_NUMBER`。

### CI Failure Handler

**Step 1 — Check retry budget:**

If `RETRY_COUNT >= 3`:

> 已达到最大重试次数 (3/3)。请手动检查 PR #$PR_NUMBER 后重新调用 `/pr-ship $PR_NUMBER`。

Exit.

**Step 2 — Identify failures:**

```bash
# Get failed job names
FAILED_JOBS=$(gh pr view $PR_NUMBER --json statusCheckRollup \
  --jq '[.statusCheckRollup[] | select(.conclusion == "FAILURE" or .conclusion == "CANCELLED") | select(.name | test("^codecov/") | not) | .name] | join(", ")')
```

Report to user:

> CI 失败：$FAILED_JOBS。正在尝试修复 ($RETRY_COUNT/3)...

**Step 3 — Fetch failure details:**

```bash
REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner')

# Find the failed run IDs
HEAD_SHA=$(gh pr view $PR_NUMBER --json headRefOid --jq '.headRefOid')
FAILED_RUN_IDS=$(gh api "repos/$REPO/actions/runs?head_sha=$HEAD_SHA&status=failure" \
  --jq '.workflow_runs[].id')

# Get logs for each failed run
for RUN_ID in $FAILED_RUN_IDS; do
  gh run view "$RUN_ID" --repo "$REPO" --log-failed 2>/dev/null | tail -100
done
```

**Step 4 — Fix in worktree:**

```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
WORKTREE_DIR="/tmp/aionui-ship-${PR_NUMBER}"
HEAD_BRANCH=$(gh pr view $PR_NUMBER --json headRefName --jq '.headRefName')

# Clean up stale worktree
git worktree remove "$WORKTREE_DIR" --force 2>/dev/null || true

# Create worktree
git fetch origin "$HEAD_BRANCH"
git worktree add "$WORKTREE_DIR" "origin/$HEAD_BRANCH" --detach

# Symlink node_modules
ln -s "$REPO_ROOT/node_modules" "$WORKTREE_DIR/node_modules"
```

Fix only CI-reported errors (lint errors, type errors, test failures) in the worktree. No refactoring, no scope expansion.

After fixing, run local quality gate:

```bash
cd "$WORKTREE_DIR"
bun run lint:fix
bun run format
bunx tsc --noEmit
bun run test
```

**Step 5 — Commit and push:**

```bash
cd "$WORKTREE_DIR"
git add -u
git commit -m "fix(<scope>): resolve CI failures"
git push origin HEAD:$HEAD_BRANCH
```

**No AI signature in commits.**

**Step 6 — Cleanup worktree:**

```bash
cd "$REPO_ROOT"
git worktree remove "$WORKTREE_DIR" --force 2>/dev/null || true
```

**Step 7 — Increment and loop:**

`RETRY_COUNT++`. ScheduleWakeup 270s → re-enter Phase 1.

---

## Phase 2 — Review

Invoke pr-review in interactive mode, passing the PR number explicitly:

```
/pr-review $PR_NUMBER
```

(No `--automation` flag — this is an interactive session.)

### Decision based on review conclusion

| Review Conclusion                | Action                                            |
| -------------------------------- | ------------------------------------------------- |
| ✅ APPROVED (including LOW-only) | → Phase 4                                         |
| ⚠️ CONDITIONAL                   | → Phase 3                                         |
| ❌ REJECTED                      | → Phase 3 (pr-fix triage decides if auto-fixable) |

---

## Phase 3 — Fix

**Check retry budget first:**

If `RETRY_COUNT >= 3`:

> 已达到最大重试次数 (3/3)。请手动检查 PR #$PR_NUMBER 后重新调用 `/pr-ship $PR_NUMBER`。

Exit.

Invoke pr-fix in interactive mode, passing the PR number explicitly:

```
/pr-fix $PR_NUMBER
```

(No `--automation` flag.)

### After pr-fix completes

**Fix pushed successfully:** `RETRY_COUNT++`. ScheduleWakeup 270s → back to Phase 1 (wait for CI on new commit).

**Fix aborted** (all issues dismissed, or user rejected CRITICAL dismissal):

> pr-fix 未产生修复。是否继续看护此 PR？(yes/no)

- **yes** → back to Phase 1 (CI may already be passing)
- **no** → exit, output PR URL for manual handling

---

## Phase 4 — Merge

### AUTO_MERGE = true (default)

```bash
gh pr merge $PR_NUMBER --squash --auto
```

Output:

> ✅ PR #$PR_NUMBER 已设置 auto-merge，CI 通过后将自动合并。

### AUTO_MERGE = false (--no-auto-merge)

Display summary:

```
=== PR #$PR_NUMBER 就绪 ===

标题: <title>
变更: +<additions> / -<deletions> (<file_count> files)
Review: <conclusion>
CI: 全部通过

输入 merge 确认合并，或 abort 放弃。
```

Fetch summary data:

```bash
gh pr view $PR_NUMBER --json title,additions,deletions,changedFiles \
  --jq '{title: .title, additions: .additions, deletions: .deletions, files: .changedFiles}'
```

- User says **merge** → `gh pr merge $PR_NUMBER --squash` → output `✅ PR #$PR_NUMBER 已合并。`
- User says **abort** → exit, output PR URL

---

## ScheduleWakeup Integration

This skill uses `/loop` dynamic mode for CI waiting. Each ScheduleWakeup call:

```
ScheduleWakeup(
  delaySeconds: 270,
  reason: "waiting for CI on PR #$PR_NUMBER (check N)",
  prompt: "/pr-ship $PR_NUMBER"
)
```

**Interval:** 270s uniformly (under 5-min prompt cache TTL).

**When to call ScheduleWakeup:**

- CI is still running (QUEUED/IN_PROGRESS)
- Just approved a workflow run
- Just pushed a CI fix
- Just pushed a pr-fix commit

**When NOT to call ScheduleWakeup:**

- CI has completed (pass or fail with actionable errors)
- During review (Phase 2) or fix (Phase 3) execution
- After merge (Phase 4)

---

## Mandatory Rules

- **No AI signature** — no `Co-Authored-By`, no `Generated with` in any commit or comment
- **Retry limit = 3** — hard cap, shared between CI fixes and review fixes
- **Fix scope discipline** — CI fixes target only CI-reported errors; review fixes go through pr-fix
- **No label pollution** — pr-ship does not set any `bot:*` labels
- **ScheduleWakeup only for CI wait** — never during review or fix execution
- **REPO detection at runtime** — `gh repo view --json nameWithOwner --jq '.nameWithOwner'`
- **Worktree path** — always `/tmp/aionui-ship-<PR_NUMBER>` (distinct from pr-automation's `/tmp/aionui-pr-*` and pr-verify's `/tmp/aionui-verify-*`)
- **Worktree cleanup** — always remove worktree after CI fix, even on failure

## Quick Reference

```
0. Parse args: pr_number? --no-auto-merge?
1. Phase 0: /oss-pr (skip if pr_number given)
2. Phase 1: CI wait loop
   - check statusCheckRollup
   - passing -> Phase 2
   - running -> ScheduleWakeup 270s
   - not triggered -> approve workflow + ScheduleWakeup 270s
   - failed -> retry_count < 3? fix + push + ScheduleWakeup 270s : abort
3. Phase 2: /pr-review (interactive)
   - APPROVED -> Phase 4
   - CONDITIONAL/REJECTED -> Phase 3
4. Phase 3: /pr-fix (interactive)
   - pushed -> retry_count++, back to Phase 1
   - aborted -> ask user
5. Phase 4: merge
   - default: gh pr merge --squash --auto
   - --no-auto-merge: confirm then gh pr merge --squash
```
