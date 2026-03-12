# PR Assessment (Local)

Perform a thorough local PR assessment with full project context — no API truncation limits.

## Usage

```
/pr-assess [pr_number]
```

`$ARGUMENTS` is an optional PR number. If omitted, auto-detect from the current branch.

---

## Steps

### Step 1 — Determine PR Number

If `$ARGUMENTS` is non-empty, use it as the PR number.

Otherwise run:
```bash
gh pr view --json number -q .number
```

If this also fails (not on a PR branch), abort with:
> No PR number provided and cannot detect one from the current branch. Usage: `/pr-assess <pr_number>`

### Step 2 — Check Working Tree

```bash
git status --porcelain
```

If the output is non-empty, abort with:
> Working tree has uncommitted changes. Please commit or stash them before running pr-assess.

### Step 3 — Record Current Branch

```bash
git branch --show-current
```

Save this as `<original_branch>` for Step 10.

### Step 4 — Checkout PR Branch

```bash
gh pr checkout <PR_NUMBER>
```

Save the checked-out branch name:
```bash
git branch --show-current
```

This gives us the full local PR code with no size limits.

### Step 5 — Collect Assessment Data (Parallel)

Run the following in parallel:

**PR metadata:**
```bash
gh pr view <PR_NUMBER> --json title,body,author,labels,headRefName,baseRefName,state,createdAt,updatedAt
```

**Full diff (no truncation):**
```bash
git diff origin/<baseRefName>...HEAD
```

**Changed file list:**
```bash
git diff --name-status origin/<baseRefName>...HEAD
```

**Linked issues:** Parse the PR body for patterns like `Fixes #N`, `Closes #N`, `Resolves #N`, and bare `#N` references. For each found issue number, run:
```bash
gh issue view <N> --json number,title,body,state,labels
```

### Step 6 — Read Changed File Contents

Use the Read tool to read each changed file locally (no truncation).

**Skip:**
- `*.lock` files
- Images, fonts
- `dist/`, `node_modules/`, `.cache/`
- `*.map`, `*.min.js`, `*.min.css`

**Priority order (read highest priority first):**
1. `src/process/`
2. `src/channels/`
3. `src/common/`
4. `src/worker/`
5. `src/renderer/`

Also read key interface/type definition files imported by the changed files when they provide important context.

### Step 7 — Perform Assessment

Write the assessment report in **Chinese**.

Use the following report template:

---

```markdown
## PR 评估：<PR 标题> (#<PR_NUMBER>)

### 变更概述

**这个 PR 做了什么？**
[3–5 句话说清楚：解决了什么问题、采用了什么方案、影响了哪些模块。让没有上下文的读者也能快速理解。]

**主要变更点：**
- [变更点 1：文件/模块 → 具体改动]
- [变更点 2：文件/模块 → 具体改动]
- [依此类推，每条聚焦一个独立改动]

**变更统计：** 共修改 X 个文件，新增 +N 行，删除 -N 行

### 关联 Issue 分析
[对每个关联 Issue：确认 PR 是否切实解决了它，指出任何遗漏或不完整之处]
（若无关联 Issue，跳过此节）

### 变更类型
[feat / fix / refactor / chore / docs / test / perf / ci / mixed]

### 合并建议
[以下三选一：]
- ✅ **批准合并** — 可以合并
- ⚠️ **有条件批准** — 存在小问题，处理后可合并
- ❌ **需要修改** — 存在阻塞性问题，必须先解决

### 合并优先级
[P0 – 紧急热修复 | P1 – 高 | P2 – 正常 | P3 – 低/可选]
[一句话说明原因]

### 风险评估

| 维度 | 风险等级 | 说明 |
|------|---------|------|
| 正确性 | 🟢/🟡/🔴 | |
| 测试覆盖 | 🟢/🟡/🔴 | |
| 性能影响 | 🟢/🟡/🔴 | |
| 安全性 | 🟢/🟡/🔴 | |
| 破坏性变更 | 🟢/🟡/🔴 | |

### 审查建议
[需要重点关注的地方、具体改进建议、值得注意的代码模式]

---
*本报告由本地 `/pr-assess` 命令生成，包含完整项目上下文，无截断限制。*
```

---

### Step 8 — Output Report

Print the complete assessment report to the terminal.

### Step 9 — Ask to Post Comment

Ask the user:
> Assessment complete. Post this as a PR comment on #<PR_NUMBER>? (yes/no)

If the user says **yes**:

1. Check for an existing assessment comment:
```bash
gh pr view <PR_NUMBER> --json comments --jq '.comments[] | select(.body | startswith("<!-- pr-assess-bot -->")) | .databaseId'
```

2. If a previous comment exists, update it:
```bash
gh api repos/{owner}/{repo}/issues/comments/<comment_id> -X PATCH -f body="<!-- pr-assess-bot -->

<assessment_report>"
```

3. If no previous comment exists, create a new one:
```bash
gh pr comment <PR_NUMBER> --body "<!-- pr-assess-bot -->

<assessment_report>"
```

### Step 10 — Cleanup

Switch back to the original branch:
```bash
git checkout <original_branch>
```

Ask the user:
> Delete the local PR branch `<pr_branch>`? (yes/no)

If yes:
```bash
git branch -D <pr_branch>
```
