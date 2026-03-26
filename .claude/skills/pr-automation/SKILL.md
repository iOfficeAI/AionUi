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

| Condition | Check |
|---|---|
| Title contains `WIP` (case-insensitive) | `title.toLowerCase().includes('wip')` |
| Has label `bot:needs-human-review` | check labels array |
| Has label `bot:done` | check labels array |
| Has label `bot:reviewing` | check labels array |
| Has label `bot:fixing` | check labels array |

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

| Condition | Action |
|---|---|
| All required jobs: `status=COMPLETED && conclusion=SUCCESS` | Continue to Step 5 |
| Any required job: `status=QUEUED` or `IN_PROGRESS` | Remove `bot:reviewing` → log "CI still running for PR #N" → exit |
| `statusCheckRollup` is empty (CI never triggered) | Attempt workflow approval (see below) → remove `bot:reviewing` → exit |
| Any required job: `conclusion=FAILURE` or `CANCELLED` | Post CI failure comment (see below) → remove `bot:reviewing` → exit |

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

   | ACTION_TAKEN | 结论列 | 操作列 |
   |---|---|---|
   | approved-merged | ✅ 批准合并 | 已触发自动合并 |
   | conditional-fixed-merged | ⚠️ 有条件批准 | 已 fix，等待 CI 合并 |
   | conditional-needs-fix | ⚠️ 有条件批准（外部 PR） | 已通知作者修复 |
   | rejected-human-review | ❌ 需要修改 | 转人工 |
   | ci-skipped | ⏳ CI 未就绪 | 跳过 |

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
