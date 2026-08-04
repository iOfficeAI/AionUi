---
name: bump-version
description: Use when bumping the CSBU WorkMate version: query AionCore release, verify artifacts, update package.json, generate CHANGELOG, branch, commit, push, create PR, auto-merge, tag release.
---

# Bump Version

Automate the complete CSBU WorkMate release: query AionCore release → verify artifacts → update versions → generate CHANGELOG → branch → PR → tag → monitor every build → publish and verify the GitHub Release.

> **Mandatory safety record:** Read [`docs/contributing/release-safety.md`](../../../docs/contributing/release-safety.md) before changing release dependencies or pushing a production tag. The v2.1.48 incident proved that a successful source PR is not evidence that Electron's cross-platform native packaging works.

**Usage:** `/bump-version [version] [flags]`

- `/bump-version` — auto patch + latest AionCore
- `/bump-version 2.2.0` — explicit CSBU WorkMate version + latest AionCore
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

Resolve the repository explicitly and pass it to every `gh` command. Do not rely on the CLI's default repository when the checkout has both `origin` and `upstream` remotes:

```bash
gh repo view --json nameWithOwner --jq .nameWithOwner
```

### Step 2: Pull Latest

```bash
git pull --rebase origin main
```

Fails → Stop: "Failed to pull latest code. Please resolve conflicts or network issues first."

### Step 3: Determine CSBU WorkMate Target Version

Read `package.json` → extract `version` field.

- **Argument provided** → use as-is
- **No argument** → parse `major.minor.patch`, increment `patch` by 1

Display: "Bumping CSBU WorkMate: {current} → {target}"

### Step 4: Query AionCore Latest Release

**Skip entirely if `--skip-core` is set.**

```bash
gh release view --repo suoak/AionCore --json tagName,body
```

- If `--core <version>` provided → use that tag instead of latest
- Display the AionCore version and ask user to confirm before continuing
- Also read current `aioncoreVersion` from `package.json` — if it already matches the queried version, warn the user and ask whether to proceed or use `--skip-core`

### Step 5: Verify AionCore Artifacts

**Skip if `--skip-core`.**

```bash
gh release view <tag> --repo suoak/AionCore --json assets --jq '.assets[].name'
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

## [{target}](https://github.com/CSBU/CSBU-WorkMate/compare/v{previous}...v{target}) ({date YYYY-MM-DD})

### Desktop

#### Bug Fixes

- **upload:** abort in-flight uploads when switching conversations (#3019)

#### Features

- **thinking:** add streaming indicator (#3015)

### Core ([{core tag}](https://github.com/suoak/AionCore/releases/tag/{core tag}))

#### Bug Fixes

- **acp:** load user MCP servers and emit empty-finish diagnostic (#327)

---
```

Rules:

- If `--skip-core`: omit the entire "### Core" section
- If no frontend commits since last tag: show `_No frontend changes in this release._` under "### Desktop"
- Date format: `YYYY-MM-DD`
- Always keep the top-level `# Changelog` header exactly once

### Step 8: Release Dependency Compatibility Gate

Compare the candidate with the previous production tag:

```bash
git diff v{previous}..HEAD -- package.json bun.lock
```

Inspect at least `electron`, `electronRebuild.electronVersion`, `electron-builder`, native modules, and packaging scripts.

- If Electron or another native packaging dependency changed, it must be an independent PR and must complete the full six-platform desktop matrix on a prerelease candidate before a production tag is created.
- Keep `electron` and `electronRebuild.electronVersion` compatible. Do not assume a clean install, typecheck, or unit-test pass validates native rebuilding.
- Do not combine an unproven Electron major upgrade with the production version-bump PR.
- A failed production tag is immutable. Never delete, move, or overwrite it; fix the cause and increment to a new patch version.

### Step 9: Quality Checks

```bash
bun run lint
bun run format
bunx tsc --noEmit
```

- **lint fails** → Stop: "Lint errors found. Please fix them before bumping."
- **format** → Auto-fixes silently.
- **tsc fails** → Stop: "TypeScript errors found. Please fix them before bumping."

### Step 10: Run Tests

```bash
bunx vitest run
```

Fails → Stop: "Tests failed. Please fix before bumping."

### Step 11: Branch, Commit, Push

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

### Step 12: Create PR + Enable Auto-Merge

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

### Step 13: Poll for Merge

Check PR merge status every 5 minutes:

```bash
gh pr view {PR_NUMBER} --json state,mergedAt,mergeStateStatus
```

**Decision logic:**

| `state`                                                                     | Action                                                                                 |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `MERGED`                                                                    | Proceed to Step 14                                                                     |
| `CLOSED` (not merged)                                                       | Stop: "PR was closed without merging. Please check and confirm how to proceed."        |
| `OPEN` with `mergeStateStatus: BLOCKED` or CI failure persisting > 3 checks | Stop: "PR merge is blocked (CI failure or review required). Please investigate: {URL}" |
| `OPEN` otherwise                                                            | Wait 5 minutes, check again                                                            |

**Maximum wait:** 30 minutes (6 checks). If not merged after 30 minutes:

> "PR has not merged after 30 minutes. Please check status: {URL}. Reply 'continue' when merged, or 'abort' to stop."

**Wait for user confirmation only in this timeout case.**

### Step 14: Cleanup + Tag

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
gh run list --repo {owner/repo} --workflow build-and-release.yml --branch v{target} --limit 1 --json databaseId,url
```

The tag push is not release completion. Continue to Step 15.

### Step 15: Monitor, Publish, and Verify Release

Poll the workflow until it reaches a terminal state:

```bash
gh run view --repo {owner/repo} {run-id} --json status,conclusion,url,jobs
```

All of the following are mandatory:

1. Code Quality succeeds.
2. Desktop builds succeed for macOS x64/ARM64, Windows x64/ARM64, and Linux x64/ARM64.
3. Web CLI packages and smoke tests succeed.
4. Create Release succeeds.

Any required job failure → stop, inspect the exact failed step, fix it in a new version, and never reuse the failed production tag.

The workflow intentionally creates a draft. After every required job succeeds, inspect the draft assets, then publish it:

```bash
gh release view --repo {owner/repo} v{target} --json url,isDraft,isPrerelease,assets
gh release edit --repo {owner/repo} v{target} --draft=false
gh release view --repo {owner/repo} v{target} \
  --json url,isDraft,isPrerelease,publishedAt,assets
```

Release completion requires `isDraft == false`, a non-null `publishedAt`, and every expected asset in state `uploaded`. Verify Windows installers, both macOS architectures, both Linux architectures, updater metadata, checksums, Web CLI archives, and `install-web.sh`. Report the public `/releases/tag/v{target}` URL—not an `untagged-*` draft URL.

## Quick Reference

```
 1. Must be on clean main
 2. git pull --rebase
 3. Determine CSBU WorkMate target version (patch+1 or explicit)
 4. Query AionCore latest release (or --core / --skip-core)
 5. Verify AionCore artifacts (7 files)
 6. Edit package.json (version + aioncoreVersion)
 7. Generate CHANGELOG entry (frontend commits + AionCore release body)
 8. Check Electron/native packaging compatibility; use a prerelease candidate for changes
 9. lint + format + tsc
10. vitest run
11. branch → commit → push
12. gh pr create → enable auto-merge (squash)
13. poll merge status (every 5min, max 30min) → stop on failure
14. cleanup → git tag → git push tag
15. wait for every matrix job → inspect draft assets → publish → verify public release
```
