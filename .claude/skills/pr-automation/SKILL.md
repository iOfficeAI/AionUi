---
name: pr-automation
description: |
  PR Automation Orchestrator (Shell+Claude): receive PR number, handle merge conflicts,
  review with pr-review skill, fix with pr-fix skill if needed, and post results.
  Use when: (1) Invoked by scripts/pr-automation-daemon.sh, (2) User says "/pr-automation <PR_NUMBER>".
---

# PR Automation

Receive a PR number → handle merge conflicts → review → fix if needed → post results → exit.

Shell scripts handle scanning, CI verification, locking, merging, and cleanup. See [references/operations.md](references/operations.md) for the full pipeline architecture.

**Announce at start:** "I'm using pr-automation skill to process PR #<PR_NUMBER>."

## Step 0 — Verify Preconditions

Receive PR number via `$ARGUMENTS`.

Detect REPO:

```bash
REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner')
```

Check if the PR already has the `bot:reviewing` label:

```bash
gh pr view <PR_NUMBER> --repo "$REPO" --json labels --jq '[.labels[].name] | index("bot:reviewing")'
```

- **Label exists** → daemon/cron already ran precheck. Proceed to Step 1.
- **Label missing** → manual invocation. Run precheck script:
  ```bash
  .claude/skills/pr-automation/scripts/pr-automation-precheck.sh <PR_NUMBER>
  ```
  If precheck outputs `abort:*` → post the reason as a PR comment and exit.
  If precheck outputs `ready:*` → proceed to Step 1.

After precheck, the PR is: locked (`bot:reviewing`), CI verified, checked out locally.
If precheck output contains `:has_conflicts`, the PR has unresolved merge conflicts — handle them in Step 1.

## Step 1 — Handle Merge Conflicts

Check mergeability:

```bash
gh pr view <PR_NUMBER> --repo "$REPO" --json mergeable,mergeStateStatus \
  --jq '{mergeable, mergeStateStatus}'
```

| `mergeable` | Action |
|---|---|
| `MERGEABLE` | Continue to Step 2 |
| `UNKNOWN` | Remove `bot:reviewing` → log "Mergeability unknown, will retry next round" → exit |
| `CONFLICTING` | Attempt conflict resolution (see below) |

**Conflict resolution (CONFLICTING):**

1. Checkout the PR branch and fetch base:
   ```bash
   gh pr checkout <PR_NUMBER> --repo "$REPO"
   BASE_REF=$(gh pr view <PR_NUMBER> --repo "$REPO" --json baseRefName --jq '.baseRefName')
   git fetch origin "$BASE_REF"
   ```

2. Attempt automatic rebase:
   ```bash
   git rebase "origin/$BASE_REF"
   ```

3. If rebase succeeds → push and continue:
   ```bash
   git push --force-with-lease
   git checkout -
   ```
   → Continue to Step 2.

4. If rebase has conflicts → resolve intelligently:
   - `git rebase --abort` to start clean
   - Switch to merge strategy: `git merge "origin/$BASE_REF"`
   - For each conflicted file: read both `<<<<<<< HEAD` and `>>>>>>> origin` versions,
     analyze the intent of both sides, produce the correct merged result
   - `git add <resolved_file>` after each resolution
   - `git merge --continue` when all files resolved
   - Push:
     ```bash
     git push --force-with-lease
     git checkout -
     ```
   → Continue to Step 2.

5. If conflicts cannot be resolved (ambiguous business logic, incomplete context) → post comment:
   ```bash
   gh pr comment <PR_NUMBER> --repo "$REPO" --body "<!-- pr-automation-bot -->
   ## 存在合并冲突

   本 PR 与 \`$BASE_REF\` 存在冲突，自动解决失败（冲突超出自动处理范围）。请手动解决后重新推送：

   \`\`\`bash
   git fetch origin && git rebase origin/$BASE_REF
   # 解决冲突后
   git push --force-with-lease
   \`\`\`"
   ```
   → Remove `bot:reviewing` → add `bot:needs-fix` → exit.

## Step 2 — Review

Execute the pr-review skill (`.claude/skills/pr-review/SKILL.md`) with automated mode modifications:

1. Proceed through all steps automatically — no yes/no questions
2. Keep the report in session — do NOT post as PR comment yet
3. Skip cleanup step
4. Include AI-friendly fields per issue: Type, Auto-fixable, Fix instruction, Verify command
5. Include the JSON `可修复性评估` block at the end

Parse the JSON summary block and apply the decision matrix:

| conclusion | should_attempt_fix | Action |
|------------|--------------------|--------|
| `approve` | N/A | Post review comment → exit (shell will merge) |
| `conditional` | `true` | → Step 3 (fix) |
| `conditional` | `false` | Post review comment → add `bot:needs-fix` label → exit |
| `reject` | N/A | Post review comment → add `bot:needs-human-review` label → exit |

## Step 3 — Fix

Execute the pr-fix skill (`.claude/skills/pr-fix/SKILL.md`) with automated mode modifications:

1. Fix all auto-fixable issues regardless of severity
2. Push to original branch (for fork PRs: admin has push access, push directly)
3. Follow each issue's "Fix instruction" exactly
4. Run quality gate after fixing:
   ```bash
   bun run lint:fix && bun run format && bunx tsc --noEmit && bun run test
   ```
5. Commit: `fix(<scope>): address review issues from PR #<PR_NUMBER>`

If quality gate fails → post review comment → add `bot:needs-fix` label → exit.

After successful fix:
- Post review comment with fix summary
- Exit (shell postmerge will handle final rebase, CI wait, and merge)

## Labels

| Label | Meaning |
|-------|---------|
| `bot:reviewing` | PR is being reviewed/processed (mutex lock) |
| `bot:needs-fix` | Waiting for author to fix issues |
| `bot:needs-human-review` | Rejected, needs human review |
| `bot:done` | Processing complete (set by postmerge shell after merge) |

## Required CI Jobs

Checked by shell precheck — all must pass before Claude is invoked:

- `Code Quality`
- `Unit Tests (ubuntu-latest)`
- `Unit Tests (macos-14)`
- `Unit Tests (windows-2022)`
- `Coverage Test`
- `i18n-check`

## Rules

- **No AI signature** — no Co-Authored-By, Generated with, or any AI byline in commits or comments
- **No silent failures** — every abort must post a PR comment explaining why
- **Fork PRs** — treat same as internal branches (admin has push access, push directly)
- **Serial processing** — one PR at a time per agent invocation
- **Agent scope** — do NOT merge or wait for CI. Handle conflicts, review, fix, post results, and exit.
- **Lock cleanup** — whenever exiting mid-flow due to unexpected error, always remove `bot:reviewing` first
