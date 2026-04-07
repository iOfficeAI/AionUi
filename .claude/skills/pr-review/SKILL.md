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

`$ARGUMENTS` may contain an optional PR number and/or `--automation` flag.

- Without `--automation`: interactive mode (prompts for confirmation, comment, cleanup)
- With `--automation`: non-interactive mode (auto-post comment, auto-delete branch, output machine-readable result)

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

Also parse `--automation` from `$ARGUMENTS`:

```bash
AUTOMATION_MODE=false
if echo "$ARGUMENTS" | grep -q -- '--automation'; then
  AUTOMATION_MODE=true
fi
```

### Step 2 — Check CI Status

```bash
gh pr view <PR_NUMBER> --json statusCheckRollup \
  --jq '.statusCheckRollup[] | {name: .name, status: .status, conclusion: .conclusion}'
```

**必检 job 列表：**

- `Code Quality`
- `Unit Tests (ubuntu-latest)`
- `Unit Tests (macos-14)`
- `Unit Tests (windows-2022)`
- `Coverage Test`
- `i18n-check`

（`build-test` 为可选 job，不纳入必检范围。）

**特殊情形：** 满足以下任一条件时，跳过此步骤，直接继续：

- `statusCheckRollup` 为空（CI 从未触发）
- `statusCheckRollup` 非空，但所有必检 job 均不在列表中（说明 pr-checks.yml 工作流整体未触发，如仅改动 docs/md 文件的 PR）

**解析逻辑：** 分三种情形处理：

**Informational checks exclusion:** `codecov/patch` and `codecov/project` are configured as `informational: true` in `codecov.yml` — they never block merging and must be **excluded** from all failure checks below. Treat them as non-existent when evaluating CI status.

**情形 1 — 全部通过**（所有必检 job 均满足 `status == COMPLETED && conclusion == SUCCESS`，**且** `statusCheckRollup` 中无任何**非 informational** job 的 `conclusion` 为 `FAILURE` 或 `CANCELLED`；`codecov/*` 失败不影响此判断）

直接继续后续步骤，无需提示。

**情形 2 — 部分仍在运行**（存在 `status` 为 `QUEUED` 或 `IN_PROGRESS` 的**必检** job；非必检 job 仍在运行不影响此判断）

显示警告并询问：

> ⏳ 以下 CI job 尚未完成：[job 列表]
> PR CI 未全部完成，建议等待后再 review。是否仍要继续？(yes/no)

- 用户选 **no** → 终止
- 用户选 **yes** → 继续后续步骤

- **Automation mode:** do not prompt. Output signal and stop:
  ```
  <!-- automation-result -->
  CONCLUSION: CI_NOT_READY
  IS_CRITICAL_PATH: false
  CRITICAL_PATH_FILES: (none)
  PR_NUMBER: <PR_NUMBER>
  <!-- /automation-result -->
  ```
  Then exit.

**情形 3 — 存在失败**（`statusCheckRollup` 中存在**任意非 informational** job 的 `conclusion` 为 `FAILURE` 或 `CANCELLED`，不限于必检列表；`codecov/*` 始终排除在外）

显示警告并询问：

> ❌ 以下 CI job 未通过：[job 列表及结论]
> PR CI 存在失败，review 结论可能不准确。是否仍要继续？(yes/no)

- 用户选 **yes** → 继续，并在最终报告"变更概述"段落末尾追加 CI 状态警告（格式见"报告增强"节）
- 用户选 **no** → 终止 review，随即询问：

  > 是否在 PR #\<PR_NUMBER\> 发表评论，提醒作者修复失败的 CI job？(yes/no)
  - 用户选 **yes** → 发布 CI 失败提醒评论（格式见下方"CI 失败提醒评论"节），然后退出
  - 用户选 **no** → 直接退出

- **Automation mode:** do not prompt. Post CI failure comment automatically (same format as "CI 失败提醒评论"), then output signal and stop:
  ```
  <!-- automation-result -->
  CONCLUSION: CI_FAILED
  IS_CRITICAL_PATH: false
  CRITICAL_PATH_FILES: (none)
  PR_NUMBER: <PR_NUMBER>
  <!-- /automation-result -->
  ```
  Then exit.

#### CI 失败提醒评论

当 CI 失败且用户选择不继续 review 但选择发布提醒时，评论格式：

```bash
gh pr comment <PR_NUMBER> --body "<!-- pr-review-bot -->

## CI 检查未通过

以下 job 在本次 review 时未通过，请修复：

| Job | 结论 |
|-----|------|
| <失败的 job 名称> | ❌ <FAILURE 或 CANCELLED> |

本次 code review 暂缓，待 CI 全部通过后将重新执行。"
```

（仅列出实际失败的 job，跳过已通过的。）

#### 报告增强

当 CI 存在失败但用户选择继续时，在最终报告"变更概述"段落末尾追加：

```
> ⚠️ **CI 状态警告**：以下 job 在 review 时未通过：`<job 名称>`（<结论>）。本报告结论仅供参考，建议修复 CI 后重新 review。
```

---

### Step 3 — Create Worktree

Create an isolated worktree for this PR review. The main repo stays on its current branch.

```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
PR_NUMBER=<PR_NUMBER>
WORKTREE_DIR="/tmp/aionui-pr-${PR_NUMBER}"

# Clean up any stale worktree from a previous crash
git worktree remove "$WORKTREE_DIR" --force 2>/dev/null || true

# Fetch PR head AND base branch so the three-dot diff is accurate
git fetch origin pull/${PR_NUMBER}/head
BASE_REF=$(gh pr view ${PR_NUMBER} --json baseRefName --jq '.baseRefName')
git fetch origin "$BASE_REF"
git worktree add "$WORKTREE_DIR" FETCH_HEAD --detach

# Symlink node_modules so lint/tsc/test can run in the worktree
ln -s "$REPO_ROOT/node_modules" "$WORKTREE_DIR/node_modules"
```

Save `REPO_ROOT` and `WORKTREE_DIR` for use in subsequent steps. All file reads, lint, and diff commands from this point forward run inside `WORKTREE_DIR`.

Save the checked-out HEAD info:

```bash
cd "$WORKTREE_DIR"
git log --oneline -1
```

### Step 4 — Collect Context (Parallel)

Run the following in parallel:

**PR metadata:**

```bash
gh pr view <PR_NUMBER> --json title,body,author,labels,headRefName,baseRefName,state,createdAt,updatedAt
```

**Full diff (no truncation):**

```bash
cd "$WORKTREE_DIR"
git diff origin/<baseRefName>...HEAD
```

**Changed file list:**

```bash
cd "$WORKTREE_DIR"
git diff --name-status origin/<baseRefName>...HEAD
```

**PR discussion comments (excluding bot review comments):**

```bash
gh pr view <PR_NUMBER> --json comments \
  --jq '[.comments[] | select(.body | startswith("<!-- pr-review-bot -->") | not) | select(.body | startswith("<!-- pr-automation-bot -->") | not) | {author: .author.login, body: .body, createdAt: .createdAt}]'
```

Save as `pr_discussion`. Use in Step 7 as supplementary context for **方案合理性** evaluation — if participants have explained design decisions or flagged known trade-offs, factor that in. Code is always the authoritative source; comments are context only.

### Step 5 — Run Lint on Changed Files

Run oxlint on all changed `.ts` / `.tsx` files (skip deleted files):

```bash
cd "$WORKTREE_DIR"
bunx oxlint <changed_ts_tsx_files...>
```

Save the lint output as **lint baseline**. Use it when reviewing style and code quality in Step 6:

- If a pattern produces **no lint warning** → it is project-approved; do not flag it as a style issue.
- If a pattern produces **a lint warning/error** → it is a real violation; report it at the appropriate severity (ERROR → HIGH, WARNING → LOW).
- Do **not** suggest replacing a lint-clean pattern with an alternative based on general convention alone (e.g. do not suggest spread over `Object.assign` if `no-map-spread` is active).

### Step 6 — Read Changed File Contents

> Use the Read tool to read each changed file from the **worktree** path (`$WORKTREE_DIR/<relative_path>`), not from the main repo.

**Skip:**

- `*.lock` files
- Images, fonts
- `dist/`, `node_modules/`, `.cache/`
- `*.map`, `*.min.js`, `*.min.css`

**Priority order (read highest priority first):**

1. `src/process/`
2. `src/process/channels/`
3. `src/common/`
4. `src/process/worker/`
5. `src/renderer/`

Also read key interface/type definition files imported by the changed files when they provide important context.

### Step 7 — Perform Code Review

Write the code review report in **Chinese**.

Review dimensions:

- **方案合理性** — 整体方案是否正确解决了问题；是否引入不必要的复杂度；是否与项目已有架构和模式一致；是否存在更简单/优雅的实现路径；方案本身是否存在已知缺陷或设计盲点。具体评估要点：方案是否真正解决了 PR 描述的问题（而不是解决了另一个问题）；是否绕过了框架/库提供的现成机制（重复造轮子）；是否与 `src/process/`、`src/renderer/`、IPC bridge 等架构边界一致；是否引入了不必要的抽象层或过度工程化；方案是否有已知的边界情况或竞态条件，在设计层面未被考虑
- **正确性** — 逻辑是否正确，边界条件是否处理
- **安全性** — 注入、XSS、密钥泄露、权限越界
- **供应链安全** — 防范恶意代码注入，重点关注：(1) `eval()`、`new Function()`、`vm.runInNewContext()` 等动态代码执行；(2) base64/hex 编码的可疑字符串或 Unicode 转义序列（常见后门混淆手法）；(3) 新增的 `fetch`/`axios`/`http`/`net` 等网络请求，尤其是指向外部域名或动态拼接的 URL（数据外泄风险）；(4) 对 `process.env` 中敏感变量的非常规读取或外传；(5) 修改构建脚本、postinstall hook、或 CI 配置中植入额外命令。发现上述模式标记为 **CRITICAL**
- **不可变性** — 是否存在对象/数组直接变异（本项目关键原则）
- **错误处理** — 异常是否被静默吞掉，错误信息是否合理
- **性能** — 不必要的重渲染、大循环、阻塞调用
- **代码质量** — 函数长度、嵌套深度、命名清晰度
- **遗留 console.log** — 生产代码中是否有调试日志残留
- **数据库变更** — 若 PR 涉及 migration 文件或数据库 schema：(1) migration 是否正确（字段类型、约束、索引、默认值、可回滚性）；(2) 变更是否合理且与 PR 目标一致；(3) 对现有数据是否有丢失风险；(4) migration 顺序和依赖是否正确。不正确的 migration 标记为 CRITICAL。
- **IPC bridge / preload** — 若 PR 涉及 `src/preload.ts` 或 IPC channel 定义：(1) 是否暴露了不必要的 Node.js API 给 renderer；(2) 所有暴露的 API 是否有输入校验；(3) renderer 是否能在无授权情况下触发特权操作。暴露不安全 API 标记为 CRITICAL。
- **Electron 安全配置** — 若 PR 涉及 `electron-builder.yml`、`entitlements.plist` 或 `electron.vite.config.ts` 中的 Electron 配置：(1) sandbox/nodeIntegration/contextIsolation 设置是否被弱化；(2) entitlements 是否授权过度；(3) 签名和公证是否被破坏。安全回退标记为 CRITICAL。
- **测试** — 对照 [testing skill](../testing/SKILL.md) 的标准评估，以下任一情况须指出：
  - 新增功能没有对应测试用例
  - 修改了逻辑但未更新已有相关测试
  - 新增的源文件被 `vitest.config.ts` 的 `coverage.exclude` 意外排除（即本应计入覆盖但被错误排除）
  - 已有测试不符合 testing skill Step 2 的质量规则
  - `codecov/patch` CI check 显示 FAILURE（patch 覆盖率低于 50%）：虽然 `codecov.yml` 将此 check 设为 `informational: true`（不阻塞合并），但覆盖率不足说明本次改动新增代码缺乏测试，应在 review 中指出（级别 LOW，供作者参考）
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

````markdown
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
````

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

| #   | 严重级别    | 文件        | 问题 |
| --- | ----------- | ----------- | ---- |
| 1   | 🔴 CRITICAL | `file.ts:N` | ...  |
| 2   | 🟠 HIGH     | `file.ts:N` | ...  |

### 结论

[以下三选一：]

- ✅ **批准合并** — 无阻塞性问题
- ⚠️ **有条件批准** — 存在小问题，处理后可合并
- ❌ **需要修改** — 存在阻塞性问题，必须先解决

[一句话说明理由]

---

_本报告由本地 `pr-review` skill 生成，包含完整项目上下文，无截断限制。_

````

---

If no issues are found across all dimensions, output:

> ✅ 未发现明显问题，代码质量良好，建议批准合并。

### Step 8 — Ask to Post Comment

Print the complete review report to the terminal.

**Automation mode:** skip the prompt — automatically proceed to post the comment.

**Non-automation mode:** ask the user:
> Review 完成。是否将此报告发布为 PR #<PR_NUMBER> 的评论？(yes/no)
If the user says **no**, skip posting.

To post:

1. Check for an existing review comment:
```bash
gh pr view <PR_NUMBER> --json comments --jq '.comments[] | select(.body | startswith("<!-- pr-review-bot -->")) | .databaseId'
````

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

**Automation mode only — after posting the comment, output the machine-readable result block:**

Map the review conclusion to CONCLUSION value based on the **highest severity issue found**:

| Highest issue severity | Review 结论   | CONCLUSION  |
| ---------------------- | ------------- | ----------- |
| None / LOW only        | ✅ 批准合并   | APPROVED    |
| MEDIUM                 | ⚠️ 有条件批准 | CONDITIONAL |
| HIGH                   | ⚠️ 有条件批准 | CONDITIONAL |
| CRITICAL               | ❌ 需要修改   | REJECTED    |

**Key rule:** If all issues are LOW (or there are no issues), emit `APPROVED` even when the human-facing verdict says "有条件批准". `pr-fix` explicitly skips LOW issues, so triggering a fix session for LOW-only reviews wastes a round with no actionable outcome.

Determine `IS_CRITICAL_PATH` using the `CRITICAL_PATH_PATTERN` env var (defined in `scripts/pr-automation.conf`, passed by daemon at runtime).
When a pattern is defined, check and capture matched files:

```bash
# CRITICAL_PATH_PATTERN is an env var — set by pr-automation daemon or manually
if [ -n "$CRITICAL_PATH_PATTERN" ]; then
  cd "$WORKTREE_DIR"
  CRITICAL_FILES=$(git diff origin/<baseRefName>...HEAD --name-only | grep -E "$CRITICAL_PATH_PATTERN")
  if [ -n "$CRITICAL_FILES" ]; then
    IS_CRITICAL_PATH=true
  else
    IS_CRITICAL_PATH=false
  fi
else
  IS_CRITICAL_PATH=false
  CRITICAL_FILES=""
fi
```

Output:

```
<!-- automation-result -->
CONCLUSION: APPROVED
IS_CRITICAL_PATH: false
CRITICAL_PATH_FILES: (none)
PR_NUMBER: 123
<!-- /automation-result -->
```

When `IS_CRITICAL_PATH` is true, list matched files one per line:

```
<!-- automation-result -->
CONCLUSION: APPROVED
IS_CRITICAL_PATH: true
CRITICAL_PATH_FILES:
- docs/feature/extension-market/agent-hub-requirements.md
- docs/feature/extension-market/research/architecture.md
PR_NUMBER: 456
<!-- /automation-result -->
```

### Step 9 — Cleanup

Remove the worktree. No branch switching needed — the main repo was never touched.

```bash
cd "$REPO_ROOT"
git worktree remove "$WORKTREE_DIR" --force 2>/dev/null || true
```

Both automation and non-automation modes use the same cleanup — no prompt needed since worktree removal has no side effects.
