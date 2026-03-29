# PR Automation 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现一套本地 cron 驱动的 PR 自动化系统，自动 review、fix 和合并符合条件的 open PR。

**Architecture:** 入口脚本 `scripts/pr-automation.sh` 负责 lock 并发控制、启动 N 个 Claude 实例；每个实例执行 pr-automation SKILL（主编排器），依次完成 PR 筛选→CI 检查→pr-review→决策→pr-fix→合并；GitHub Labels 作为分布式状态存储，避免多实例重复处理同一 PR。

**Tech Stack:** Bash, GitHub CLI (`gh`), Claude Code skills (`/pr-review`, `/pr-fix`)

---

## 文件变更一览

| 路径                                    | 操作 | 说明                                                 |
| --------------------------------------- | ---- | ---------------------------------------------------- |
| `.claude/skills/pr-fix/SKILL.md`        | 修改 | 删除 LOW 询问（所有模式）；新增 automation 模式      |
| `.claude/skills/pr-review/SKILL.md`     | 修改 | 新增 automation 模式（无交互、自动发布、输出结论块） |
| `.claude/skills/pr-automation/SKILL.md` | 新建 | 主编排 skill                                         |
| `scripts/pr-automation.sh`              | 新建 | cron 入口脚本（lock + N 实例）                       |
| `docs/conventions/pr-automation.md`     | 新建 | 面向 agent 和人工的对接文档                          |
| `AGENTS.md`                             | 修改 | 新增 PR 自动化简介和引用                             |

---

## Task 1: 修改 pr-fix skill — 删除 LOW 询问 + 新增 automation 模式

**Files:**

- Modify: `.claude/skills/pr-fix/SKILL.md`

### 改动说明

**改动 A：删除 LOW 询问（所有模式）**

找到 Step 1 中以下段落并删除：

```markdown
**LOW issues — ask user once:**

> 检测到 N 个 LOW 级别问题。是否一并修复？(yes/no)

If **no**, exclude LOW issues from this run.
```

替换为：

```markdown
**LOW issues:** Always include all LOW issues in the fix run — no prompt needed.
```

**改动 B：新增 automation 模式检测**

在 `## Steps` 之前（即 `## Usage` 后），新增一个 `## Mode Detection` 小节：

````markdown
## Mode Detection

At the very start of execution, check `$ARGUMENTS` for the `--automation` flag:

```bash
# $ARGUMENTS example: "123 --automation" or "123"
AUTOMATION_MODE=false
if echo "$ARGUMENTS" | grep -q -- '--automation'; then
  AUTOMATION_MODE=true
fi
```
````

In **automation mode**:

- Skip all yes/no confirmation prompts — follow the default best path
- When `isCrossRepository=true` (external fork PR): do NOT abort with an error; instead output the signal below and exit immediately
- The signal format (output to stdout so pr-automation can detect it):

```
<!-- pr-fix-signal -->
SIGNAL: SKIP_EXTERNAL
PR_NUMBER: <number>
<!-- /pr-fix-signal -->
```

````

**改动 C：外部 fork PR 处理（automation 模式）**

找到 Step 2 中的 ABORT 路径：

```markdown
If state is `OPEN` and isCrossRepository is `true`, abort with:

> PR #<PR_NUMBER> is still open and was submitted from an external fork. Direct push is not possible.
> Please wait for the PR to be merged, then run `/pr-fix` again.
````

替换为：

```markdown
If state is `OPEN` and isCrossRepository is `true`:

- **Non-automation mode:** abort with:

  > PR #<PR_NUMBER> is still open and was submitted from an external fork. Direct push is not possible.
  > Please wait for the PR to be merged, then run `/pr-fix` again.

- **Automation mode:** output the signal below and exit cleanly (do NOT proceed with fixes):
```

  <!-- pr-fix-signal -->

SIGNAL: SKIP_EXTERNAL
PR_NUMBER: <PR_NUMBER>

  <!-- /pr-fix-signal -->

```

```

- [ ] **Step 1: 应用改动 A — 删除 LOW 询问**

  用 Edit 工具，找到以下内容：

  ```
  **LOW issues — ask user once:**

  > 检测到 N 个 LOW 级别问题。是否一并修复？(yes/no)

  If **no**, exclude LOW issues from this run.
  ```

  替换为：

  ```
  **LOW issues:** Always include all LOW issues in the fix run — no prompt needed.
  ```

- [ ] **Step 2: 应用改动 B — 在 `## Steps` 前插入 Mode Detection 节**

  用 Edit 工具，在 `## Steps` 前插入：

  ````markdown
  ## Mode Detection

  At the very start of execution, check `$ARGUMENTS` for the `--automation` flag:

  ```bash
  # $ARGUMENTS example: "123 --automation" or "123"
  AUTOMATION_MODE=false
  if echo "$ARGUMENTS" | grep -q -- '--automation'; then
    AUTOMATION_MODE=true
  fi
  ```
  ````

  In **automation mode**:
  - Skip all yes/no confirmation prompts — follow the default best path
  - When `isCrossRepository=true` (external fork PR): do NOT abort with an error; instead output the signal below and exit immediately

  ```
  <!-- pr-fix-signal -->
  SIGNAL: SKIP_EXTERNAL
  PR_NUMBER: <number>
  <!-- /pr-fix-signal -->
  ```

  ```

  ```

- [ ] **Step 3: 应用改动 C — 修改外部 fork abort 路径**

  用 Edit 工具找到：

  ```
  If state is `OPEN` and isCrossRepository is `true`, abort with:

  > PR #<PR_NUMBER> is still open and was submitted from an external fork. Direct push is not possible.
  > Please wait for the PR to be merged, then run `/pr-fix` again.
  ```

  替换为：

  ```
  If state is `OPEN` and isCrossRepository is `true`:

  - **Non-automation mode:** abort with:
    > PR #<PR_NUMBER> is still open and was submitted from an external fork. Direct push is not possible.
    > Please wait for the PR to be merged, then run `/pr-fix` again.

  - **Automation mode:** output the signal below and exit cleanly (do NOT proceed with fixes):
  ```

    <!-- pr-fix-signal -->

  SIGNAL: SKIP_EXTERNAL
  PR_NUMBER: <PR_NUMBER>
    <!-- /pr-fix-signal -->

  ```

  ```

- [ ] **Step 4: 确认文件内容正确**

  读取 `.claude/skills/pr-fix/SKILL.md`，确认：
  1. LOW 询问段落已删除
  2. `## Mode Detection` 节存在，位于 `## Steps` 之前
  3. 外部 fork abort 路径已包含 automation 分支

- [ ] **Step 5: Commit**

  ```bash
  git add .claude/skills/pr-fix/SKILL.md
  git commit -m "feat(pr-fix): remove LOW inquiry and add automation mode support"
  ```

---

## Task 2: 修改 pr-review skill — 新增 automation 模式

**Files:**

- Modify: `.claude/skills/pr-review/SKILL.md`

### 改动说明

**改动 A：更新 Usage 说明**

在 Usage 节追加 automation 用法：

```markdown

```

/pr-review [pr_number] [--automation]

```

`$ARGUMENTS` may contain an optional PR number and/or `--automation` flag.
- Without `--automation`: interactive mode (prompts for confirmation, comment, cleanup)
- With `--automation`: non-interactive mode (auto-post comment, auto-delete branch, output machine-readable result)
```

**改动 B：Step 1 末尾追加 flag 检测**

在 Step 1 末尾（确定 PR 号之后）追加：

````markdown
Also parse `--automation` from `$ARGUMENTS`:

```bash
AUTOMATION_MODE=false
if echo "$ARGUMENTS" | grep -q -- '--automation'; then
  AUTOMATION_MODE=true
fi
```
````

````

**改动 C：Step 2（CI 检查）中 automation 模式行为**

在 Step 2 的 **情形 2** 和 **情形 3** 的处理逻辑中，增加 automation 分支：

情形 2（QUEUED/IN_PROGRESS）追加：

```markdown
- **Automation mode:** do not prompt. Output signal and stop:
````

  <!-- automation-result -->

CONCLUSION: CI_NOT_READY
IS_CRITICAL_PATH: false
PR_NUMBER: <PR_NUMBER>

  <!-- /automation-result -->

```
Then exit.
```

情形 3（FAILURE/CANCELLED）追加：

```markdown
- **Automation mode:** do not prompt. Post CI failure comment automatically (same format as "CI 失败提醒评论"), then output signal and stop:
```

  <!-- automation-result -->

CONCLUSION: CI_FAILED
IS_CRITICAL_PATH: false
PR_NUMBER: <PR_NUMBER>

  <!-- /automation-result -->

```
Then exit.
```

**改动 D：Step 10（发布评论）— automation 模式无需询问**

在 Step 10 开头，在打印报告之后，增加分支：

```markdown
**Automation mode:** skip the prompt — automatically post (or update) the review comment using the same create/update logic below.

**Non-automation mode:** ask the user:

> Review 完成。是否将此报告发布为 PR #<PR_NUMBER> 的评论？(yes/no)
```

**改动 E：Step 10 末尾输出 automation-result 块（automation 模式）**

在 Step 10 末尾（发布评论完成后）追加：

````markdown
**Automation mode only — after posting the comment, output the machine-readable result block:**

Map the review conclusion to CONCLUSION value:

| Review 结论   | CONCLUSION  |
| ------------- | ----------- |
| ✅ 批准合并   | APPROVED    |
| ⚠️ 有条件批准 | CONDITIONAL |
| ❌ 需要修改   | REJECTED    |

Determine `IS_CRITICAL_PATH` by checking whether the diff contains any of these paths:

- `src/preload.ts`
- `src/process/channels/`
- `src/common/config/`

```bash
git diff origin/<baseRefName>...HEAD --name-only | grep -qE '^(src/preload\.ts|src/process/channels/|src/common/config/)' && echo true || echo false
```
````

Then output:

```
<!-- automation-result -->
CONCLUSION: APPROVED
IS_CRITICAL_PATH: false
PR_NUMBER: 123
<!-- /automation-result -->
```

````

**改动 F：Step 11（Cleanup）— automation 模式自动删除本地分支**

找到 Step 11 中询问是否删除分支的段落：

```markdown
Ask the user:

> 是否删除本地 PR 分支 `<pr_branch>`？(yes/no)

If yes:

```bash
git branch -D <pr_branch>
````

````

替换为：

```markdown
**Automation mode:** delete the local PR branch automatically without prompting:

```bash
git branch -D <pr_branch>
````

**Non-automation mode:** ask the user:

> 是否删除本地 PR 分支 `<pr_branch>`？(yes/no)

If yes:

```bash
git branch -D <pr_branch>
```

```

- [ ] **Step 1: 应用改动 A — 更新 Usage**

  找到：
```

`$ARGUMENTS` is an optional PR number. If omitted, auto-detect from the current branch.

```
替换为：
```

`$ARGUMENTS` may contain an optional PR number and/or `--automation` flag.

- Without `--automation`: interactive mode (prompts for confirmation, comment, cleanup)
- With `--automation`: non-interactive mode (auto-post comment, auto-delete branch, output machine-readable result)

```

- [ ] **Step 2: 应用改动 B — Step 1 末尾追加 flag 检测**

找到 Step 1 末尾 abort 消息之后：
```

> No PR number provided and cannot detect one from the current branch. Usage: `/pr-review <pr_number>`

````
在其后插入：
```markdown

Also parse `--automation` from `$ARGUMENTS`:

```bash
AUTOMATION_MODE=false
if echo "$ARGUMENTS" | grep -q -- '--automation'; then
  AUTOMATION_MODE=true
fi
````

````

- [ ] **Step 3: 应用改动 C — Step 2 CI check automation 分支**

找到情形 2 的 "用户选 **no** → 终止" 后，追加 automation 处理：
```markdown
- **Automation mode:** do not prompt. Output signal and stop:
  ```
  <!-- automation-result -->
  CONCLUSION: CI_NOT_READY
  IS_CRITICAL_PATH: false
  PR_NUMBER: <PR_NUMBER>
  <!-- /automation-result -->
  ```
  Then exit.
````

找到情形 3 的 "用户选 **no** → 终止 review" 后，追加 automation 处理：

````markdown
- **Automation mode:** do not prompt. Post CI failure comment automatically (same format as "CI 失败提醒评论"), then output signal and stop:
  ```
  <!-- automation-result -->
  CONCLUSION: CI_FAILED
  IS_CRITICAL_PATH: false
  PR_NUMBER: <PR_NUMBER>
  <!-- /automation-result -->
  ```
  Then exit.
````

- [ ] **Step 4: 应用改动 D — Step 10 发布评论 automation 无需询问**

  找到：

  ```
  Print the complete review report to the terminal, then ask the user:

  > Review 完成。是否将此报告发布为 PR #<PR_NUMBER> 的评论？(yes/no)

  If the user says **yes**:
  ```

  替换为：

  ```
  Print the complete review report to the terminal.

  **Automation mode:** skip the prompt — automatically proceed to post the comment.

  **Non-automation mode:** ask the user:
  > Review 完成。是否将此报告发布为 PR #<PR_NUMBER> 的评论？(yes/no)
  If the user says **no**, skip posting.

  To post:
  ```

- [ ] **Step 5: 应用改动 E — Step 10 末尾追加 automation-result 输出**

  在 Step 10 末尾（Step 11 之前）追加：

  ````markdown
  **Automation mode only — after posting the comment, output the machine-readable result block:**

  Map the review conclusion to CONCLUSION value:

  | Review 结论   | CONCLUSION  |
  | ------------- | ----------- |
  | ✅ 批准合并   | APPROVED    |
  | ⚠️ 有条件批准 | CONDITIONAL |
  | ❌ 需要修改   | REJECTED    |

  Determine `IS_CRITICAL_PATH` by checking whether the diff contains any of these paths:

  - `src/preload.ts`
  - `src/process/channels/`
  - `src/common/config/`

  ```bash
  git diff origin/<baseRefName>...HEAD --name-only | grep -qE '^(src/preload\.ts|src/process/channels/|src/common/config/)' && echo true || echo false
  ```
  ````

  Output:

  ```
  <!-- automation-result -->
  CONCLUSION: APPROVED
  IS_CRITICAL_PATH: false
  PR_NUMBER: 123
  <!-- /automation-result -->
  ```

  ```

  ```

- [ ] **Step 6: 应用改动 F — Step 11 Cleanup automation 自动删分支**

  找到：

  ````
  Ask the user:

  > 是否删除本地 PR 分支 `<pr_branch>`？(yes/no)

  If yes:

  ```bash
  git branch -D <pr_branch>
  ````

  ```
  替换为：
  ```

  **Automation mode:** delete the local PR branch automatically without prompting:

  ```bash
  git branch -D <pr_branch>
  ```

  **Non-automation mode:** ask the user:

  > 是否删除本地 PR 分支 `<pr_branch>`？(yes/no)

  If yes:

  ```bash
  git branch -D <pr_branch>
  ```

  ```

  ```

- [ ] **Step 7: 确认文件内容正确**

  读取 `.claude/skills/pr-review/SKILL.md`，确认：
  1. Usage 节包含 `--automation` 说明
  2. Step 1 末尾有 flag 检测代码
  3. Step 2 情形 2、3 均有 automation 分支
  4. Step 10 有 automation 自动发布和 automation-result 输出
  5. Step 11 有 automation 自动删分支

- [ ] **Step 8: Commit**

  ```bash
  git add .claude/skills/pr-review/SKILL.md
  git commit -m "feat(pr-review): add automation mode with non-interactive flow and result block"
  ```

---

## Task 3: 新建 pr-automation SKILL.md

**Files:**

- Create: `.claude/skills/pr-automation/SKILL.md`

- [ ] **Step 1: 创建目录（确认不存在）**

  ```bash
  ls .claude/skills/
  ```

  若 `pr-automation/` 不存在，继续下一步（不需要手动 mkdir，Write 工具会创建）。

- [ ] **Step 2: 创建 SKILL.md**

  用 Write 工具写入以下完整内容：

  ````markdown
  ---
  name: pr-automation
  description: |
    PR Automation Orchestrator: poll open PRs, check CI, run review, fix, and merge eligible PRs.
    Use when: (1) Invoked by cron via scripts/pr-automation.sh, (2) User says "/pr-automation".
  ---

  # PR Automation

  Orchestrate the full PR automation lifecycle: select eligible PR → verify CI → review → fix → merge.

  **Announce at start:** "I'm using pr-automation skill to process PRs."

  ## Usage

  ```
  /pr-automation
  ```

  No arguments required. The script `scripts/pr-automation.sh` is the cron entry point.

  ## Configuration

  These values are set directly in this skill file. Update them once during initial deployment:

  ```
  STATUS_ISSUE_NUMBER: <GitHub issue number for the status board>
  REPO: iOfficeAI/AionUi-review
  TRUSTED_CONTRIBUTORS_TEAM: iOfficeAI/trusted-contributors
  CRITICAL_PATH_PATTERN: ^(src/preload\.ts|src/process/channels/|src/common/config/)
  ```

  **STATUS_ISSUE_NUMBER** is the GitHub Issue number for the `[Bot] PR Automation Status` board.
  Create it manually once with title `[Bot] PR Automation Status` and record the number here.

  ---

  ## Steps

  ### Step 1 — Fetch Candidate PRs

  ```bash
  gh pr list \
    --state open \
    --search "created:>=$(date -v-7d '+%Y-%m-%d' 2>/dev/null || date -d '7 days ago' '+%Y-%m-%d') -is:draft" \
    --json number,title,labels,isCrossRepository,createdAt,author \
    --limit 50
  ```

  Save the result as `candidate_prs`.

  If `candidate_prs` is empty: log `[pr-automation] No open PRs found. Exiting.` and go to Step 8 (no-op update).

  ### Step 2 — Get Trusted Contributors

  ```bash
  gh api orgs/iOfficeAI/teams/trusted-contributors/members --jq '[.[].login]'
  ```

  Save as `trusted_logins` (array of GitHub usernames). If the API call fails (e.g. permission denied), treat `trusted_logins` as empty array — all PRs will be treated as non-trusted (FIFO order only).

  ### Step 3 — Select Target PR

  Sort `candidate_prs` using this two-key order:

  1. **Primary**: author.login in `trusted_logins` → trusted PRs first
  2. **Secondary**: createdAt ascending (oldest first / FIFO)

  Iterate through sorted list to find the **first eligible PR**:

  **Skip conditions** (skip this PR, try next):

  | Condition                               | Check                                 |
  | --------------------------------------- | ------------------------------------- |
  | Title contains `WIP` (case-insensitive) | `title.toLowerCase().includes('wip')` |
  | Has label `bot:needs-human-review`      | check labels array                    |
  | Has label `bot:done`                    | check labels array                    |
  | Has label `bot:reviewing`               | check labels array                    |
  | Has label `bot:fixing`                  | check labels array                    |

  **Special: `bot:needs-fix` PR** — do not skip immediately. First check:

  ```bash
  # Last pr-review-bot comment time
  LAST_REVIEW_TIME=$(gh pr view <N> --json comments \
    --jq '[.comments[] | select(.body | startswith("<!-- pr-review-bot -->"))] | last | .createdAt // ""')

  # Latest commit time
  LATEST_COMMIT_TIME=$(gh pr view <N> --json commits \
    --jq '.commits | last | .committedDate')
  ```

  - If `LATEST_COMMIT_TIME > LAST_REVIEW_TIME` (or `LAST_REVIEW_TIME` is empty): new commits exist → remove `bot:needs-fix`, treat as eligible:
    ```bash
    gh pr edit <N> --remove-label "bot:needs-fix"
    ```
  - Otherwise: skip (author has not pushed new commits since last review).

  **When eligible PR found:** immediately add `bot:reviewing` label to claim it:

  ```bash
  gh pr edit <PR_NUMBER> --add-label "bot:reviewing"
  ```

  Save this PR as `target_pr` (number, title, isCrossRepository, author.login).

  **If no eligible PR found after full iteration:** log `[pr-automation] No eligible PR found this round.` and go to Step 8 (no-op update).

  ### Step 4 — Check CI Status

  ```bash
  gh pr view <PR_NUMBER> --json statusCheckRollup \
    --jq '.statusCheckRollup[] | {name: .name, status: .status, conclusion: .conclusion}'
  ```

  **Required jobs:**

  - `Code Quality`
  - `Unit Tests (ubuntu-latest)`
  - `Unit Tests (macos-14)`
  - `Unit Tests (windows-2022)`
  - `Coverage Test`
  - `i18n-check`

  **Decision table:**

  | Condition                                                   | Action                                                                |
  | ----------------------------------------------------------- | --------------------------------------------------------------------- |
  | All required jobs: `status=COMPLETED && conclusion=SUCCESS` | Continue to Step 5                                                    |
  | Any required job: `status=QUEUED` or `IN_PROGRESS`          | Remove `bot:reviewing` → log "CI still running for PR #N" → exit      |
  | `statusCheckRollup` is empty (CI never triggered)           | Attempt workflow approval (see below) → remove `bot:reviewing` → exit |
  | Any required job: `conclusion=FAILURE` or `CANCELLED`       | Post CI failure comment (see below) → remove `bot:reviewing` → exit   |

  **Workflow approval** (CI never triggered — new contributor):

  ```bash
  RUN_IDS=$(gh run list --repo <REPO> --json databaseId,status \
    --jq '.[] | select(.status == "action_required") | .databaseId')
  for RUN_ID in $RUN_IDS; do
    gh run approve "$RUN_ID" --repo <REPO>
  done
  ```

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

  ### Step 5 — Record PR Attributes

  **isExternal:**

  ```bash
  IS_EXTERNAL=$(gh pr view <PR_NUMBER> --json isCrossRepository --jq '.isCrossRepository')
  # true = fork PR, false = internal branch
  ```

  **hasCriticalPathFiles:**

  ```bash
  # Checkout the PR branch first (needed for git diff)
  gh pr checkout <PR_NUMBER>
  BASE_REF=$(gh pr view <PR_NUMBER> --json baseRefName --jq '.baseRefName')
  HAS_CRITICAL=$(git diff origin/${BASE_REF}...HEAD --name-only \
    | grep -qE '^(src/preload\.ts|src/process/channels/|src/common/config/)' && echo true || echo false)
  # Return to original branch
  git checkout -
  ```

  Save `IS_EXTERNAL` and `HAS_CRITICAL` for later steps.

  ### Step 6 — Update Status Issue (starting)

  ```bash
  CURRENT_BODY=$(gh issue view <STATUS_ISSUE_NUMBER> --json body --jq '.body')
  ```

  Replace the line starting with `**当前状态**：` in `CURRENT_BODY` with:

  ```
  **当前状态**：🔍 正在 review PR #<PR_NUMBER> - <title>
  ```

  Also update `**最后运行**：` with the current timestamp:

  ```bash
  date '+%Y-%m-%d %H:%M'
  ```

  ```bash
  gh issue edit <STATUS_ISSUE_NUMBER> --body "<updated_body>"
  ```

  ### Step 7 — Run pr-review (automation mode)

  Invoke the pr-review skill in automation mode:

  ```
  /pr-review <PR_NUMBER> --automation
  ```

  After pr-review completes, parse the `<!-- automation-result -->` block from the conversation:

  ```
  <!-- automation-result -->
  CONCLUSION: APPROVED | CONDITIONAL | REJECTED | CI_FAILED | CI_NOT_READY
  IS_CRITICAL_PATH: true | false
  PR_NUMBER: <number>
  <!-- /automation-result -->
  ```

  Save `CONCLUSION` and `IS_CRITICAL_PATH` (override the value from Step 5 if different — pr-review's check is the authoritative one).

  If the block is missing (pr-review failed unexpectedly): set `CONCLUSION=REJECTED`, log the error, and continue to Step 8.

  ### Step 8 — Execute Decision Matrix

  Based on `CONCLUSION` and `IS_EXTERNAL`:

  #### CONCLUSION = APPROVED

  (Any isExternal)

  1. Post comment:

     ```bash
     gh pr comment <PR_NUMBER> --body "<!-- pr-automation-bot -->
     ✅ 已自动 review，无阻塞性问题，正在触发自动合并。$([ "$HAS_CRITICAL" = "true" ] && echo "

     > ⚠️ **注意**：本 PR 涉及核心路径文件（\`src/preload.ts\` 等），建议人工确认合并后行为是否符合预期。")"
     ```

  2. Trigger auto-merge:
     ```bash
     gh pr merge <PR_NUMBER> --squash --auto
     ```
  3. Add label:
     ```bash
     gh pr edit <PR_NUMBER> --remove-label "bot:reviewing" --add-label "bot:done"
     ```
  4. Set `ACTION_TAKEN="approved-merged"` for Step 9.

  #### CONCLUSION = CONDITIONAL, IS_EXTERNAL = false (internal PR)

  1. Update status issue: `🔧 正在 fix PR #<PR_NUMBER>，结论：有条件批准`
  2. Replace `bot:reviewing` with `bot:fixing`:
     ```bash
     gh pr edit <PR_NUMBER> --remove-label "bot:reviewing" --add-label "bot:fixing"
     ```
  3. Run pr-fix in automation mode:
     ```
     /pr-fix <PR_NUMBER> --automation
     ```
  4. After pr-fix completes, check for `SKIP_EXTERNAL` signal in conversation (should not happen for internal PRs, but guard anyway). If no signal: trigger auto-merge:
     ```bash
     gh pr merge <PR_NUMBER> --squash --auto
     ```
  5. Update labels:
     ```bash
     gh pr edit <PR_NUMBER> --remove-label "bot:fixing" --add-label "bot:done"
     ```
  6. Update status issue: `⏳ PR #<PR_NUMBER> fix 完成，等待 CI 通过后自动合并`
  7. Set `ACTION_TAKEN="conditional-fixed-merged"` for Step 9.

  #### CONCLUSION = CONDITIONAL, IS_EXTERNAL = true (fork PR)

  1. Post comment with full review report link:

     ```bash
     gh pr comment <PR_NUMBER> --body "<!-- pr-automation-bot -->
     ⚠️ 本 PR 已完成自动 review，存在若干需修复的问题（详见上方 review 报告）。

     请按报告修复所有问题后重新 push。修复完成后本系统将自动重新 review。$([ "$HAS_CRITICAL" = "true" ] && echo "

     > ⚠️ **注意**：本 PR 涉及核心路径文件（\`src/preload.ts\` 等），建议人工确认合并后行为是否符合预期。")"
     ```

  2. Update labels:
     ```bash
     gh pr edit <PR_NUMBER> --remove-label "bot:reviewing" --add-label "bot:needs-fix"
     ```
  3. Set `ACTION_TAKEN="conditional-needs-fix"` for Step 9.

  #### CONCLUSION = REJECTED (any isExternal)

  1. Post comment:

     ```bash
     gh pr comment <PR_NUMBER> --body "<!-- pr-automation-bot -->
     ❌ 本 PR 存在阻塞性问题，无法自动处理，已转交人工 review。详见上方 review 报告。$([ "$HAS_CRITICAL" = "true" ] && echo "

     > ⚠️ **注意**：本 PR 涉及核心路径文件（\`src/preload.ts\` 等），建议人工确认合并后行为是否符合预期。")"
     ```

  2. Update labels:
     ```bash
     gh pr edit <PR_NUMBER> --remove-label "bot:reviewing" --add-label "bot:needs-human-review"
     ```
  3. Set `ACTION_TAKEN="rejected-human-review"` for Step 9.

  #### CONCLUSION = CI_FAILED or CI_NOT_READY

  These are safety cases (pr-automation's Step 4 should have caught CI issues). If they slip through:

  1. Remove `bot:reviewing` label:
     ```bash
     gh pr edit <PR_NUMBER> --remove-label "bot:reviewing"
     ```
  2. Log: `[pr-automation] PR #<PR_NUMBER> CI not ready or failed at pr-review stage. Skipping.`
  3. Set `ACTION_TAKEN="ci-skipped"` for Step 9.

  ### Step 9 — Update Status Issue (completion)

  Fetch current issue body:

  ```bash
  CURRENT_BODY=$(gh issue view <STATUS_ISSUE_NUMBER> --json body --jq '.body')
  ```

  **If a `target_pr` was processed** (Step 3 found a PR):

  1. Map `ACTION_TAKEN` to display strings:

     | ACTION_TAKEN             | 结论列                   | 操作列               |
     | ------------------------ | ------------------------ | -------------------- |
     | approved-merged          | ✅ 批准合并              | 已触发自动合并       |
     | conditional-fixed-merged | ⚠️ 有条件批准            | 已 fix，等待 CI 合并 |
     | conditional-needs-fix    | ⚠️ 有条件批准（外部 PR） | 已通知作者修复       |
     | rejected-human-review    | ❌ 需要修改              | 转人工               |
     | ci-skipped               | ⏳ CI 未就绪             | 跳过                 |

  2. Prepend a new row to the `## 最近处理记录` table (keep at most 10 rows, drop oldest):

     ```
     | <timestamp> | #<PR_NUMBER> <title> | <结论> | <操作> |
     ```

  3. Replace `**当前状态**：` line with:

     ```
     **当前状态**：💤 空闲，等待下次 cron 触发
     ```

  **If no PR was processed** (`target_pr` is null):

  1. Replace `**当前状态**：` line with:

     ```
     **当前状态**：💤 本轮无符合条件的 PR
     ```

  Update the issue:

  ```bash
  gh issue edit <STATUS_ISSUE_NUMBER> --body "<updated_body>"
  ```

  ---

  ## Mandatory Rules

  - **Single PR per instance** — each Claude instance processes exactly one PR per run
  - **bot:reviewing is a mutex** — always set it immediately when claiming a PR, before any processing
  - **Clean up on skip** — whenever skipping a PR mid-flow (CI not ready, unexpected error), always remove `bot:reviewing` first
  - **No AI signature** — no `Co-Authored-By`, no `Generated with` in any comment or commit
  - **Label atomicity** — when swapping labels (e.g. `bot:reviewing` → `bot:fixing`), do both in a single `gh pr edit` call
  ````

- [ ] **Step 3: 确认文件已创建**

  ```bash
  ls .claude/skills/pr-automation/
  ```

  Expected: `SKILL.md`

- [ ] **Step 4: Commit**

  ```bash
  git add .claude/skills/pr-automation/SKILL.md
  git commit -m "feat(pr-automation): add main orchestrator skill"
  ```

---

## Task 4: 新建 scripts/pr-automation.sh

**Files:**

- Create: `scripts/pr-automation.sh`

**注意:** `scripts/` 目录已有 18 个文件（超出 10 个子项限制），但这是既有状态，按设计文档创建此文件即可。

- [ ] **Step 1: 创建脚本文件**

  用 Write 工具写入：

  ```bash
  #!/usr/bin/env bash
  # pr-automation.sh — cron entry point for PR automation
  # Usage: ./scripts/pr-automation.sh [N]
  #   N: number of parallel Claude instances (default: 1)
  set -euo pipefail

  N=${1:-1}
  LOCK_FILE="/tmp/pr-automation.lock"
  REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
  LOG_TS() { date '+%Y-%m-%d %H:%M:%S'; }

  # ---------------------------------------------------------------------------
  # Cleanup: remove lock file and stale bot labels
  # ---------------------------------------------------------------------------
  cleanup_labels() {
    cd "$REPO_DIR"
    local nums
    nums=$(gh pr list --state open --label "bot:reviewing" --json number \
      --jq '.[].number' 2>/dev/null || true)
    if [ -n "$nums" ]; then
      echo "$nums" | xargs -I{} gh pr edit {} --remove-label "bot:reviewing" 2>/dev/null || true
    fi
    nums=$(gh pr list --state open --label "bot:fixing" --json number \
      --jq '.[].number' 2>/dev/null || true)
    if [ -n "$nums" ]; then
      echo "$nums" | xargs -I{} gh pr edit {} --remove-label "bot:fixing" 2>/dev/null || true
    fi
  }

  cleanup() {
    echo "[$(LOG_TS)] Cleaning up lock file and stale labels..."
    rm -f "$LOCK_FILE"
    cleanup_labels
  }

  # Register cleanup for normal exit, interrupt, and termination
  trap cleanup EXIT INT TERM

  # ---------------------------------------------------------------------------
  # Lock file check (PID-based)
  # ---------------------------------------------------------------------------
  if [ -f "$LOCK_FILE" ]; then
    PREV_PID=$(cat "$LOCK_FILE")
    if kill -0 "$PREV_PID" 2>/dev/null; then
      echo "[$(LOG_TS)] Previous run (PID $PREV_PID) is still running. Exiting without cleanup."
      # Disable trap so we don't interfere with the running instance
      trap - EXIT INT TERM
      exit 0
    else
      echo "[$(LOG_TS)] Previous run (PID $PREV_PID) appears to have crashed. Cleaning up stale labels..."
      cleanup_labels
      rm -f "$LOCK_FILE"
    fi
  fi

  # Write current script PID to lock file
  echo $$ > "$LOCK_FILE"
  echo "[$(LOG_TS)] PR automation started. PID: $$, instances: $N"

  # ---------------------------------------------------------------------------
  # Launch N Claude instances
  # ---------------------------------------------------------------------------
  cd "$REPO_DIR"
  declare -a PIDS=()

  for i in $(seq 1 "$N"); do
    echo "[$(LOG_TS)] Launching instance $i of $N..."
    claude --dangerously-skip-permissions -p "/pr-automation" &
    PIDS+=($!)
  done

  # Wait for all instances to complete
  EXIT_CODE=0
  for PID in "${PIDS[@]}"; do
    if ! wait "$PID"; then
      echo "[$(LOG_TS)] Instance (PID $PID) exited with non-zero status."
      EXIT_CODE=1
    fi
  done

  echo "[$(LOG_TS)] All instances completed. Exit code: $EXIT_CODE"
  # cleanup is called automatically via trap EXIT
  exit "$EXIT_CODE"
  ```

- [ ] **Step 2: 赋予执行权限**

  ```bash
  chmod +x scripts/pr-automation.sh
  ```

- [ ] **Step 3: 验证语法**

  ```bash
  bash -n scripts/pr-automation.sh
  ```

  Expected: 无输出（语法正确）

- [ ] **Step 4: 手动测试 Lock 逻辑（dry run）**

  验证脚本在 lock 文件已存在但 PID 不存在时正常清理并继续：

  ```bash
  # 写一个不存在的 PID
  echo 99999 > /tmp/pr-automation.lock
  # 运行脚本 —— 它应该识别到 crash 并清理，然后因为没有 claude 命令可能报错
  # 重要的是 lock 文件行为正确
  ```

  确认脚本打印 "Previous run ... appears to have crashed" 日志。

  注意：完整端到端测试需要 `claude` 命令可用并指向真实仓库，留到部署时验证。

- [ ] **Step 5: Commit**

  ```bash
  git add scripts/pr-automation.sh
  git commit -m "feat(scripts): add pr-automation.sh entry script with PID-based lock"
  ```

---

## Task 5: 新建 docs/conventions/pr-automation.md

**Files:**

- Create: `docs/conventions/pr-automation.md`

- [ ] **Step 1: 确认 docs/conventions/ 目录存在**

  ```bash
  ls docs/conventions/
  ```

- [ ] **Step 2: 创建文档**

  用 Write 工具写入：

  ````markdown
  # PR 自动化流程说明

  本仓库运行 PR 自动化 agent，定期处理 open PR（review、fix、合并）。本文说明 label 体系、触发条件和人工介入方式。

  ---

  ## Label 体系

  所有自动化状态通过 `bot:` 前缀 label 追踪，无需本地状态文件。

  | Label                    | 含义                          | 下一步                           |
  | ------------------------ | ----------------------------- | -------------------------------- |
  | `bot:reviewing`          | 正在 review 中（防并发占位）  | 等待完成后自动移除               |
  | `bot:fixing`             | 正在 fix 中（防并发占位）     | 等待完成后自动移除               |
  | `bot:needs-fix`          | 已 review，等待作者按报告修复 | 作者推送新 commit 后自动重新处理 |
  | `bot:needs-human-review` | 需人工介入（存在阻塞性问题）  | 人工处理后手动移除 label         |
  | `bot:done`               | 已完成（已合并或无需操作）    | 无                               |

  ---

  ## 触发条件

  - cron 每 30 分钟运行一次 `scripts/pr-automation.sh`
  - 每次运行选取**一个**符合条件的 open PR 处理（多实例时各自独立选取）
  - 优先处理 trusted-contributors 团队成员的 PR；同优先级按创建时间 FIFO

  ### 跳过条件

  满足以下任一条件的 PR 本轮跳过：

  - 标题含 `WIP`（大小写不敏感）
  - 已有 `bot:needs-human-review`
  - 已有 `bot:done`
  - 已有 `bot:reviewing` 或 `bot:fixing`（正在处理中）
  - 有 `bot:needs-fix` 但作者尚未推送新 commit

  ### CI 要求

  以下 job 全部通过才会继续处理，否则本轮跳过并发评论提醒：

  - `Code Quality`
  - `Unit Tests (ubuntu-latest)`
  - `Unit Tests (macos-14)`
  - `Unit Tests (windows-2022)`
  - `Coverage Test`
  - `i18n-check`

  ---

  ## 决策矩阵

  | Review 结论   | PR 来源   | 行动                                |
  | ------------- | --------- | ----------------------------------- |
  | ✅ 批准合并   | 任意      | 自动合并（squash）                  |
  | ⚠️ 有条件批准 | 内部分支  | 自动修复 → 自动合并                 |
  | ⚠️ 有条件批准 | 外部 fork | 评论通知作者修复 → `bot:needs-fix`  |
  | ❌ 需要修改   | 任意      | 评论说明 → `bot:needs-human-review` |

  合并使用 `--squash --auto`：等所有必检 CI 通过后才执行，不会立即强制合并。

  ---

  ## 人工介入

  ### 阻止自动处理某 PR

  - 在标题加 `WIP`，或
  - 手动打 `bot:needs-human-review` label

  移除 `bot:needs-human-review` 后，下一轮 cron 会重新处理该 PR。

  ### 查看运行状态

  - **实时日志**：`tail -f /var/log/pr-automation.log`
  - **状态看板**：搜索 Issue 标题 `[Bot] PR Automation Status`（本仓库内）

  ### 并发控制

  - Lock 文件：`/tmp/pr-automation.lock`（存储运行中的脚本 PID）
  - 若上轮脚本仍在运行，本轮 cron 自动退出
  - 若上轮脚本异常崩溃，下轮自动清理残留 label 并重新开始

  ---

  ## Cron 配置参考

  ```cron
  # 单实例（默认）
  */30 * * * * cd /path/to/AionUi-review && ./scripts/pr-automation.sh >> /var/log/pr-automation.log 2>&1

  # 并行处理（传入实例数）
  */30 * * * * cd /path/to/AionUi-review && ./scripts/pr-automation.sh 2 >> /var/log/pr-automation.log 2>&1
  ```

  ---

  ## 首次部署

  1. 确认 `gh auth login` 已完成，有足够权限（PR labels、issues、合并）
  2. 手动创建 GitHub Issue，标题：`[Bot] PR Automation Status`，记录 Issue 编号
  3. 在 `.claude/skills/pr-automation/SKILL.md` 的 `STATUS_ISSUE_NUMBER` 填入该编号
  4. 配置 crontab（见上方参考）
  5. 手动运行一次验证：`./scripts/pr-automation.sh` 并观察日志
  ````

- [ ] **Step 3: 确认文件已创建**

  ```bash
  ls docs/conventions/pr-automation.md
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add docs/conventions/pr-automation.md
  git commit -m "docs(conventions): add pr-automation operational guide"
  ```

---

## Task 6: 更新 AGENTS.md — 新增 PR 自动化简介

**Files:**

- Modify: `AGENTS.md`

- [ ] **Step 1: 读取 AGENTS.md，找到 Skills Index 表格末尾**

  在 Skills Index 表之后、文档末尾之前，找到合适的位置（通常在 `## Internationalization` 之前）。

- [ ] **Step 2: 在 Skills Index 表后插入 PR 自动化章节**

  用 Edit 工具找到 `## Internationalization` 章节标题，在其前插入：

  ```markdown
  ## PR 自动化流程

  本仓库运行 PR 自动化 agent，定期处理 open PR（review、fix、合并）。

  - **运行方式**：本地 cron 每 30 分钟触发 `scripts/pr-automation.sh`
  - **状态追踪**：通过 `bot:*` label（`bot:reviewing`、`bot:fixing`、`bot:needs-fix`、`bot:needs-human-review`、`bot:done`）
  - **阻止处理**：在 PR 标题加 `WIP` 或手动打 `bot:needs-human-review` label
  - **详细说明**：[docs/conventions/pr-automation.md](docs/conventions/pr-automation.md)
  ```

- [ ] **Step 3: 确认 Skills Index 表格也需要添加 pr-automation 条目**

  找到 Skills Index 表格，在末尾追加一行：

  ```markdown
  | **pr-automation** | PR 自动化编排（cron 触发，review + fix + 合并） | cron 运行、`/pr-automation` |
  ```

- [ ] **Step 4: 确认内容正确**

  读取 `AGENTS.md`，验证：
  1. Skills Index 表格有 `pr-automation` 条目
  2. 存在 `## PR 自动化流程` 章节并引用了 `docs/conventions/pr-automation.md`

- [ ] **Step 5: Commit**

  ```bash
  git add AGENTS.md
  git commit -m "docs(agents): add PR automation section and skill index entry"
  ```

---

## 验证清单（全部任务完成后）

- [ ] `bash -n scripts/pr-automation.sh` — 无语法错误
- [ ] `.claude/skills/pr-automation/SKILL.md` 存在
- [ ] `.claude/skills/pr-review/SKILL.md` 包含 `--automation` 和 `<!-- automation-result -->`
- [ ] `.claude/skills/pr-fix/SKILL.md` 不含 LOW 询问段落，包含 `SKIP_EXTERNAL`
- [ ] `docs/conventions/pr-automation.md` 存在，含 label 体系、决策矩阵和部署步骤
- [ ] `AGENTS.md` 含 `pr-automation` skill 条目和 PR 自动化章节
- [ ] `git log --oneline -10` 显示 6 个对应 commit

## 首次部署检查项（代码完成后）

- [ ] 手动创建 GitHub Issue `[Bot] PR Automation Status`，将编号填入 `.claude/skills/pr-automation/SKILL.md`
- [ ] `gh auth status` 确认有 PR label / issue / merge 权限
- [ ] 手动执行 `./scripts/pr-automation.sh` 观察日志输出
- [ ] 确认 lock 文件在运行结束后自动清理
- [ ] 配置 crontab
