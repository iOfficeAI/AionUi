---
name: bump-version
description: Use when bumping the AionUi version: update package.json, run checks, branch, commit, push, create PR, wait for merge, tag release.
---

# Bump Version

Automate the AionUi version bump workflow: update version → quality checks → branch → commit → push → PR → tag.

**Usage:** `/bump-version [version]`

- `/bump-version 1.8.17` — bump to specified version
- `/bump-version` — auto-increment patch (e.g. `1.8.16` → `1.8.17`)

## Workflow

### Step 1: Pre-flight Checks

```bash
git branch --show-current
git status --short
```

- **Not on `main`** → Stop: "Please switch to main before running bump-version."
- **Dirty working tree** → Stop: "There are uncommitted changes. Please commit or stash them first."

### Step 2: Pull Latest

```bash
git pull --rebase origin main
```

Fails → Stop: "Failed to pull latest code. Please resolve conflicts or network issues first."

### Step 3: Determine Target Version

Read `package.json` → extract `version` field.

- **Argument provided** → use as-is
- **No argument** → parse `major.minor.patch`, increment `patch` by 1

Display: "Bumping version: {current} → {target}"

### Step 4: Update package.json

Use Edit tool to replace:

- old: `"version": "{current}"`
- new: `"version": "{target}"`

### Step 5: Quality Checks

```bash
bun run lint
bun run format
bunx tsc --noEmit
```

- **lint fails** → Stop: "Lint errors found. Please fix them before bumping the version."
- **format** → Auto-fixes silently.
- **tsc fails** → Stop: "TypeScript errors found. Please fix them before bumping the version."

### Step 6: Run Tests

```bash
bunx vitest run
```

Fails → Stop: "Tests failed. Please fix failing tests before bumping the version."

### Step 7: Branch, Commit, Push

```bash
git checkout -b chore/bump-version-{target}
git add -A
git commit -m "chore: bump version to {target}"
git push -u origin chore/bump-version-{target}
```

### Step 8: Create PR

```bash
gh pr create --base main \
  --title "chore: bump version to {target}" \
  --body "Bump version to {target}"
```

Display PR URL. Then pause:

> "PR created: {URL}. Please notify a team member to merge it, then confirm to continue."

**Wait for user confirmation before proceeding.**

### Step 9: Cleanup After Merge

```bash
git checkout main
git pull --rebase origin main
git branch -d chore/bump-version-{target}
```

Check if remote branch still exists:

```bash
git ls-remote --heads origin chore/bump-version-{target}
```

- **Has output** → delete remote: `git push origin --delete chore/bump-version-{target}`
- **No output** → skip.

### Step 10: Create and Push Tag

```bash
git tag v{target}
git push origin v{target}
```

Display: "Tag v{target} created and pushed. Version bump complete!"

## Quick Reference

```
1. Must be on clean main
2. git pull --rebase
3. Determine target version
4. Edit package.json
5. lint + format + tsc
6. vitest run
7. branch chore/bump-version-{target} → commit → push
8. gh pr create → wait for merge
9. checkout main → pull → delete branch
10. git tag v{target} && git push origin v{target}
```
