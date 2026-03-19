---
name: pr-fix
description: |
  PR Review Fix: automatically fix all issues identified in a pr-review report.
  Use when: (1) User says "fix all review issues", (2) User says "/pr-fix",
  (3) After pr-review skill has produced a report, (4) User wants to address PR review feedback.
---

# PR Review Fix Skill

Automated workflow to resolve all issues surfaced in a pr-review report — parse summary → create fix branch → fix by priority → quality gate → commit → open follow-up PR → verify.

**Announce at start:** "I'm using pr-fix skill to fix all review issues."

## Usage

```
/pr-fix [pr_number]
```

`pr_number` is optional. If omitted, the skill uses the review report already present in the current session.

---

## Steps

### Step 0 — Identify the Review Report Source

**Case A — Report is in the current session**

The [pr-review skill](../pr-review/SKILL.md) was just executed. The review report (containing a "汇总" table) is already in the conversation. Extract the PR number from the report header:

```
## Code Review：<PR 标题> (#<PR_NUMBER>)
```

**Case B — User provides a PR number (or no report in session)**

If `pr_number` argument is non-empty, use it. Otherwise run:

```bash
gh pr view --json number -q .number
```

Fetch the review comment:

```bash
gh pr view <PR_NUMBER> --json comments \
  --jq '.comments[] | select(.body | startswith("<!-- pr-review-bot -->")) | .body'
```

If no review comment is found, abort with:
> No pr-review report found. Please run `/pr-review <pr_number>` first.

---

### Step 1 — Parse the Summary Table

Locate the **汇总** section in the review report:

```markdown
| # | 严重级别 | 文件 | 问题 |
|---|---------|------|------|
| 1 | 🔴 CRITICAL | `file.ts:N` | ... |
```

Build an ordered issue list, grouped by severity:

| Priority | Severity | Emoji |
|----------|----------|-------|
| 1        | CRITICAL | 🔴    |
| 2        | HIGH     | 🟠    |
| 3        | MEDIUM   | 🟡    |
| 4        | LOW      | 🔵    |

If the 汇总 table is empty, abort with:
> No issues found in the review summary. Nothing to fix.

**LOW issues — ask user once:**
> 检测到 N 个 LOW 级别问题。是否一并修复？(yes/no)

If **no**, exclude LOW issues from this run.

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

If working tree is dirty, abort with:
> Working tree has uncommitted changes. Please commit or stash them before running pr-fix.

Save `<original_head_branch>` and `<base_branch>` for Step 3.

---

### Step 3 — Create Fix Branch

Derive the fix branch name from `<original_head_branch>`:

| Original branch           | Scope      | Fix branch                       |
|---------------------------|------------|----------------------------------|
| `feat/webui-file-upload`  | `webui`    | `fix/webui-review-followup`      |
| `fix/cron-timezone`       | `cron`     | `fix/cron-review-followup`       |
| `feat/image-generation-mcp` | `image-generation-mcp` | `fix/image-generation-mcp-review-followup` |

**Rule:** Split on `/`, take segment after the first `/`, use that as scope (trim any trailing `-` suffixes if desired).

```bash
git fetch origin <base_branch>
git checkout <base_branch>
git pull origin <base_branch>
git checkout -b fix/<scope>-review-followup
```

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

### Step 7 — Create Follow-up PR

Follow the [pr skill](../pr/SKILL.md) — **skip** Step 2 (Issue Association), do NOT create a new issue.

```bash
gh pr create \
  --title "fix(<scope>): address review issues from PR #<PR_NUMBER>" \
  --body "$(cat <<'EOF'
## Summary

Follow-up to #<PR_NUMBER> — addresses all issues identified in the code review.

## Issues Fixed

| # | Severity | File | Issue | Fix Applied |
|---|----------|------|-------|-------------|
| 1 | 🔴 CRITICAL | `file.ts:N` | <description> | <what was done> |
| 2 | 🟠 HIGH | `file.ts:N` | <description> | <what was done> |

## Related

Follow-up to #<PR_NUMBER>

## Test Plan

- [ ] `bun run test` — all tests pass
- [ ] `bunx tsc --noEmit` — no type errors
- [ ] `bun run lint:fix` — lint clean
- [ ] Manually verify each fixed issue in the changed files
EOF
)"
```

Output the new PR URL to the user.

---

### Step 8 — Verification Report

For each issue in the original summary table, verify the fix exists in actual code:

1. Read the relevant file (Read tool)
2. Grep for the original problematic pattern to confirm it is gone
3. Confirm the corrected code is in place

Output:

```markdown
## PR Fix 验证报告

**原始 PR:** #<PR_NUMBER>
**Follow-up PR:** #<NEW_PR_NUMBER>

| # | 严重级别 | 文件 | 问题 | 修复方式 | 状态 |
|---|---------|------|------|---------|------|
| 1 | 🔴 CRITICAL | `file.ts:N` | <原始问题> | <修复措施> | ✅ 已修复 |
| 2 | 🟠 HIGH     | `file.ts:N` | <原始问题> | <修复措施> | ✅ 已修复 |
| 3 | 🔵 LOW      | `file.ts:N` | <原始问题> | —       | ⏭️ 跳过 |

**总结：** ✅ 已修复 N 个 | ❌ 未能修复 N 个 | ⏭️ 跳过 N 个
```

---

## Mandatory Rules

- **No AI signature** — no `Co-Authored-By`, `Generated with`, or any AI byline
- **Always reference original PR** — every commit and PR body must include `Follow-up to #<PR_NUMBER>`
- **No issue creation** — this skill skips the issue-association step in pr skill
- **Fix, don't workaround** — no `// @ts-ignore`, no lint suppression; address the root cause

---

## Quick Reference

```
0. Get review report (current session OR fetch from PR comments)
1. Parse 汇总 table → ordered issue list; ask about LOW issues
2. Pre-flight: clean working tree + fetch original PR branch info
3. git checkout <base> && git pull && git checkout -b fix/<scope>-review-followup
4. Fix issues CRITICAL→HIGH→MEDIUM→LOW; bunx tsc --noEmit after each file batch
5. bun run lint:fix && bun run format && bunx tsc --noEmit && bun run test
6. Commit: fix(<scope>): address review issues from PR #N
7. gh pr create — Follow-up to #N (skip issue creation)
8. Verify each fix → output verification table (✅ / ❌ / ⏭️)
```
