---
name: commit
description: |
  Structured git commit workflow with quality checks.
  Use when: (1) User asks to commit code, (2) User says "commit" or "/commit",
  (3) After completing a feature implementation, (4) User invokes /oss-pr.
---

# Commit Skill

Structured commit workflow: analyze changes → quality checks → group by feature → commit with approval.

**Announce at start:** "I'm using commit skill to commit your changes."

## Workflow

### Step 0: Branch Guard

```bash
git branch --show-current
```

**If the current branch is `main` or `master`:**

1. **STOP** — do NOT commit directly to main/master
2. Create a new branch based on the changes: `git checkout -b <type>/<scope>-<short-description>` (e.g., `feat/webui-file-upload`, `fix/cron-timezone`, `docs/update-skills`)
3. Then proceed with the commit workflow on the new branch

This rule has **no exceptions** unless the user explicitly overrides it.

### Step 1: Analyze Changes

```bash
git status -s
git diff --stat
git diff
```

Identify:

- What files changed
- What features/purposes each change serves
- Whether changes should be split into multiple commits

### Step 2: Test Coverage & Quality Checks (Required)

**Before running checks, verify test coverage:**

- If logic was added or changed, ensure corresponding unit tests exist
- If no tests cover the change, **write them first** (see [testing skill](../testing/SKILL.md))
- Tests are part of "done" — do NOT defer them to a follow-up commit

Run before ANY commit:

```bash
bun run lint:fix       # Fix lint/format issues
bun run format         # Format non-TS files
bunx tsc --noEmit      # Type check
bun run test           # Run tests
```

**Rules:**

- **ALL must pass** before committing
- If fails due to **current changes**: fix issues first, do NOT skip
- If errors exist in **unrelated files**: may proceed, but inform user

### Step 3: Group by Feature

Group related changes into logical commits:

| Group together                    | Split apart              |
| --------------------------------- | ------------------------ |
| Type definitions + implementation | Unrelated bug fixes      |
| Component + its hook + styles     | Feature A vs Feature B   |
| Refactor of single module         | Refactor vs new feature  |
| Test + implementation it covers   | Unrelated test additions |

**Principle:** One commit = one logical change. Ask user if grouping is unclear.

### Step 4: Commit Format

```
<type>(<scope>): <description>
```

**Types:**

- `feat` — New feature
- `fix` — Bug fix
- `refactor` — Code refactoring (no behavior change)
- `chore` — Build, deps, config changes
- `docs` — Documentation only
- `test` — Adding/updating tests
- `style` — Formatting (no logic change)
- `perf` — Performance improvement

**Scope:** Module or feature name, e.g., `cron`, `webui`, `css-theme`, `i18n`

**Language:** English only.

**Examples:**

```
feat(cron): implement scheduled task system
fix(webui): correct modal z-index issue
refactor(css-theme): extract preset CSS into separate files
test(webserver): add cookie parsing tests
chore: remove debug console.log statements
```

### Step 5: Execute Commits

For each commit group:

1. Stage specific files: `git add <files>` (avoid `git add -A`)
2. Show user the commit message for approval
3. Commit after user confirms

### Step 6: Post-Commit Check

After committing, check if changes require AGENTS.md / skill updates:

| Trigger                         | Action                                  |
| ------------------------------- | --------------------------------------- |
| New directory structure pattern | Update architecture skill               |
| New i18n module added           | Verify i18n skill still accurate        |
| New build command               | Update AGENTS.md                        |
| New convention introduced       | Document in relevant skill or AGENTS.md |

## Mandatory Rules

### No AI Signature

**NEVER add any AI-related signatures.** This includes:

- `Co-Authored-By: <any AI tool>` or similar attribution
- `Generated with <AI tool>` in commit messages or PR descriptions
- Any AI-generated footer or byline
- Emojis like 🤖 followed by AI tool names

This applies to ALL commits and PRs without exception.

### No `--no-verify`

NEVER skip pre-commit hooks. If a hook fails, fix the underlying issue.

### No `--force` Push

NEVER force-push without explicit user approval. Warn if pushing to main/master.

## Quick Reference

```
0. git branch --show-current     — if main/master, create new branch first
1. git status / git diff         — understand changes
2. Verify test coverage          — write tests for new/changed logic FIRST
3. bun run lint:fix && bun run format && bunx tsc --noEmit && bun run test  — quality gate
4. Group changes by feature      — one commit = one logical change
5. git add <files> && git commit — with user approval
6. Check if AGENTS.md / skills need update
```
