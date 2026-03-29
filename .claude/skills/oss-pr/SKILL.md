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
git status --short
git config user.name
```

**Branch rules:**

- If on `main` or `master`: ask for a branch name, prefix with `{username}/` (lowercase, hyphens), create and switch, then continue
- If already on a feature branch: proceed directly

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
- **All pass** → Proceed silently.

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
2. bunx vitest run
3. Commit (conventional commits, no AI attribution)
4. git push -u origin <branch>
5. gh pr create
6. Output PR URL
```
