---
name: pr-auto-merge
description: |
  Automated PR review and merge pipeline: scan open PRs, review with AI,
  fix issues if needed, verify CI, and merge automatically.
  Use when: (1) User says "/pr-auto-merge", (2) Scheduled via /loop,
  (3) User wants to automate PR processing.
---

# PR Auto-Merge Skill

Receive a PR number → review → fix if needed → post results → exit.

Shell scripts handle everything else (lock, CI, rebase, merge, cleanup). See [operations.md](references/operations.md) for daemon setup and pipeline architecture.

**Announce at start:** "I'm using pr-auto-merge skill to process pending PRs."

## Step 0 — Ensure Preconditions

The agent receives a PR number via `$ARGUMENTS`.

Check if the PR already has the `bot:reviewing` label:

```bash
gh pr view <PR_NUMBER> --repo iOfficeAI/AionUi --json labels --jq '[.labels[].name] | index("bot:reviewing")'
```

- **Label exists** → daemon already ran precheck. Skip to Step 1.
- **Label missing** → manual mode. Run precheck script:

```bash
.claude/skills/pr-auto-merge/scripts/pr-auto-merge-precheck.sh <PR_NUMBER>
```

If precheck outputs `abort:*` → post the reason as a PR comment and exit.
If precheck outputs `ready:*` → proceed to Step 1.

After this step, the PR is: locked (`bot:reviewing`), CI verified, rebased onto latest main, checked out locally.

## Step 1 — Review

Execute the pr-review skill (`.claude/skills/pr-review/SKILL.md`) with automated mode modifications:

1. Proceed through all steps automatically — no yes/no questions
2. Keep the report in session — do NOT post as PR comment yet
3. Skip cleanup step
4. Include AI-friendly fields per issue: Type, Auto-fixable, Fix instruction, Verify command
5. Include the JSON `可修复性评估` block at the end

Parse the JSON summary block and apply the decision matrix:

| conclusion | should_attempt_fix | Action |
|------------|--------------------|--------|
| `approve` | N/A | Post review comment, exit successfully |
| `conditional` | `true` | → Step 2 (attempt fix) |
| `conditional` | `false` | Post review comment, add `bot:needs-fix` label, exit |
| `reject` | N/A | Post review comment, add `bot:needs-human-review` label, exit |

## Step 2 — Fix

Execute the pr-fix skill (`.claude/skills/pr-fix/SKILL.md`) with automated mode modifications:

1. Fix all auto-fixable issues regardless of severity
2. Push to original branch (for fork PRs: `maintainerCanModify: true`, push directly)
3. Follow each issue's "Fix instruction" exactly
4. Run quality gate after fixing:

```bash
bun run lint:fix && bun run format && bunx tsc --noEmit && bun run test
```

5. Commit: `fix(<scope>): address review issues from PR #<PR_NUMBER>`

If quality gate fails → post review comment, add `bot:needs-fix` label, exit.

## Step 3 — Re-review (max 3 rounds)

Re-execute Step 1 on fixed code. Track round number (starts at 1).

| New conclusion | Round < 3 | Action |
|----------------|-----------|--------|
| `approve` | N/A | Post review comment, exit successfully |
| `conditional` + fixable | yes | → Step 2 (next round) |
| otherwise | N/A | Post review comment, add `bot:needs-fix` label, exit |

## Labels

| Label | Meaning |
|-------|---------|
| `bot:reviewing` | PR is being reviewed (lock) |
| `bot:fixing` | PR is being fixed |
| `bot:needs-fix` | Waiting for author to fix issues |
| `bot:needs-human-review` | Rejected, needs human review |
| `bot:done` | Processing complete |

## Rules

- **No AI signature** — no Co-Authored-By, Generated with, or any AI byline in commits
- **No silent failures** — every abort must post a PR comment explaining why
- **Fork PRs** — treat same as internal branches (admin has push access)
- **Serial processing** — one PR at a time per agent invocation
- **Agent scope** — do NOT merge, wait for CI, or clean up labels. Just post results and exit.
