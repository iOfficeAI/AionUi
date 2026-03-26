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

**LOW issues:** Always include all LOW issues in the fix run — no prompt needed.

---

### Step 2 — Pre-flight Checks

Run in parallel:

```bash
git status --porcelain
```

```bash
gh pr view <PR_NUMBER> --json headRefName,baseRefName \
  -q '{head: .headRefName, base: .baseRefName}'
```

```bash
# Check whether the PR has been merged
gh pr view <PR_NUMBER> --json state -q '.state'
# Returns: "MERGED" or "OPEN"
```

If working tree is dirty, abort with:

> Working tree has uncommitted changes. Please commit or stash them before running pr-fix.

Save `<head_branch>`, `<base_branch>`, and `<state>` for Step 3.

**Determine path based on results:**

| state    | Path                             |
| -------- | -------------------------------- |
| `OPEN`   | Path B — push to original branch |
| `MERGED` | Abort — nothing to fix           |

If state is `MERGED`: abort with:
> PR #<PR_NUMBER> has already been merged. Nothing to fix.

---

### Step 3 — Prepare Working Branch

Check out the existing head branch directly — no new branch needed:

```bash
git fetch origin <head_branch>
git checkout <head_branch>
git pull origin <head_branch>
```

Fixes will be committed directly onto this branch, and the open PR will update automatically.

---

### Step 4 — Fix Issues by Priority

Process issues CRITICAL → HIGH → MEDIUM → LOW. For each issue:

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

```bash
git push origin <head_branch>
```

Output to user:

> 已推送到 `<head_branch>`，PR #<PR_NUMBER> 已自动更新。无需创建新 PR。

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
EOF
)"
```

After posting, output the same verification table in the conversation for immediate review.

---

## Mandatory Rules

- **No AI signature** — no `Co-Authored-By`, `Generated with`, or any AI byline
- **Always reference original PR** — every commit and PR body must include `Follow-up to #<PR_NUMBER>`
- **No issue creation** — this skill skips the issue-association step in pr skill
- **Fix, don't workaround** — no `// @ts-ignore`, no lint suppression; address the root cause

---

## Quick Reference

```
0. Require pr-review report in current session — abort if not found
1. Parse 汇总 table → ordered issue list
2. Pre-flight: clean working tree + fetch PR branch info
   + detect: state (merged/open)
   → ABORT: state=MERGED — nothing to fix
   → Path B: state=OPEN — push to original branch (internal or external fork)
3. git fetch origin <head_branch> && git checkout <head_branch> && git pull
4. Fix issues CRITICAL→HIGH→MEDIUM→LOW; bunx tsc --noEmit after each file batch
5. bun run lint:fix && bun run format && bunx tsc --noEmit && bun run test
6. Commit: fix(<scope>): address review issues from PR #N
7. git push origin <head_branch> (PR auto-updated, no new PR)
8. Verify → post as gh pr comment PR_NUMBER + output in conversation
```
