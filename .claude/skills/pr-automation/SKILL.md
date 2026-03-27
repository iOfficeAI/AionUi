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
```

**REPO** is detected automatically at runtime — do not hardcode it:

```bash
REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner')
ORG=$(echo "$REPO" | cut -d'/' -f1)
```

## Label State Machine

| Label | Meaning | Terminal? |
|---|---|---|
| `bot:reviewing` | Review in progress (mutex) | No |
| `bot:ready-to-fix` | CONDITIONAL review done, waiting for bot to fix next session | No |
| `bot:fixing` | Fix in progress (mutex) | No |
| `bot:needs-human-review` | Human intervention required | Yes |
| `bot:done` | Completed | Yes |

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

If `candidate_prs` is empty: log `[pr-automation] No open PRs found. Exiting.` then log `[pr-automation:exit] action=no_prs reason="no open PRs"` and EXIT.

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

| Condition | Check |
|---|---|
| Title contains `WIP` (case-insensitive) | `title.toLowerCase().includes('wip')` |
| Has label `bot:needs-human-review` | check labels array |
| Has label `bot:done` | check labels array |
| Has label `bot:reviewing` | check labels array |
| Has label `bot:fixing` | check labels array |

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

**If no eligible PR found after full iteration:** log `[pr-automation] No eligible PR found this round.` then log `[pr-automation:exit] action=no_eligible_pr reason="all PRs skipped"` and EXIT.

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
Log: `[pr-automation:exit] action=requeue pr=#<PR_NUMBER> reason="new commits since review"`

**EXIT.** (PR re-enters normal queue with no bot: label → will be fully re-reviewed next round)

If no new commits, continue below.

**Re-check CI** (new commits may have been pushed since review):

```bash
gh pr view <PR_NUMBER> --json statusCheckRollup \
  --jq '.statusCheckRollup[] | {name: .name, status: .status, conclusion: .conclusion}'
```

Required jobs: `Code Quality`, `Unit Tests (ubuntu-latest)`, `Unit Tests (macos-14)`, `Unit Tests (windows-2022)`, `Coverage Test`, `i18n-check`

| Condition | Action |
|---|---|
| All required jobs SUCCESS | Continue to pr-fix below |
| Any job QUEUED or IN_PROGRESS | Remove `bot:fixing` → log "CI still running for PR #N" → EXIT |
| Any job FAILURE or CANCELLED | Remove `bot:fixing` → log "CI failed for PR #N, re-queueing" → EXIT |

**Load the existing review report into the current session** (pr-fix requires it to be present):

```bash
gh pr view <PR_NUMBER> --json comments \
  --jq '.comments[] | select(.body | startswith("<!-- pr-review-bot -->")) | .body' \
  | tail -1
```

Output the fetched review report in the conversation so pr-fix can find it. If no review comment is found, abort:

```bash
gh pr edit <PR_NUMBER> --remove-label "bot:fixing" --add-label "bot:needs-human-review"
```

Log: `[pr-automation] PR #<PR_NUMBER> no review report found — cannot fix. Transferred to human review.`
Log: `[pr-automation:exit] action=needs_human pr=#<PR_NUMBER> reason="no review report found"`

**EXIT.**

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
Log: `[pr-automation:exit] action=fixed pr=#<PR_NUMBER> reason="fix complete, auto-merge triggered"`

**EXIT.**

### Step 4 — Check CI Status

```bash
gh pr view <PR_NUMBER> --json statusCheckRollup \
  --jq '.statusCheckRollup[] | {name: .name, status: .status, conclusion: .conclusion}'
```

Required jobs: `Code Quality`, `Unit Tests (ubuntu-latest)`, `Unit Tests (macos-14)`, `Unit Tests (windows-2022)`, `Coverage Test`, `i18n-check`

| Condition | Action |
|---|---|
| All required jobs SUCCESS | Continue to Step 4.5 |
| Any job QUEUED or IN_PROGRESS | Remove `bot:reviewing` → log "CI still running for PR #N" → **find next PR** |
| `statusCheckRollup` empty (CI never triggered) | Approve workflow (see below) → remove `bot:reviewing` → **EXIT** |
| Any job FAILURE or CANCELLED | Check dedup (see below) → **find next PR** or post comment → **EXIT** |

**Workflow approval** (CI never triggered):

Use the PR's head commit SHA to precisely find `action_required` runs for this PR
(avoids missing fork PRs that `gh run list` may not return in default pagination):

```bash
HEAD_SHA=$(gh pr view <PR_NUMBER> --json headRefOid --jq '.headRefOid')
RUN_IDS=$(gh api "repos/$REPO/actions/runs?head_sha=$HEAD_SHA&status=action_required" \
  --jq '.workflow_runs[].id')
for RUN_ID in $RUN_IDS; do
  gh run approve "$RUN_ID" --repo "$REPO"
done
```

Log: `[pr-automation] Approved workflow runs for PR #<PR_NUMBER>.`
Log: `[pr-automation:exit] action=workflow_approved pr=#<PR_NUMBER> reason="CI not triggered, approved workflow runs"`

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

- Otherwise: post CI failure comment below → log `[pr-automation:exit] action=ci_failed pr=#<PR_NUMBER> reason="CI failure, commented"` → remove `bot:reviewing` → **EXIT**

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

| `mergeable` | `mergeStateStatus` | Action |
|---|---|---|
| `MERGEABLE` | `BEHIND` | Call update-branch API → remove `bot:reviewing` → **EXIT** |
| `MERGEABLE` | other | Continue to Step 5 |
| `UNKNOWN` | any | Remove `bot:reviewing` → log "Mergeability unknown for PR #N, will retry" → **find next PR** |
| `CONFLICTING` | any | Run conflict dedup check (see below) |

**Branch update (mergeable=MERGEABLE, mergeStateStatus=BEHIND):**

```bash
gh api repos/$REPO/pulls/<PR_NUMBER>/update-branch --method PUT
gh pr edit <PR_NUMBER> --remove-label "bot:reviewing"
```

Log: `[pr-automation] PR #<PR_NUMBER> branch is behind base — triggered update-branch. CI will re-run and auto-merge will fire automatically.`
Log: `[pr-automation:exit] action=update_branch pr=#<PR_NUMBER> reason="branch behind base, triggered update"`

**EXIT** (GitHub merges base into the branch, CI re-triggers, auto-merge fires when CI passes).

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

Log: `[pr-automation:exit] action=conflict_unresolved pr=#<PR_NUMBER> reason="merge conflict, needs human rebase"`

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
5. Log: `[pr-automation:exit] action=approved pr=#<PR_NUMBER> reason="review passed, auto-merge triggered"`
6. **EXIT.**

#### CONCLUSION = CONDITIONAL

1. Update labels (defer pr-fix to next session):
   ```bash
   gh pr edit <PR_NUMBER> --remove-label "bot:reviewing" --add-label "bot:ready-to-fix"
   ```
2. Log: `[pr-automation] PR #<PR_NUMBER> CONDITIONAL — marked bot:ready-to-fix for next session.`
3. Log: `[pr-automation:exit] action=conditional pr=#<PR_NUMBER> reason="review conditional, deferred fix to next session"`
4. **EXIT.**

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
4. Log: `[pr-automation:exit] action=rejected pr=#<PR_NUMBER> reason="blocking issues, transferred to human review"`
5. **EXIT.**

#### CONCLUSION = CI_FAILED or CI_NOT_READY

Safety fallback (Step 4 should have caught these):

1. Remove `bot:reviewing`:
   ```bash
   gh pr edit <PR_NUMBER> --remove-label "bot:reviewing"
   ```
2. Log: `[pr-automation] PR #<PR_NUMBER> CI not ready at pr-review stage. Skipping.`
3. Log: `[pr-automation:exit] action=ci_not_ready pr=#<PR_NUMBER> reason="CI not ready at review stage"`
4. **EXIT.**

---

## Mandatory Rules

- **Single heavy action per session** — review OR fix, then EXIT
- **bot:reviewing / bot:fixing are mutexes** — always set immediately when claiming a PR
- **Clean up on skip** — whenever skipping a PR mid-flow, always remove `bot:reviewing` first
- **No AI signature** — no `Co-Authored-By`, no `Generated with` in any comment or commit
- **Label atomicity** — when swapping labels, do both in a single `gh pr edit` call
- **Comment dedup** — always check for existing bot comment before posting CI failure or conflict comments
