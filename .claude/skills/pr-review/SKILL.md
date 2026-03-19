---
name: pr-review
description: |
  PR Code Review (Local): perform a thorough local code review with full project context.
  Use when: (1) User asks to review a PR, (2) User says "/pr-review", (3) User wants to review code changes before merging.
---

# PR Code Review (Local)

Perform a thorough local code review with full project context — reads source files directly, no API truncation limits.

**Announce at start:** "I'm using pr-review skill to review the pull request."

## Usage

```
/pr-review [pr_number]
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
> No PR number provided and cannot detect one from the current branch. Usage: `/pr-review <pr_number>`

### Step 2 — Check Working Tree

```bash
git status --porcelain
```

If the output is non-empty, abort with:
> Working tree has uncommitted changes. Please commit or stash them before running pr-review.

### Step 3 — Record Current Branch

```bash
git branch --show-current
```

Save this as `<original_branch>` for Step 9.

### Step 4 — Checkout PR Branch

```bash
gh pr checkout <PR_NUMBER>
```

Save the checked-out branch name:
```bash
git branch --show-current
```

### Step 5 — Collect Context (Parallel)

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

**Existing pr-assess comment (if any):**
```bash
gh pr view <PR_NUMBER> --json comments --jq '.comments[] | select(.body | startswith("<!-- pr-assess-bot -->")) | .body'
```

If a pr-assess comment exists, use it as supplementary context (risk signals, change overview) when forming your review. Do not re-verify its conclusions — treat it as background information only.

### Step 6 — Read Changed File Contents

Use the Read tool to read each changed file locally.

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

### Step 7 — Perform Code Review

Write the code review report in **Chinese**.

Review dimensions:

- **方案合理性** — 整体方案是否正确解决了问题；是否引入不必要的复杂度；是否与项目已有架构和模式一致；是否存在更简单/优雅的实现路径；方案本身是否存在已知缺陷或设计盲点。具体评估要点：方案是否真正解决了 PR 描述的问题（而不是解决了另一个问题）；是否绕过了框架/库提供的现成机制（重复造轮子）；是否与 `src/process/`、`src/renderer/`、IPC bridge 等架构边界一致；是否引入了不必要的抽象层或过度工程化；方案是否有已知的边界情况或竞态条件，在设计层面未被考虑
- **正确性** — 逻辑是否正确，边界条件是否处理
- **安全性** — 注入、XSS、密钥泄露、权限越界
- **不可变性** — 是否存在对象/数组直接变异（本项目关键原则）
- **错误处理** — 异常是否被静默吞掉，错误信息是否合理
- **性能** — 不必要的重渲染、大循环、阻塞调用
- **代码质量** — 函数长度、嵌套深度、命名清晰度
- **遗留 console.log** — 生产代码中是否有调试日志残留
- **测试** — 以下任一情况须指出：
  - 新增功能没有对应测试用例
  - 修改了逻辑但未更新已有相关测试
  - 新增的源文件未加入 `vitest.config.ts` 的 `coverage.include`
- **可测试性** — 变更后的代码是否仍可独立测试；依赖是否可 mock；
  是否与已有模块保持解耦；能否在不依赖完整运行环境的情况下运行单元测试。
  发现耦合时区分来源：
  - **本次改动新引入的耦合** — 按影响程度定级（新功能从设计阶段就应解耦，列为 HIGH；导致测试无法运行则列为 CRITICAL）
  - **已存在的历史耦合** — 不作为本 PR 阻塞点，建议单独开 issue 跟踪

**只报告真实存在的问题。** 如果某个维度代码没有问题，跳过即可，不要为了显示"有在认真 review"而凑问题。以实际代码为准，有则报告，无则如实说代码干净。方案合理性维度同理——如果方案本身没有问题，如实写"方案合理"即可，不要为了体现"有深度"而刻意挑剔。

For each issue found:
1. Specify file path and line number(s)
2. Quote the problematic code
3. Explain why it is an issue
4. Provide a concrete fix with corrected code

Use the following report template:

---

```markdown
## Code Review：<PR 标题> (#<PR_NUMBER>)

### 变更概述
[2–3 句话说明这个 PR 改了什么，影响了哪些模块。]

---

### 方案评估

**结论**：✅ 方案合理 / ⚠️ 方案有缺陷 / ❌ 方案根本错误

[2–4 句话说明：方案是否正确解决了目标问题；是否与项目架构一致；有无更优雅的替代方案（如有，简述思路）；方案层面有无设计盲点。]

---

### 问题清单

#### 🔴 CRITICAL — <问题标题>

**文件**：`path/to/file.ts`，第 N 行

**问题代码**：
```ts
// 有问题的代码
```

**问题说明**：[说明为什么有问题]

**修复建议**：
```ts
// 修复后的代码
```

---

#### 🟠 HIGH — <问题标题>

（格式同上）

---

#### 🟡 MEDIUM — <问题标题>

（格式同上）

---

#### 🔵 LOW — <问题标题>

（格式同上）

---

### 汇总

| # | 严重级别 | 文件 | 问题 |
|---|---------|------|------|
| 1 | 🔴 CRITICAL | `file.ts:N` | ... |
| 2 | 🟠 HIGH | `file.ts:N` | ... |

### 结论

[以下三选一：]
- ✅ **批准合并** — 无阻塞性问题
- ⚠️ **有条件批准** — 存在小问题，处理后可合并
- ❌ **需要修改** — 存在阻塞性问题，必须先解决

[一句话说明理由]

---
*本报告由本地 `pr-review` skill 生成，包含完整项目上下文，无截断限制。*
```

---

If no issues are found across all dimensions, output:

> ✅ 未发现明显问题，代码质量良好，建议批准合并。

### Step 8 — Ask to Post Comment

Print the complete review report to the terminal, then ask the user:

> Review 完成。是否将此报告发布为 PR #<PR_NUMBER> 的评论？(yes/no)

If the user says **yes**:

1. Check for an existing review comment:
```bash
gh pr view <PR_NUMBER> --json comments --jq '.comments[] | select(.body | startswith("<!-- pr-review-bot -->")) | .databaseId'
```

2. If a previous comment exists, update it:
```bash
gh api repos/{owner}/{repo}/issues/comments/<comment_id> -X PATCH -f body="<!-- pr-review-bot -->

<review_report>"
```

3. If no previous comment exists, create a new one:
```bash
gh pr comment <PR_NUMBER> --body "<!-- pr-review-bot -->

<review_report>"
```

### Step 9 — Cleanup

Switch back to the original branch:
```bash
git checkout <original_branch>
```

Ask the user:
> 是否删除本地 PR 分支 `<pr_branch>`？(yes/no)

If yes:
```bash
git branch -D <pr_branch>
```
