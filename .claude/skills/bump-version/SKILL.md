---
name: bump-version
description: Use when bumping the AionUi version: query AionCore release, verify artifacts, update package.json, generate CHANGELOG, branch, commit, push, create PR, auto-merge, tag release.
---

# Bump Version

Automate the AionUi release preparation: query AionCore release → verify artifacts → update versions → generate CHANGELOG → branch → PR → tag.

**Usage:** `/bump-version [version] [flags]`

- `/bump-version` — auto patch + latest AionCore
- `/bump-version 2.2.0` — explicit AionUi version + latest AionCore
- `/bump-version 2.2.0 --core v0.1.12` — explicit both versions
- `/bump-version --skip-core` — pure frontend release (don't touch aioncoreVersion)

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

### Step 3: Determine AionUi Target Version

Read `package.json` → extract `version` field.

- **Argument provided** → use as-is
- **No argument** → parse `major.minor.patch`, increment `patch` by 1

Display: "Bumping AionUi: {current} → {target}"

### Step 4: Query AionCore Latest Release

**Skip entirely if `--skip-core` is set.**

```bash
gh release view --repo iOfficeAI/AionCore --json tagName,body
```

- If `--core <version>` provided → use that tag instead of latest
- Display the AionCore version and ask user to confirm before continuing
- Also read current `aioncoreVersion` from `package.json` — if it already matches the queried version, warn the user and ask whether to proceed or use `--skip-core`

### Step 5: Verify AionCore Artifacts

**Skip if `--skip-core`.**

```bash
gh release view <tag> --repo iOfficeAI/AionCore --json assets --jq '.assets[].name'
```

Verify all 7 expected assets exist:

- `aioncore-<tag>-x86_64-unknown-linux-gnu.tar.gz`
- `aioncore-<tag>-aarch64-unknown-linux-gnu.tar.gz`
- `aioncore-<tag>-x86_64-apple-darwin.tar.gz`
- `aioncore-<tag>-aarch64-apple-darwin.tar.gz`
- `aioncore-<tag>-x86_64-pc-windows-msvc.zip`
- `aioncore-<tag>-aarch64-pc-windows-msvc.zip`
- `aioncore-checksums.txt`

Missing → Stop: "AionCore {tag} is missing artifacts: {list}. Wait for CI to complete or check for build failures."

### Step 6: Update package.json

Use Edit tool to replace:

- `"version": "{current}"` → `"version": "{target}"`
- `"aioncoreVersion": "{old}"` → `"aioncoreVersion": "{new core tag}"` (skip if `--skip-core`)

### Step 7: Generate CHANGELOG Entry

#### 7a: Determine Previous Tag

```bash
git describe --tags --abbrev=0
```

This gives the most recent tag (e.g. `v2.1.2`).

#### 7b: Collect Frontend Changes

```bash
git log v{previous}..HEAD --oneline --no-merges --format="%s"
```

- Filter to conventional commit types: `feat`, `fix`, `refactor`, `perf`, `style`
- Exclude commits matching `chore: bump version`
- Group by type (Features, Bug Fixes, Refactoring, Performance, Styling)
- Format each as: `- **scope:** description (#PR)`

#### 7c: Collect AionCore Changes

From step 4's release body (already in conventional-changelog format from release-please). Parse into same grouped format.

**Skip if `--skip-core`.**

#### 7d: Compose and Write CHANGELOG.md

If `CHANGELOG.md` exists at repo root → read its current content.
If not → start with empty string.

Prepend the new entry in this format:

```markdown
# Changelog

## [{target}](https://github.com/iOfficeAI/AionUi/compare/v{previous}...v{target}) ({date YYYY-MM-DD})

### Desktop

#### Bug Fixes

- **upload:** abort in-flight uploads when switching conversations (#3019)

#### Features

- **thinking:** add streaming indicator (#3015)

### Core ([{core tag}](https://github.com/iOfficeAI/AionCore/releases/tag/{core tag}))

#### Bug Fixes

- **acp:** load user MCP servers and emit empty-finish diagnostic (#327)

---
```

Rules:

- If `--skip-core`: omit the entire "### Core" section
- If no frontend commits since last tag: show `_No frontend changes in this release._` under "### Desktop"
- Date format: `YYYY-MM-DD`
- Always keep the top-level `# Changelog` header exactly once

### Step 8: Quality Checks

```bash
bun run lint
bun run format
bunx tsc --noEmit
```

- **lint fails** → Stop: "Lint errors found. Please fix them before bumping."
- **format** → Auto-fixes silently.
- **tsc fails** → Stop: "TypeScript errors found. Please fix them before bumping."

### Step 9: Run Tests

```bash
bunx vitest run
```

Fails → Stop: "Tests failed. Please fix before bumping."

### Step 10: Branch, Commit, Push

```bash
git checkout -b chore/bump-version-{target}
git add package.json CHANGELOG.md
git commit -m "chore: bump version to {target} and aioncore to {core tag}"
just push -u origin chore/bump-version-{target}
```

If `--skip-core`:

```bash
git commit -m "chore: bump version to {target}"
```

### Step 11: Create PR + Enable Auto-Merge

```bash
gh pr create --base main \
  --title "chore: bump version to {target}" \
  --body "<the CHANGELOG entry generated in Step 7>"
```

Capture the PR number from the output. Then enable auto-merge (squash):

```bash
gh pr merge {PR_NUMBER} --auto --squash
```

Display: "PR created: {URL}. Auto-merge enabled — will merge automatically once CI passes."

### Step 12: Poll for Merge

Check PR merge status every 5 minutes:

```bash
gh pr view {PR_NUMBER} --json state,mergedAt,mergeStateStatus
```

**Decision logic:**

| `state`                                                                     | Action                                                                                 |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `MERGED`                                                                    | Proceed to Step 13                                                                     |
| `CLOSED` (not merged)                                                       | Stop: "PR was closed without merging. Please check and confirm how to proceed."        |
| `OPEN` with `mergeStateStatus: BLOCKED` or CI failure persisting > 3 checks | Stop: "PR merge is blocked (CI failure or review required). Please investigate: {URL}" |
| `OPEN` otherwise                                                            | Wait 5 minutes, check again                                                            |

**Maximum wait:** 30 minutes (6 checks). If not merged after 30 minutes:

> "PR has not merged after 30 minutes. Please check status: {URL}. Reply 'continue' when merged, or 'abort' to stop."

**Wait for user confirmation only in this timeout case.**

### Step 13: Cleanup + Tag

After merge is confirmed (either via polling or user confirmation):

```bash
git checkout main
git pull --rebase origin main
git branch -d chore/bump-version-{target}
```

Check if remote branch still exists:

```bash
git ls-remote --heads origin chore/bump-version-{target}
```

- Has output → `git push origin --delete chore/bump-version-{target}`
- No output → skip

Create and push tag:

```bash
git tag v{target}
git push origin v{target}
```

Wait a few seconds for GitHub to pick up the tag push, then fetch the triggered workflow run:

```bash
gh run list --workflow=release.yml --branch v{target} --limit 1 --json databaseId,url
```

Display: "Tag v{target} created and pushed. Release build triggered! Action: {run URL}"

## Quick Reference

```
 1. Must be on clean main
 2. git pull --rebase
 3. Determine AionUi target version (patch+1 or explicit)
 4. Query AionCore latest release (or --core / --skip-core)
 5. Verify AionCore artifacts (7 files)
 6. Edit package.json (version + aioncoreVersion)
 7. Generate CHANGELOG entry (frontend commits + AionCore release body)
 8. lint + format + tsc
 9. vitest run
10. branch → commit → push
11. gh pr create → enable auto-merge (squash)
12. poll merge status (every 5min, max 30min) → stop on failure
13. cleanup → git tag → git push tag
```
