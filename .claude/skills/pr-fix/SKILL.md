---
name: pr-fix
description: |
  PR Review Fix: automatically fix all issues identified in a pr-review report.
  Use when: (1) User says "fix all review issues", (2) User says "/pr-fix",
  (3) After pr-review skill has produced a report, (4) User wants to address PR review feedback.
---

# PR Review Fix Skill

Automated workflow to resolve all issues surfaced in a pr-review report — parse summary → detect PR status → create fix branch or checkout original branch → fix by priority → quality gate → commit → publish → verify.

**Announce at start:** "I'm using pr-fix skill to fix all review issues."

## Usage

```
/pr-fix [pr_number]
```

`pr_number` is optional. The skill requires a pr-review report to be present in the current session.

---

## Mode Detection

At the very start of execution, check `$ARGUMENTS` for the `--automation` flag:

```bash
# $ARGUMENTS example: "123 --automation" or "123"
AUTOMATION_MODE=false
if echo "$ARGUMENTS" | grep -q -- '--automation'; then
  AUTOMATION_MODE=true
fi
```

In **automation mode**:

- Skip all yes/no confirmation prompts — follow the default best path

---

## Steps

### Step 0 — Locate the Review Report

The pr-review skill must have been executed in the current session. The review report (containing a "汇总" table) must be present in the conversation.

If no review report is found in the current session, abort immediately with:

> No pr-review report found in this session. Please run `/pr-review <pr_number>` first.

Extract the PR number from the report header:

```
## Code Review：<PR 标题> (#<PR_NUMBER>)
```

If `pr_number` is provided as an argument, use it to override the extracted number.

---

### Step 1 — Parse the Summary Table

Locate the **汇总** section in the review report:

```markdown
| #   | 严重级别    | 文件        | 问题 |
| --- | ----------- | ----------- | ---- |
| 1   | 🔴 CRITICAL | `file.ts:N` | ...  |
```

Build an ordered issue list, grouped by severity:

| Priority | Severity | Emoji |
| -------- | -------- | ----- |
| 1        | CRITICAL | 🔴    |
| 2        | HIGH     | 🟠    |
| 3        | MEDIUM   | 🟡    |
| 4        | LOW      | 🔵    |

If the 汇总 table is empty, abort with:

> No issues found in the review summary. Nothing to fix.

**LOW issues:** Skip — do not fix.

After filtering out LOW issues, if no CRITICAL / HIGH / MEDIUM issues remain, abort with:

> All issues are LOW severity — nothing actionable to fix. (pr-fix only addresses CRITICAL, HIGH, and MEDIUM issues)

This guard prevents running the full workflow (checkout, quality gate, commit) with no changes to make.

---

### Step 2 — Pre-flight Checks

```bash
gh pr view <PR_NUMBER> \
  --json headRefName,baseRefName,state,isCrossRepository,maintainerCanModify,headRepositoryOwner \
  --jq '{head: .headRefName, base: .baseRefName, state: .state, isFork: .isCrossRepository, canModify: .maintainerCanModify, forkOwner: .headRepositoryOwner.login}'
```

Save `<head_branch>`, `<base_branch>`, `<state>`, `<IS_FORK>`, `<CAN_MODIFY>`, and `<FORK_OWNER>` for later steps.

**Determine path based on results:**

| state    | IS_FORK | CAN_MODIFY | Path                                           |
| -------- | ------- | ---------- | ---------------------------------------------- |
| `MERGED` | any     | any        | Abort — nothing to fix                         |
| `OPEN`   | `false` | any        | Same-repo — push to original branch            |
| `OPEN`   | `true`  | `true`     | Fork — push to fork branch via gh checkout     |
| `OPEN`   | `true`  | `false`    | Fork fallback — create fix branch on main repo |

If state is `MERGED`: abort with:

> PR #<PR_NUMBER> has already been merged. Nothing to fix.

If `IS_FORK=true` AND `CAN_MODIFY=false`: set `FORK_FALLBACK=true` and continue.
In this path (Step 3 onwards), fixes are applied on a new branch in the main repo instead of the fork.
Save `FIX_BRANCH=bot/fix-pr-<PR_NUMBER>` for use in Step 3 and Step 7.

---

### Step 3 — Create Worktree and Prepare Branch

Create an isolated worktree for this PR fix. The main repo stays on its current branch.

```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
PR_NUMBER=<PR_NUMBER>
WORKTREE_DIR="/tmp/aionui-pr-${PR_NUMBER}"

# Clean up any stale worktree from a previous crash
git worktree remove "$WORKTREE_DIR" --force 2>/dev/null || true
```

**Same-repo PR (`IS_FORK=false`):**

```bash
git fetch origin <head_branch>
git worktree add "$WORKTREE_DIR" origin/<head_branch>
cd "$WORKTREE_DIR"
git checkout <head_branch>
```

**Fork PR with maintainer access (`IS_FORK=true`, `CAN_MODIFY=true`):**

```bash
git worktree add "$WORKTREE_DIR" --detach
cd "$WORKTREE_DIR"
gh pr checkout <PR_NUMBER>
```

`gh pr checkout` inside the worktree sets up the fork remote and branch tracking correctly.

**Fork PR without maintainer access (`FORK_FALLBACK=true`):**

```bash
git fetch origin <base_branch>
git worktree add "$WORKTREE_DIR" -b bot/fix-pr-<PR_NUMBER> origin/<base_branch>
cd "$WORKTREE_DIR"
# Merge PR's commits into the fix branch
gh pr checkout <PR_NUMBER> --detach
git checkout bot/fix-pr-<PR_NUMBER>
git merge --no-ff --no-edit FETCH_HEAD
```

After creating the worktree (all three paths), symlink `node_modules` so lint/tsc/test can run:

```bash
ln -s "$REPO_ROOT/node_modules" "$WORKTREE_DIR/node_modules"
```

Save `REPO_ROOT` and `WORKTREE_DIR` for later steps. All file reads, edits, lint, and test commands from this point forward run inside `WORKTREE_DIR`.

---

### Step 4 — Fix Issues by Priority

All file operations in this step use worktree paths. The Read tool should target `$WORKTREE_DIR/<relative_path>`, and the Edit tool should modify files at the same worktree paths.

Process issues CRITICAL → HIGH → MEDIUM only. Skip LOW. For each issue:

1. Read the target file (use Read tool at the file path from the summary table)
2. Locate the exact problem — match the review report's quoted code and line number
3. Apply the fix described in the review report's "修复建议" section
4. After fixing each file batch, run a quick type check:

```bash
bunx tsc --noEmit
```

Resolve any type errors before moving to the next issue.

**Batching:** Group issues in the same file into a single pass.

---

### Step 5 — Full Quality Gate

All commands run inside the worktree (`$WORKTREE_DIR`):

```bash
bun run lint:fix
bun run format
bunx tsc --noEmit
bun run test
```

**All four must pass.** Fix any failures caused by the current changes before proceeding.

---

### Step 6 — Commit

Follow the [commit skill](../commit/SKILL.md) workflow. Commit message **must** reference the original PR:

```
fix(<scope>): address review issues from PR #<PR_NUMBER>

- Fix <CRITICAL/HIGH issue 1 description>
- Fix <issue 2 description>
- ...

Review follow-up for #<PR_NUMBER>
```

---

### Step 7 — Publish

**Same-repo PR (`IS_FORK=false`):**

```bash
cd "$WORKTREE_DIR"
git push origin <head_branch>
```

**Fork PR with maintainer access (`IS_FORK=true`, `CAN_MODIFY=true`):**

```bash
cd "$WORKTREE_DIR"
git push <FORK_OWNER> HEAD:<head_branch>
```

`gh pr checkout` set up `<FORK_OWNER>` as the remote pointing to the fork. Pushing with `HEAD:<head_branch>` ensures the commit lands on the fork's branch, which is the PR's actual head.

Output to user:

> 已推送到 `<head_branch>`，PR #<PR_NUMBER> 已自动更新。无需创建新 PR。

**Fork PR without maintainer access (`FORK_FALLBACK=true`):**

Push the fix branch to the main repo and open a new PR:

```bash
cd "$WORKTREE_DIR"
git push origin bot/fix-pr-<PR_NUMBER>
```

Then open a new PR and immediately enable auto-merge:

```bash
NEW_PR_URL=$(gh pr create \
  --base <BASE_REF> \
  --head bot/fix-pr-<PR_NUMBER> \
  --label "bot:done" \
  --title "fix: address review issues from fork PR #<PR_NUMBER>" \
  --body "$(cat <<'EOF'
This PR applies fixes identified during review of #<PR_NUMBER>.

The original fork PR has no maintainer push access, so fixes are applied here as a follow-up.
Local quality gate (lint/test/tsc) already passed — auto-merging once CI is green.

Closes #<PR_NUMBER>
EOF
)")

NEW_PR_NUMBER=$(echo "$NEW_PR_URL" | grep -o '[0-9]*$')
gh pr merge "$NEW_PR_NUMBER" --squash --auto

# Close original fork PR immediately with a comment (don't wait for Closes #N)
gh pr close <PR_NUMBER> --comment "<!-- pr-fix-verification -->
原 PR 为 fork 且未开启 maintainer 写入权限，无法直接推送修复。
已在主仓库创建跟进 PR #${NEW_PR_NUMBER}，包含本次 review 的所有修复，CI 通过后将自动合并。"
```

Closing immediately ensures pr-automation won't pick up the original PR in the next round (closed PRs are excluded by `--state open` in Step 1). No need to set `bot:done` label since the PR is closed.

Output to user:

> Fork PR 无 maintainer 写入权限，已在主仓库创建跟进 PR #<NEW_PR_NUMBER>，CI 通过后自动合并。

---

### Step 8 — Verification Report

For each issue in the original summary table, verify the fix exists in actual code:

1. Read the relevant file (Read tool)
2. Grep for the original problematic pattern to confirm it is gone
3. Confirm the corrected code is in place

Post the verification report as a PR comment AND output it in the conversation:

```bash
gh pr comment <PR_NUMBER> --body "$(cat <<'EOF'
<!-- pr-fix-verification -->
## PR Fix 验证报告

**原始 PR:** #<PR_NUMBER>
**修复方式:** 直接推送到 `<head_branch>`

| # | 严重级别 | 文件 | 问题 | 修复方式 | 状态 |
|---|---------|------|------|---------|------|
| 1 | 🔴 CRITICAL | `file.ts:N` | <原始问题> | <修复措施> | ✅ 已修复 |
| 2 | 🟠 HIGH     | `file.ts:N` | <原始问题> | <修复措施> | ✅ 已修复 |

**总结：** ✅ 已修复 N 个 | ❌ 未能修复 N 个

> 🔵 LOW 级别问题已跳过（不阻塞合并，修复优先级低）。
EOF
)"
```

After posting, output the same verification table in the conversation for immediate review.

---

### Step 9 — Cleanup

Remove the worktree. The main repo was never touched.

```bash
cd "$REPO_ROOT"
git worktree remove "$WORKTREE_DIR" --force 2>/dev/null || true
```

---

## Mandatory Rules

- **No AI signature** — no `Co-Authored-By`, `Generated with`, or any AI byline
- **Always reference original PR** — every commit and PR body must include `Review follow-up for #<PR_NUMBER>`
- **No issue creation** — this skill skips the issue-association step in pr skill
- **Fix, don't workaround** — no `// @ts-ignore`, no lint suppression; address the root cause

---

## Quick Reference

```
0. Require pr-review report in current session — abort if not found
1. Parse summary table → ordered issue list
2. Pre-flight: fetch PR info (state, isCrossRepository, maintainerCanModify, forkOwner)
   → ABORT: state=MERGED
3. Create worktree at /tmp/aionui-pr-<PR_NUMBER>:
   → same-repo:        git fetch + git worktree add + checkout <head_branch>
   → fork+canModify:   git worktree add --detach + gh pr checkout <PR_NUMBER>
   → fork+fallback:    git worktree add -b bot/fix-pr-N + merge fork head
4. Fix issues CRITICAL→HIGH→MEDIUM only (skip LOW); bunx tsc --noEmit after each file batch
5. bun run lint:fix && bun run format && bunx tsc --noEmit && bun run test (in worktree)
6. Commit: fix(<scope>): address review issues from PR #N
7. Push from worktree (same-repo / fork+canModify / fork+fallback)
8. Verify → post as gh pr comment PR_NUMBER + output in conversation
9. Cleanup: git worktree remove /tmp/aionui-pr-<PR_NUMBER>
```
