# PR 自动化改造实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 PR 自动化系统从 cron + 并发模式改造为单进程守护进程模式，实现以 label 为状态机的异步处理流程，利用 admin 权限直接修复任意 PR（含外部 fork）。

**Architecture:**

- 守护进程替代 cron：无限循环，每次只起一个 Claude，超时自动 kill
- Label 状态机：新增 `bot:ready-to-fix`，去掉 `bot:needs-fix`，review 和 fix 跨 session 异步执行
- Exit 规则：任何实质操作后 EXIT；纯 skip 继续找下一个 PR
- 评论去重：CI 失败评论和 merge conflict 评论均检查"最新 commit 是否晚于已有评论"，避免重复发送
- pr-fix 统一走 Path B（直推分支），admin token 可推外部 fork
- 合并冲突自动 rebase 解决，失败时 fallback 转人工
- 去掉 GitHub Issue 状态看板，只保留日志

**Tech Stack:** bash, `gh` CLI, Claude Code CLI (`claude --dangerously-skip-permissions`)

---

## Label 体系（最终版）

| Label                    | 含义                                                  | 终态？ |
| ------------------------ | ----------------------------------------------------- | ------ |
| `bot:reviewing`          | review 进行中（mutex）                                | 否     |
| `bot:ready-to-fix`       | CONDITIONAL review 完成，等 bot 下次 session 执行 fix | 否     |
| `bot:fixing`             | fix 进行中（mutex）                                   | 否     |
| `bot:needs-human-review` | 需人工介入（阻塞性问题或冲突无法自动解决）            | ✅     |
| `bot:done`               | 已完成                                                | ✅     |

`bot:needs-fix` 完全移除（admin 权限可直接修改任意 PR，无需要求作者手动修复）。

## Exit 规则

| 操作类型                                                          | 行为            |
| ----------------------------------------------------------------- | --------------- |
| skip（WIP、draft、已有终态 label、CI 跑中、mergeability UNKNOWN） | 继续找下一个 PR |
| CI 失败评论（去重后决定发送）                                     | EXIT            |
| approve workflow                                                  | EXIT            |
| merge conflict 处理（rebase 或评论）                              | EXIT            |
| review 完成（任何结论）                                           | EXIT            |
| pr-fix 完成（push）                                               | EXIT            |

## 完整执行流程

```
选 PR（优先 bot:ready-to-fix > trusted > FIFO）
 │
 ├─ 无 PR → EXIT
 │
 ├─ bot:ready-to-fix → 重新检查 CI
 │     ├─ CI 跑中/失败 → 移除 bot:ready-to-fix，重入队列 → EXIT
 │     └─ CI 过 → pr-fix → push → --auto → bot:done → EXIT
 │
 └─ 新鲜 PR（无 bot: label）→ 加 bot:reviewing → 检查 CI
       ├─ 从未触发 → approve workflow → EXIT
       ├─ CI 跑中 → 移除 bot:reviewing → 找下一个
       ├─ CI 失败 → 去重检查
       │     ├─ 已有评论 且 无新 commit → 移除 bot:reviewing → 找下一个
       │     └─ 无评论 或 有新 commit → 发评论 → EXIT
       └─ CI 过 → 检查 merge conflict
             ├─ UNKNOWN → 移除 bot:reviewing → 找下一个
             ├─ CONFLICTING → 去重检查
             │     ├─ 已有冲突评论 且 无新 commit → 移除 bot:reviewing → 找下一个
             │     └─ 无评论 或 有新 commit →
             │           尝试自动 rebase
             │             ├─ 成功 → push → EXIT（CI 重跑）
             │             └─ 失败 → 发评论 + bot:needs-human-review → EXIT
             └─ MERGEABLE → pr-review
                   ├─ APPROVED → --auto merge → bot:done → EXIT
                   ├─ CONDITIONAL → bot:ready-to-fix → EXIT
                   └─ REJECTED → bot:needs-human-review → EXIT
```

---

## 文件变更清单

| 文件                                    | 操作 | 说明                                                                                                        |
| --------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------- |
| `scripts/pr-automation.sh`              | 重写 | cron 入口 → 守护进程（无限循环、单 claude、超时 kill、详细日志）                                            |
| `.claude/skills/pr-automation/SKILL.md` | 重写 | 新状态机逻辑、bot:ready-to-fix、exit 规则、评论去重、合并冲突自动 rebase、去掉看板/isExternal/bot:needs-fix |
| `.claude/skills/pr-fix/SKILL.md`        | 修改 | 去掉 Path A、去掉 SKIP_EXTERNAL 信号、isCrossRepository 不再影响路径                                        |
| `docs/conventions/pr-automation.md`     | 重写 | 同步所有变更：daemon、新 label 体系、新决策矩阵                                                             |

---

## Task 1：重写 `scripts/pr-automation.sh` 为守护进程

**Files:**

- Modify: `scripts/pr-automation.sh`

- [ ] **Step 1: 完整替换脚本内容**

新脚本核心行为：

- 无限循环，每次只启动一个 `claude` 进程
- 每 5 秒轮询 claude 进程是否存活，超过 `MAX_CLAUDE_SECS` 则 kill
- SIGTERM/SIGINT 时优雅退出（kill claude、清理 label、删 PID 文件）
- 单实例守护（PID 文件检测）

```bash
#!/usr/bin/env bash
# pr-automation.sh — daemon entry point for PR automation
# Runs continuously: launch one Claude instance, wait, sleep, repeat.
#
# Environment variables:
#   SLEEP_SECONDS   Seconds to sleep between Claude runs (default: 30)
#   MAX_CLAUDE_SECS Maximum seconds a Claude run may take (default: 3600)
#   LOG_FILE        Log file path (default: /tmp/pr-automation.log)
set -euo pipefail

SLEEP_SECONDS=${SLEEP_SECONDS:-30}
MAX_CLAUDE_SECS=${MAX_CLAUDE_SECS:-3600}
LOG_FILE=${LOG_FILE:-/tmp/pr-automation.log}
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="/tmp/pr-automation-daemon.pid"

log() {
  local level="$1"; shift
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $*" | tee -a "$LOG_FILE"
}
log_info()  { log "INFO " "$@"; }
log_warn()  { log "WARN " "$@"; }
log_error() { log "ERROR" "$@"; }

cleanup_labels() {
  log_info "Cleaning up residual bot:reviewing / bot:fixing / bot:ready-to-fix labels..."
  local nums
  for label in "bot:reviewing" "bot:fixing" "bot:ready-to-fix"; do
    nums=$(gh pr list --state open --label "$label" --json number \
      --jq '.[].number' 2>/dev/null || true)
    if [ -n "$nums" ]; then
      echo "$nums" | xargs -I{} gh pr edit {} --remove-label "$label" 2>/dev/null || true
      log_info "Removed $label from: $nums"
    fi
  done
}

CURRENT_CLAUDE_PID=""
shutdown() {
  log_info "Shutdown signal received. Stopping daemon..."
  if [ -n "$CURRENT_CLAUDE_PID" ] && kill -0 "$CURRENT_CLAUDE_PID" 2>/dev/null; then
    log_warn "Killing current Claude process (PID $CURRENT_CLAUDE_PID)..."
    kill "$CURRENT_CLAUDE_PID" 2>/dev/null || true
    sleep 5
    kill -9 "$CURRENT_CLAUDE_PID" 2>/dev/null || true
  fi
  cleanup_labels
  rm -f "$PID_FILE"
  log_info "Daemon stopped."
  exit 0
}
trap shutdown SIGTERM SIGINT

if [ -f "$PID_FILE" ]; then
  PREV_PID=$(cat "$PID_FILE")
  if kill -0 "$PREV_PID" 2>/dev/null; then
    log_warn "Another daemon instance is already running (PID $PREV_PID). Exiting."
    exit 1
  else
    log_warn "Stale PID file found (PID $PREV_PID no longer running). Cleaning up..."
    cleanup_labels
    rm -f "$PID_FILE"
  fi
fi

echo $$ > "$PID_FILE"
log_info "PR automation daemon started. PID=$$, SLEEP_SECONDS=$SLEEP_SECONDS, MAX_CLAUDE_SECS=$MAX_CLAUDE_SECS"
log_info "Log file: $LOG_FILE | Repo dir: $REPO_DIR"

ITERATION=0
cd "$REPO_DIR"

while true; do
  ITERATION=$((ITERATION + 1))
  log_info "=== Iteration $ITERATION: starting Claude run ==="

  claude --dangerously-skip-permissions -p "/pr-automation" \
    >> "$LOG_FILE" 2>&1 &
  CURRENT_CLAUDE_PID=$!
  log_info "Claude launched (PID $CURRENT_CLAUDE_PID). Timeout: ${MAX_CLAUDE_SECS}s."

  ELAPSED=0
  TIMED_OUT=false
  while kill -0 "$CURRENT_CLAUDE_PID" 2>/dev/null; do
    sleep 5
    ELAPSED=$((ELAPSED + 5))
    if [ "$ELAPSED" -ge "$MAX_CLAUDE_SECS" ]; then
      log_warn "Claude run exceeded ${MAX_CLAUDE_SECS}s (PID $CURRENT_CLAUDE_PID). Killing..."
      kill "$CURRENT_CLAUDE_PID" 2>/dev/null || true
      sleep 5
      kill -9 "$CURRENT_CLAUDE_PID" 2>/dev/null || true
      cleanup_labels
      TIMED_OUT=true
      break
    fi
  done

  if [ "$TIMED_OUT" = "true" ]; then
    log_warn "Iteration $ITERATION: Claude timed out after ${MAX_CLAUDE_SECS}s."
  else
    EXIT_CODE=0
    wait "$CURRENT_CLAUDE_PID" 2>/dev/null || EXIT_CODE=$?
    if [ "$EXIT_CODE" -eq 0 ]; then
      log_info "Iteration $ITERATION: Claude exited successfully."
    else
      log_warn "Iteration $ITERATION: Claude exited with code $EXIT_CODE."
    fi
  fi

  CURRENT_CLAUDE_PID=""
  log_info "Sleeping ${SLEEP_SECONDS}s before next iteration..."
  sleep "$SLEEP_SECONDS"
done
```

- [ ] **Step 2: 验证脚本语法**

```bash
bash -n scripts/pr-automation.sh
```

Expected: no output (syntax OK)

- [ ] **Step 3: Commit**

```bash
git add scripts/pr-automation.sh
git commit -m "feat(pr-automation): replace cron script with daemon loop (single claude, timeout kill, detailed logging)"
```

---

## Task 2：重写 `pr-automation` SKILL.md

**Files:**

- Modify: `.claude/skills/pr-automation/SKILL.md`

完整重写，体现最终状态机逻辑。用新内容全量替换旧文件。

- [ ] **Step 1: 用以下内容完整替换 `.claude/skills/pr-automation/SKILL.md`**

```markdown
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
CRITICAL_PATH_PATTERN: ^(src/preload\.ts|src/process/channels/|src/common/config/)

````

**REPO** is detected automatically at runtime — do not hardcode it:

```bash
REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner')
ORG=$(echo "$REPO" | cut -d'/' -f1)
````

## Label State Machine

| Label                    | Meaning                                                      | Terminal? |
| ------------------------ | ------------------------------------------------------------ | --------- |
| `bot:reviewing`          | Review in progress (mutex)                                   | No        |
| `bot:ready-to-fix`       | CONDITIONAL review done, waiting for bot to fix next session | No        |
| `bot:fixing`             | Fix in progress (mutex)                                      | No        |
| `bot:needs-human-review` | Human intervention required                                  | Yes       |
| `bot:done`               | Completed                                                    | Yes       |

## Exit Rules

- **Any substantive action** (approve workflow, post comment, run review, run fix) → EXIT after completing
- **Pure skip** (WIP, draft, terminal label, CI running, mergeability unknown) → continue to find next PR in same session

---

## Steps

### Step 1 — Fetch Candidate PRs

```bash
gh pr list \
  --state open \
  --search "created:>=$(date -v-7d '+%Y-%m-%d' 2>/dev/null || date -d '7 days ago' '+%Y-%m-%d') -is:draft" \
  --json number,title,labels,createdAt,author \
  --limit 50
```

Save the result as `candidate_prs`.

If `candidate_prs` is empty: log `[pr-automation] No open PRs found. Exiting.` and EXIT.

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

| Condition                               | Check                                 |
| --------------------------------------- | ------------------------------------- |
| Title contains `WIP` (case-insensitive) | `title.toLowerCase().includes('wip')` |
| Has label `bot:needs-human-review`      | check labels array                    |
| Has label `bot:done`                    | check labels array                    |
| Has label `bot:reviewing`               | check labels array                    |
| Has label `bot:fixing`                  | check labels array                    |

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

**If no eligible PR found after full iteration:** log `[pr-automation] No eligible PR found this round.` and EXIT.

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

**EXIT.** (PR re-enters normal queue with no bot: label → will be fully re-reviewed next round)

If no new commits, continue below.

**Re-check CI** (new commits may have been pushed since review):

```bash
gh pr view <PR_NUMBER> --json statusCheckRollup \
  --jq '.statusCheckRollup[] | {name: .name, status: .status, conclusion: .conclusion}'
```

Required jobs: `Code Quality`, `Unit Tests (ubuntu-latest)`, `Unit Tests (macos-14)`, `Unit Tests (windows-2022)`, `Coverage Test`, `i18n-check`

| Condition                     | Action                                                              |
| ----------------------------- | ------------------------------------------------------------------- |
| All required jobs SUCCESS     | Continue to pr-fix below                                            |
| Any job QUEUED or IN_PROGRESS | Remove `bot:fixing` → log "CI still running for PR #N" → EXIT       |
| Any job FAILURE or CANCELLED  | Remove `bot:fixing` → log "CI failed for PR #N, re-queueing" → EXIT |

**Run pr-fix:**

```
/pr-fix <PR_NUMBER> --automation
```

After pr-fix completes:

```bash
gh pr merge <PR_NUMBER> --squash --auto
gh pr edit <PR_NUMBER> --remove-label "bot:fixing" --add-label "bot:done"
```

Log: `[pr-automation] PR #<PR_NUMBER> fix complete, auto-merge triggered.`

**EXIT.**

### Step 4 — Check CI Status

```bash
gh pr view <PR_NUMBER> --json statusCheckRollup \
  --jq '.statusCheckRollup[] | {name: .name, status: .status, conclusion: .conclusion}'
```

Required jobs: `Code Quality`, `Unit Tests (ubuntu-latest)`, `Unit Tests (macos-14)`, `Unit Tests (windows-2022)`, `Coverage Test`, `i18n-check`

| Condition                                      | Action                                                                       |
| ---------------------------------------------- | ---------------------------------------------------------------------------- |
| All required jobs SUCCESS                      | Continue to Step 4.5                                                         |
| Any job QUEUED or IN_PROGRESS                  | Remove `bot:reviewing` → log "CI still running for PR #N" → **find next PR** |
| `statusCheckRollup` empty (CI never triggered) | Approve workflow (see below) → remove `bot:reviewing` → **EXIT**             |
| Any job FAILURE or CANCELLED                   | Check dedup (see below) → **find next PR** or post comment → **EXIT**        |

**Workflow approval** (CI never triggered):

```bash
RUN_IDS=$(gh run list --repo "$REPO" --json databaseId,status \
  --jq '.[] | select(.status == "action_required") | .databaseId')
for RUN_ID in $RUN_IDS; do
  gh run approve "$RUN_ID" --repo "$REPO"
done
```

Log: `[pr-automation] Approved workflow runs for PR #<PR_NUMBER>.`

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
  No new commits since last CI failure comment — remove `bot:reviewing` → **find next PR** (no new comment)

- Otherwise: post CI failure comment below → remove `bot:reviewing` → **EXIT**

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

| `mergeable`   | Action                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------- |
| `MERGEABLE`   | Continue to Step 5                                                                           |
| `UNKNOWN`     | Remove `bot:reviewing` → log "Mergeability unknown for PR #N, will retry" → **find next PR** |
| `CONFLICTING` | Run conflict dedup check (see below)                                                         |

**Merge conflict dedup check:**

```bash
# Last conflict bot comment time
LAST_CONFLICT_COMMENT_TIME=$(gh pr view <PR_NUMBER> --json comments \
  --jq '[.comments[] | select(.body | test("<!-- pr-review-bot -->") and test("合并冲突"))] | last | .createdAt // ""')

LATEST_COMMIT_TIME=$(gh pr view <PR_NUMBER> --json commits \
  --jq '.commits | last | .committedDate')
```

- If `LAST_CONFLICT_COMMENT_TIME` is non-empty AND `LATEST_COMMIT_TIME <= LAST_CONFLICT_COMMENT_TIME`:
  No new commits — remove `bot:reviewing` → **find next PR** (no new action)

- Otherwise: attempt auto-rebase below.

**Auto-rebase attempt:**

```bash
git fetch origin
git checkout <head_branch>
git pull origin <head_branch>
git rebase origin/<base_branch>
```

If rebase succeeds, run quality check:

```bash
bunx tsc --noEmit
bun run lint:fix
```

If quality check passes:

```bash
git push --force-with-lease origin <head_branch>
git checkout -
gh pr edit <PR_NUMBER> --remove-label "bot:reviewing"
```

Log: `[pr-automation] Resolved merge conflicts for PR #<PR_NUMBER>, pushed rebase.`

**EXIT** (CI re-triggers automatically).

**Fallback** — if rebase fails OR quality check fails:

```bash
git rebase --abort 2>/dev/null || true
git checkout - 2>/dev/null || true
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

**EXIT.**

### Step 5 — Check Critical Path Files

```bash
gh pr checkout <PR_NUMBER>
BASE_REF=$(gh pr view <PR_NUMBER> --json baseRefName --jq '.baseRefName')
HAS_CRITICAL=$(git diff origin/${BASE_REF}...HEAD --name-only \
  | grep -qE '^(src/preload\.ts|src/process/channels/|src/common/config/)' && echo true || echo false)
git checkout -
```

Save `HAS_CRITICAL` for later steps.

### Step 6 — Run pr-review (automation mode)

```
/pr-review <PR_NUMBER> --automation
```

After pr-review completes, parse the `<!-- automation-result -->` block:

```
<!-- automation-result -->
CONCLUSION: APPROVED | CONDITIONAL | REJECTED | CI_FAILED | CI_NOT_READY
IS_CRITICAL_PATH: true | false
PR_NUMBER: <number>
<!-- /automation-result -->
```

Save `CONCLUSION` and `IS_CRITICAL_PATH` (override Step 5 value if different).

If block is missing: set `CONCLUSION=REJECTED`, log the error, continue to Step 7.

### Step 7 — Execute Decision Matrix

#### CONCLUSION = APPROVED

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
3. Update labels:
   ```bash
   gh pr edit <PR_NUMBER> --remove-label "bot:reviewing" --add-label "bot:done"
   ```
4. Log: `[pr-automation] PR #<PR_NUMBER> approved, auto-merge triggered.`
5. **EXIT.**

#### CONCLUSION = CONDITIONAL

1. Update labels (defer pr-fix to next session):
   ```bash
   gh pr edit <PR_NUMBER> --remove-label "bot:reviewing" --add-label "bot:ready-to-fix"
   ```
2. Log: `[pr-automation] PR #<PR_NUMBER> CONDITIONAL — marked bot:ready-to-fix for next session.`
3. **EXIT.**

#### CONCLUSION = REJECTED

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
3. Log: `[pr-automation] PR #<PR_NUMBER> rejected, transferred to human review.`
4. **EXIT.**

#### CONCLUSION = CI_FAILED or CI_NOT_READY

Safety fallback (Step 4 should have caught these):

1. Remove `bot:reviewing`:
   ```bash
   gh pr edit <PR_NUMBER> --remove-label "bot:reviewing"
   ```
2. Log: `[pr-automation] PR #<PR_NUMBER> CI not ready at pr-review stage. Skipping.`
3. **EXIT.**

---

## Mandatory Rules

- **Single heavy action per session** — review OR fix, then EXIT
- **bot:reviewing / bot:fixing are mutexes** — always set immediately when claiming a PR
- **Clean up on skip** — whenever skipping a PR mid-flow, always remove `bot:reviewing` first
- **No AI signature** — no `Co-Authored-By`, no `Generated with` in any comment or commit
- **Label atomicity** — when swapping labels, do both in a single `gh pr edit` call
- **Comment dedup** — always check for existing bot comment before posting CI failure or conflict comments

````

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/pr-automation/SKILL.md
git commit -m "feat(pr-automation): rewrite skill with new label state machine, dedup comments, auto-rebase, remove status board"
````

---

## Task 3：修改 `pr-fix` SKILL.md — 去掉 Path A 和 SKIP_EXTERNAL

**Files:**

- Modify: `.claude/skills/pr-fix/SKILL.md`

- [ ] **Step 1: 修改 Mode Detection 节 — 删除 SKIP_EXTERNAL**

将以下内容：

```markdown
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

替换为：

```markdown
In **automation mode**:

- Skip all yes/no confirmation prompts — follow the default best path
```

- [ ] **Step 2: 修改 Step 2 Pre-flight Checks**

删除并行检查中的 `isCrossRepository` 块：

```bash
# Check whether the PR is from a fork
gh pr view <PR_NUMBER> --json isCrossRepository -q '.isCrossRepository'
```

将 `Save <head_branch>, <base_branch>, <state>, and <isCrossRepository> for Step 3.` 改为：
`Save <head_branch>, <base_branch>, and <state> for Step 3.`

将决策表替换为：

```markdown
**Determine path based on results:**

| state    | Path                             |
| -------- | -------------------------------- |
| `OPEN`   | Path B — push to original branch |
| `MERGED` | Abort — nothing to fix           |

If state is `MERGED`: abort with:

> PR #<PR_NUMBER> has already been merged. Nothing to fix.
```

删除旧的 `OPEN + isCrossRepository=true` ABORT 段落（non-automation 和 automation 两段全部删除）。

- [ ] **Step 3: 修改 Step 3 — 删除 Path A，只保留 Path B**

将 Step 3 全部内容替换为：

````markdown
### Step 3 — Prepare Working Branch

Check out the existing head branch directly — no new branch needed:

```bash
git fetch origin <head_branch>
git checkout <head_branch>
git pull origin <head_branch>
```
````

Fixes will be committed directly onto this branch, and the open PR will update automatically.

````

- [ ] **Step 4: 修改 Step 7 — 删除 Path A，只保留 Path B**

将 Step 7 全部内容替换为：

```markdown
### Step 7 — Publish

```bash
git push origin <head_branch>
````

Output to user:

> 已推送到 `<head_branch>`，PR #<PR_NUMBER> 已自动更新。无需创建新 PR。

````

- [ ] **Step 5: 修改 Step 8 — 删除 Path A verification，只保留 Path B**

将 Step 8 全部内容替换为：

```markdown
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
````

After posting, output the same verification table in the conversation for immediate review.

```

- [ ] **Step 6: 更新 Quick Reference 节**

将 Quick Reference 代码块替换为：

```

0. Get review report (current session OR fetch from PR comments)
1. Parse 汇总 table → ordered issue list
2. Pre-flight: clean working tree + fetch PR branch info
   - detect: state (merged/open)
     → ABORT: state=MERGED — nothing to fix
     → Path B: state=OPEN — push to original branch (internal or external fork)
3. git fetch origin <head_branch> && git checkout <head_branch> && git pull
4. Fix issues CRITICAL→HIGH→MEDIUM→LOW; bunx tsc --noEmit after each file batch
5. bun run lint:fix && bun run format && bunx tsc --noEmit && bun run test
6. Commit: fix(<scope>): address review issues from PR #N
7. git push origin <head_branch> (PR auto-updated, no new PR)
8. Verify → post as gh pr comment PR_NUMBER + output in conversation

````

- [ ] **Step 7: Commit**

```bash
git add .claude/skills/pr-fix/SKILL.md
git commit -m "feat(pr-fix): remove Path A and SKIP_EXTERNAL, admin token supports pushing to any branch"
````

---

## Task 4：重写 `docs/conventions/pr-automation.md`

**Files:**

- Modify: `docs/conventions/pr-automation.md`

- [ ] **Step 1: 完整替换文件内容**

```markdown
# PR 自动化流程说明

本仓库运行 PR 自动化 agent，持续处理 open PR（review、fix、合并）。本文说明 label 体系、触发条件和人工介入方式。

---

## Label 体系

| Label                    | 含义                                         | 终态？ |
| ------------------------ | -------------------------------------------- | ------ |
| `bot:reviewing`          | review 进行中（防重入占位）                  | 否     |
| `bot:ready-to-fix`       | CONDITIONAL review 完成，等 bot 下次执行 fix | 否     |
| `bot:fixing`             | fix 进行中（防重入占位）                     | 否     |
| `bot:needs-human-review` | 需人工介入（阻塞性问题 / 冲突无法自动解决）  | ✅     |
| `bot:done`               | 已完成                                       | ✅     |

---

## 处理流程
```

选 PR（优先 bot:ready-to-fix > trusted > FIFO）
│
├─ 无 PR → EXIT
│
├─ bot:ready-to-fix → 重新检查 CI
│ ├─ CI 跑中/失败 → 移除标签，重入队列 → EXIT
│ └─ CI 过 → pr-fix → push → --auto → bot:done → EXIT
│
└─ 新鲜 PR → 加 bot:reviewing → 检查 CI
├─ 从未触发 → approve workflow → EXIT
├─ CI 跑中 → 移除 bot:reviewing → 找下一个
├─ CI 失败 → 去重检查
│ ├─ 已评论且无新 commit → 找下一个
│ └─ 否则 → 发评论 → EXIT
└─ CI 过 → 检查 merge conflict
├─ UNKNOWN → 找下一个
├─ CONFLICTING → 去重检查
│ ├─ 已评论且无新 commit → 找下一个
│ └─ 否则 → 尝试自动 rebase
│ ├─ 成功 → push → EXIT
│ └─ 失败 → 评论 + bot:needs-human-review → EXIT
└─ MERGEABLE → pr-review
├─ APPROVED → --auto merge → bot:done → EXIT
├─ CONDITIONAL → bot:ready-to-fix → EXIT
└─ REJECTED → bot:needs-human-review → EXIT

````

### Skip 条件（继续找下一个 PR）

- PR 是 draft（`gh pr list -is:draft` 直接过滤）
- 标题含 `WIP`（大小写不敏感）
- 已有 `bot:needs-human-review` / `bot:done` / `bot:reviewing` / `bot:fixing`
- CI 仍在运行（QUEUED / IN_PROGRESS）
- Mergeability 为 UNKNOWN
- CI 失败但已评论且作者无新 commit
- Merge conflict 但已评论且作者无新 commit

---

## 人工介入

### 阻止自动处理某 PR

- 设为 draft，或
- 在标题加 `WIP`，或
- 手动打 `bot:needs-human-review` label

移除 `bot:needs-human-review` 后，daemon 下一轮会重新处理该 PR。

### 查看运行状态

```bash
tail -f /tmp/pr-automation.log
````

---

## 守护进程管理

### 启动

```bash
# 前台运行
./scripts/pr-automation.sh

# 后台运行
nohup ./scripts/pr-automation.sh >> /tmp/pr-automation.log 2>&1 &
```

### 停止

```bash
kill $(cat /tmp/pr-automation-daemon.pid)
```

### 检查是否运行

```bash
PID=$(cat /tmp/pr-automation-daemon.pid 2>/dev/null) \
  && kill -0 "$PID" 2>/dev/null \
  && echo "Daemon running (PID $PID)" \
  || echo "Daemon not running"
```

### 自定义参数

```bash
SLEEP_SECONDS=60        # 每轮间隔（默认 30 秒）
MAX_CLAUDE_SECS=3600    # Claude 超时阈值（默认 3600 秒）
LOG_FILE=/var/log/pr-automation.log
```

---

## 首次部署

1. 确认 `gh auth login` 已完成，有足够权限（PR labels、合并、向外部 fork 推送）
2. 手动运行一次：`./scripts/pr-automation.sh` 并观察日志
3. 确认输出 `No eligible PR found this round` 或正常处理一个 PR

````

- [ ] **Step 2: Commit**

```bash
git add docs/conventions/pr-automation.md
git commit -m "docs(pr-automation): rewrite for daemon mode, new label state machine, dedup logic"
````
