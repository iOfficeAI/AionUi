---
name: oss-pr
description: Use when creating a pull request, after committing changes, or when user invokes /oss-pr. Covers branch management, quality checks, commit, push, and PR creation.
---

# OSS PR

Smart commit + PR workflow: branch management → quality checks → tests → commit → push → PR.

**Announce at start:** "Using oss-pr skill to commit and open a pull request."

## Workflow

### Step 0: Gather Info

```bash
git branch --show-current
git diff --name-only HEAD
git status --short
git config user.name
```

**Branch rules:**

- If already on a feature branch: proceed directly
- If on `main` or `master`: auto-generate a branch name, create and switch immediately — no confirmation needed

**Auto-generating a branch name:**

Analyze the changed files from `git diff --name-only HEAD` to infer:

1. **type** — pick one: `feat` / `fix` / `refactor` / `chore`
   - `feat`: new user-facing functionality
   - `fix`: bug fix
   - `refactor`: restructuring without behavior change
   - `chore`: config, scripts, skills, docs, deps
2. **slug** — 2–3 lowercase words derived from the most relevant changed paths, joined by hyphens. Keep it short and specific.

Create branch `{username}/{type}/{slug}` directly and announce the name chosen.

**Branch naming reference:**

| Type     | Example                      |
| -------- | ---------------------------- |
| feat     | `{prefix}/feat/dark-mode`    |
| fix      | `{prefix}/fix/crash-on-open` |
| refactor | `{prefix}/refactor/settings` |
| chore    | `{prefix}/chore/update-deps` |

### Step 1: Quality Checks

```bash
bun run lint
bun run format
bunx tsc --noEmit
```

- **lint fails** → Stop, report errors. Do not proceed.
- **format** → Auto-fixes silently.
- **tsc fails** → Stop, report errors. Do not proceed.
- **All pass** → Proceed to i18n check below.

**i18n check** (run if any `src/renderer/`, `locales/`, or `src/common/config/i18n` files are modified):

```bash
bun run i18n:types
node scripts/check-i18n.js
```

- **i18n:types fails** → Stop, report errors. Do not proceed.
- **check-i18n exits 1 (errors)** → Stop, report errors. Do not proceed.
- **check-i18n exits 0 (warnings only)** → Continue silently.
- **No i18n-sensitive files changed** → Skip both commands.

### Step 2: Run Tests

```bash
bunx vitest run
```

- **Fails** → Stop, report failing tests. Do not proceed.
- **Passes** → Proceed silently.

### Step 3: Commit

```bash
git status
git diff
```

Stage **all** modified files — including any files auto-fixed by `format` in Step 1:

```bash
git add -u
```

Generate commit message in English using conventional commits format: `<type>(<scope>): <subject>`.

**NEVER include `Co-authored-by` or any AI attribution.**

### Step 4: Push Branch

```bash
git push -u origin <branch-name>
```

If push fails due to remote rejection, inform user. **NEVER force-push** without explicit approval.

### Step 5: Create Pull Request

Run `git log main..HEAD --oneline` and `git diff main...HEAD` to understand all changes, then:

```bash
gh pr create --title "<pr-title>" --body "$(cat <<'EOF'
## Summary

<1-3 bullet points>

## Test plan

- [ ] <verification steps>
EOF
)"
```

**PR title:** under 70 characters, `<type>(<scope>): <description>` format. Reuse commit message if single commit.

**NEVER add AI-generated signatures, `Generated with`, or `Co-Authored-By` lines.**

### Step 6: Post-PR

Output the PR URL when done.

## Quick Reference

```
0. Check branch (create if on main)
1. bun run lint && bun run format && bunx tsc --noEmit
   (if i18n files changed: bun run i18n:types && node scripts/check-i18n.js)
2. bunx vitest run
3. Commit (conventional commits, no AI attribution)
4. git push -u origin <branch>
5. gh pr create
6. Output PR URL
```
