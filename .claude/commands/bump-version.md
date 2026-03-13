# Bump Version

Automate the AionUi version bump workflow: update version, install, branch, commit, push, and create PR.

## Usage

```
/bump-version [version]
```

- `/bump-version 1.8.17` — bump to the specified version
- `/bump-version` — no argument: auto-increment patch of the current version (e.g. `1.8.16` → `1.8.17`)

---

## Steps

### Step 1 — Pre-flight Checks

Run these commands and verify both conditions. If either fails, **stop immediately**.

```bash
git branch --show-current
git status --short
```

- **Not on `main`** → Stop: "Please switch to the main branch before running bump-version."
- **Working tree is dirty** (output is non-empty) → Stop: "There are uncommitted changes. Please commit or stash them first."

### Step 2 — Pull Latest Code

```bash
git pull --rebase origin main
```

- **Fails** → Stop: "Failed to pull latest code. Please resolve conflicts or network issues first."

### Step 3 — Read Current Version

Read `package.json` and extract the `version` field value (e.g. `"1.8.16"`).

### Step 4 — Determine Target Version

- **Argument provided**: Use the supplied version string as-is.
- **No argument**: Parse the current version as `major.minor.patch`, increment `patch` by 1, and assemble the new version string.

Display: "Bumping version: {current} → {target}"

### Step 5 — Update package.json

Use the Edit tool to replace the `version` field in `package.json`:

- old: `"version": "{current}"`
- new: `"version": "{target}"`

### Step 6 — Run bun install

```bash
bun install
```

This verifies dependency consistency. `bun.lock` should NOT change when only `version` is bumped.

### Step 7 — Verify bun.lock is unchanged

```bash
git diff bun.lock
```

- **No diff** → Proceed silently (normal case).
- **Has diff** → Ask the user: "bun.lock changed unexpectedly after version bump. Continue?" Wait for confirmation before proceeding.

### Step 8 — Run Quality Checks

```bash
bun run lint
bunx tsc --noEmit
```

- **lint fails** → Stop: "Lint errors found. Please fix them before bumping the version."
- **tsc fails** → Stop: "TypeScript errors found. Please fix them before bumping the version."
- **Both pass** → Proceed silently.

### Step 9 — Run Tests

```bash
bunx vitest run
```

- **Fails** → Stop: "Tests failed. Please fix failing tests before bumping the version."
- **Passes** → Proceed silently.

### Step 10 — Create Branch

```bash
git checkout -b chore/bump-version-{target}
```

### Step 11 — Commit

```bash
git add package.json
git commit -m "chore: bump version to {target}"
```

### Step 12 — Push

```bash
git push -u origin chore/bump-version-{target}
```

### Step 13 — Create PR

```bash
gh pr create --base main --title "chore: bump version to {target}" --body "Bump version to {target}"
```

Display the PR URL to the user when done.
