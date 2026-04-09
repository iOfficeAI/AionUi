---
name: pr-fix
description: |
  PR Review Fix: automatically fix all issues identified in a pr-review report.
  Use when: (1) User says "fix all review issues", (2) User says "/pr-fix",
  (3) After pr-review skill has produced a report, (4) User wants to address PR review feedback.
---

# PR Review Fix Skill

Automated workflow to resolve all issues surfaced in a pr-review report — parse summary → detect PR status → create fix branch or checkout original branch → **triage & validate** → fix by priority → quality gate → commit → publish → verify.

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
Save `FIX_BRANCH=bot/fix-pr-<PR_NUMBER>` for use in Step 3 and Step 8.

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
git worktree add "$WORKTREE_DIR" origin/<head_branch> --detach
cd "$WORKTREE_DIR"
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
git worktree add "$WORKTREE_DIR" origin/<base_branch> --detach
cd "$WORKTREE_DIR"
# Merge PR's commits into the detached HEAD
gh pr checkout <PR_NUMBER> --detach
git checkout -  # back to the base commit
git merge --no-ff --no-edit FETCH_HEAD
```

**All paths — symlink node_modules and rebuild native modules:**

```bash
ln -s "$REPO_ROOT/node_modules" "$WORKTREE_DIR/node_modules"
cd "$WORKTREE_DIR"
npx electron-rebuild -f -w better-sqlite3 2>/dev/null || true
```

The `electron-rebuild` step recompiles native modules (e.g., `better-sqlite3`) against the Electron version used by this project, ensuring ABI compatibility.

Save `REPO_ROOT` and `WORKTREE_DIR` for later steps. All file reads, edits, lint, and test commands from this point forward run inside `WORKTREE_DIR`.

---

### Step 4 — Triage & Validate

Before fixing anything, independently verify each issue from the review report. This prevents blind application of potentially incorrect or suboptimal fixes.

All file operations in this step use worktree paths (`$WORKTREE_DIR/<relative_path>`).

**For each CRITICAL / HIGH / MEDIUM issue (skip LOW), perform three-layer triage:**

#### Layer 1 — Is the issue real?

Read the target file and the surrounding context. Independently assess whether the reported problem actually exists:

- Does the problematic code pattern still exist at the reported location? (Review may be based on an older version)
- Is the reported behavior actually a bug, or is it intentional design? (Check PR description, related files, project conventions)
- Does the reviewer's reasoning hold up given the full context?

If the issue is **not real** → mark as `DISMISSED` with a clear reason.

#### Layer 2 — Is the suggested fix reasonable?

If the issue is real, evaluate the review report's "修复建议":

- Does the suggested fix actually resolve the problem?
- Does it introduce side effects (type errors, behavioral changes, broken imports)?
- Is it consistent with the project's patterns and conventions?

If the suggestion is **reasonable** → mark as `FIX` (adopt the original suggestion).

#### Layer 3 — Is there a better fix?

If the suggestion is flawed or suboptimal, consider an alternative:

- The alternative must target the **same file(s) and same code area** — do not expand scope
- The alternative must solve the **same problem**, just with a different approach
- The alternative's diff should not be significantly larger than the original suggestion — if it is, the change likely exceeds fix scope and should be a separate PR

If a better fix exists → mark as `FIX_ALT` with the alternative plan.
If no better fix exists → fall back to `FIX` (adopt the original suggestion despite its flaws, as long as it doesn't make things worse).

#### Triage output

Build an enhanced issue list. Each issue now has:

| Field      | Values                          | Description                                                                  |
| ---------- | ------------------------------- | ---------------------------------------------------------------------------- |
| `verdict`  | `FIX` / `FIX_ALT` / `DISMISSED` | Triage decision                                                              |
| `reason`   | free text                       | Why this verdict was chosen                                                  |
| `fix_plan` | code/description                | The actual fix to apply (`FIX`: original suggestion; `FIX_ALT`: alternative) |

#### CRITICAL issue constraints

**Automation mode (`--automation`):** CRITICAL issues **cannot** be dismissed. If triage concludes a CRITICAL issue is a false positive, the fixer must escalate — abort the fix workflow and transfer to human review:

```bash
gh pr edit <PR_NUMBER> --remove-label "bot:fixing" --add-label "bot:needs-human-review"
gh pr comment <PR_NUMBER> --body "<!-- pr-automation-bot -->
⚠️ Triage 阶段发现 CRITICAL 问题 #<issue_number> 可能为误报，但自动化流程无法自行驳回 CRITICAL 级别问题，已转交人工确认。

**问题：** <issue description>
**驳回理由：** <reason>"
```

Then **EXIT**.

**Interactive mode (no `--automation`):** Present the dismissal reasoning to the user and ask for confirmation:

> Triage 认为 CRITICAL 问题 #N 可能是误报：<reason>
> 是否同意驳回此问题？(yes/no)

- User says **yes** → mark as `DISMISSED`
- User says **no** → mark as `FIX` (apply original suggestion)

#### Post-triage check

After triage, if all non-LOW issues are `DISMISSED`, abort with:

> All issues were dismissed during triage — nothing to fix.

In automation mode, also transfer to human review (since at least one issue was CRITICAL/HIGH/MEDIUM but all were dismissed, a human should confirm):

```bash
gh pr edit <PR_NUMBER> --remove-label "bot:fixing" --add-label "bot:needs-human-review"
```

---

### Step 5 — Fix Issues by Priority

All file operations in this step use worktree paths. The Read tool should target `$WORKTREE_DIR/<relative_path>`, and the Edit tool should modify files at the same worktree paths.

Process only issues with verdict `FIX` or `FIX_ALT` from the triage output, in order CRITICAL → HIGH → MEDIUM. For each issue:

1. Read the target file (use Read tool at the file path from the summary table)
2. Locate the exact problem — match the review report's quoted code and line number
3. Apply the `fix_plan` from triage (original suggestion for `FIX`, alternative for `FIX_ALT`)
4. After fixing each file batch, run a quick type check:

```bash
bunx tsc --noEmit
```

Resolve any type errors before moving to the next issue.

**Batching:** Group issues in the same file into a single pass.

---

### Step 6 — Full Quality Gate

All commands run inside the worktree (`$WORKTREE_DIR`):

```bash
bun run lint:fix
bun run format
bunx tsc --noEmit
bun run test
```

**All four must pass.** Fix any failures caused by the current changes before proceeding.

---

### Step 7 — Commit

Follow the [commit skill](../commit/SKILL.md) workflow. Commit message **must** reference the original PR:

```
fix(<scope>): address review issues from PR #<PR_NUMBER>

- Fix <CRITICAL/HIGH issue 1 description>
- Fix <issue 2 description>
- ...

Review follow-up for #<PR_NUMBER>
```

---

### Step 8 — Publish

**Same-repo PR (`IS_FORK=false`):**

```bash
cd "$WORKTREE_DIR"
git push origin HEAD:<head_branch>
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
git push origin HEAD:bot/fix-pr-<PR_NUMBER>
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

### Step 9 — Verification Report

For each issue in the original summary table, verify the fix exists in actual code:

1. Read the relevant file (Read tool)
2. Grep for the original problematic pattern to confirm it is gone
3. Confirm the corrected code is in place

Post the verification report as a PR comment AND output it in the conversation. The report now includes a **Triage 决策** section before the fix table:

```bash
gh pr comment <PR_NUMBER> --body "$(cat <<'EOF'
<!-- pr-fix-verification -->
## PR Fix 验证报告

**原始 PR:** #<PR_NUMBER>
**修复方式:** 直接推送到 `<head_branch>`

### Triage 决策

| # | 严重级别 | 原始问题 | 判定 | 理由 |
|---|---------|---------|------|------|
| 2 | 🟠 HIGH | <问题描述> | ⏭️ 驳回 | <驳回理由，引用具体代码或项目约定> |
| 3 | 🟡 MEDIUM | <问题描述> | 🔄 替代方案 | <为什么原建议不适用，替代方案是什么> |

> 仅列出被驳回（DISMISSED）或使用替代方案（FIX_ALT）的问题。采纳原建议（FIX）的问题不在此表中。
> 若所有问题均采纳原建议，省略此区块。

### 修复结果

| # | 严重级别 | 文件 | 问题 | 修复方式 | 状态 |
|---|---------|------|------|---------|------|
| 1 | 🔴 CRITICAL | `file.ts:N` | <原始问题> | <修复措施> | ✅ 已修复 |
| 2 | 🟠 HIGH     | `file.ts:N` | <原始问题> | <修复措施> | ✅ 已修复（替代方案） |
| 3 | 🟡 MEDIUM   | `file.ts:N` | <原始问题> | — | ⏭️ 驳回 |

**总结：** ✅ 已修复 N 个 | 🔄 替代方案 N 个 | ⏭️ 驳回 N 个 | ❌ 未能修复 N 个

> 🔵 LOW 级别问题已跳过（不阻塞合并，修复优先级低）。
EOF
)"
```

After posting, output the same verification table in the conversation for immediate review.

---

### Step 10 — Cleanup

Remove the worktree. All paths use `--detach` so no local branches were created.

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
- **Triage before fix** — never blindly apply review suggestions; independently verify each issue and evaluate the proposed fix
- **Fix scope = review scope** — alternative fixes must target the same files and same problem; do not expand scope or refactor beyond what the issue requires
- **CRITICAL cannot be auto-dismissed** — in automation mode, dismissing a CRITICAL issue requires human escalation

---

## Quick Reference

```
 0. Require pr-review report in current session — abort if not found
 1. Parse summary table → ordered issue list
 2. Pre-flight: fetch PR info (state, isCrossRepository, maintainerCanModify, forkOwner)
    → ABORT: state=MERGED
 3. Create worktree at /tmp/aionui-pr-<PR_NUMBER> (all paths use --detach):
    → same-repo:        git fetch + git worktree add --detach
    → fork+canModify:   git worktree add --detach + gh pr checkout <PR_NUMBER>
    → fork+fallback:    git worktree add --detach + merge fork head
 4. Triage & Validate: verify each issue independently (3-layer check)
    → Layer 1: is issue real? → DISMISSED if false positive
    → Layer 2: is suggested fix reasonable? → FIX if yes
    → Layer 3: is there a better fix? → FIX_ALT if yes
    → CRITICAL cannot be auto-dismissed in automation mode (escalate to human)
 5. Fix issues with verdict FIX/FIX_ALT, CRITICAL→HIGH→MEDIUM; tsc after each batch
 6. bun run lint:fix && bun run format && bunx tsc --noEmit && bun run test (in worktree)
 7. Commit: fix(<scope>): address review issues from PR #N
 8. Push from worktree (same-repo / fork+canModify / fork+fallback)
 9. Verify → post Triage 决策 + 修复结果 as gh pr comment + output in conversation
10. Cleanup: git worktree remove + git branch -D (worktree and local branches)
```
