---
name: open-pr
description: |
  Workflow and standards for preparing, validating, submitting, and monitoring Pull Requests in AionUi.
  Use when: (1) Preparing changes for a pull request, (2) Submitting a PR, (3) Resolving CI failures or Codecov coverage comments.
---

# Pull Request (PR) Skill

Standards, checklist, and lifecycle workflow for submitting, verifying, and monitoring Pull Requests in the AionUi repository.

**Announce at start:** "I'm using the open-pr skill to prepare and validate the pull request workflow."

## Core Principles

### 1. Rule 1: Strictly Atomic PRs

Every pull request must contain **exactly one feature or one bug fix** that cannot be further decomposed.

- **Check yourself:** Ask: _"Can this diff be split into multiple independently mergeable PRs?"_ If yes, split it into separate branches and PRs before submitting.
- **Never bundle:**
  - Feature work + unrelated refactoring/cleanups.
  - Fixes for different subsystems.
  - New features + unrelated documentation/skills.
  - Backend/IPC changes for feature A + renderer components for feature B.

### 2. Rule 2: Commit and PR Title Conventions

Commit messages and PR titles must strictly use the Conventional Commits format in English:

```text
<type>(<scope>): <subject>
```

- Allowed types: `feat`, `fix`, `perf`, `refactor`, `docs`, `style`, `chore`, `test`, `ci`, `build`.
- Scope should clearly indicate the affected module (e.g., `stt`, `conversation`, `workspace`, `preview`, `settings`).
- **NO AI Signatures**: Never add AI badges, generated-by notes, or co-author signatures (`Co-Authored-By`, `Generated with`, etc.) in commit messages or PR descriptions.

### 3. Rule 3: Codecov & Test Coverage Requirements

The repository enforces strict test coverage checks on pull requests via Codecov:

- **Target Threshold**: The project target is **≥ 80%** test coverage; Codecov sets a hard patch coverage minimum of **50%** (`codecov.yml`).
- **Every new or meaningfully modified file must have unit/DOM tests**:
  - Main process & services: `tests/unit/process/` or `tests/unit/<domain>/` (`*.test.ts`)
  - Cross-process IPC bridges: mock providers and emitters in unit tests.
  - Renderer components & hooks: `tests/unit/renderer/` (`*.dom.test.tsx`)
- **Automated tests only**: Manual testing in the browser or app does not register coverage in CI. All execution branches must be exercised through Vitest.
- **Cross-platform mock awareness**:
  - CI runs tests on Ubuntu Linux, macOS, and Windows.
  - If code relies on native binaries or platform-specific APIs, mock `process.platform` and `process.arch` to exercise all execution paths regardless of runner OS.

### 4. Rule 4: Internationalization (i18n)

Any user-facing string added or modified must use i18n keys across all 13 supported languages. Hardcoded user-facing strings are strictly forbidden.

---

## Step-by-Step PR Lifecycle

### Step 1: Pre-Submission Local Verification

Before committing or pushing, run all local verification gates in order:

```bash
# 1. Format code (ts, tsx, css, json, md)
bun run format

# 2. Lint and auto-fix issues
bun run lint:fix

# 3. TypeScript type check
bunx tsc --noEmit

# 4. i18n validation (if renderer, locales, or i18n config were touched)
bun run i18n:types
node scripts/check-i18n.js

# 5. Verify test coverage locally
bun run test:coverage
```

Verify that the patch coverage for your changed files satisfies the **≥ 80%** target.

### Step 2: Push Using `just push`

Always use `just push`, **NEVER** `git push`:

```bash
just push -u origin <branch-name>
```

`just push` automatically runs lint, format checks, type checking, and the complete test suite before pushing to GitHub. If any step fails, the push is safely aborted.

### Step 3: Open the Pull Request

Open the pull request targeting `upstream/main` (`iOfficeAI/AionUi`):

```bash
gh pr create \
  --repo iOfficeAI/AionUi \
  --base main \
  --head <fork-owner>:<branch-name> \
  --title "<type>(<scope>): <subject>" \
  --body-file .github/pull_request_template.md
```

Fill in the PR description and checklists honestly:

- State clearly what changed and why.
- Provide step-by-step verification instructions.
- Only check items in the template checklist that were actually run and verified.

### Step 4: Monitor CI and Bot Feedback

After submitting the PR, monitor the CI runs:

```bash
# Check status of GitHub Actions
gh pr checks <PR_NUMBER> -R iOfficeAI/AionUi
```

#### Handling Codecov Comments

If Codecov comments with a patch coverage warning (e.g. `Patch coverage is XX% with YY lines missing`):

1. **Inspect uncovered files**: Check the bot comment table for lines reported as missing coverage.
2. **Add targeted tests**: Switch to the branch, locate the uncovered branches (happy path, error handling, edge cases), and write unit tests in `tests/unit/`.
3. **Verify locally**: Run `bun run test:coverage <test-path>` and inspect `coverage/lcov.info` to confirm all missing lines are now covered.
4. **Push updates**: Commit with `test(<scope>): ...` and push with `just push -u origin <branch-name>`.

#### Handling Multi-Platform CI Failures

The CI matrix executes on:

- `ubuntu-latest`
- `macos-14`
- `windows-2022`

If a platform fails:

- Check path separators: always use `path.join()` or POSIX normalization, never hardcoded `/` or `\\`.
- Check case sensitivity: Linux file systems are case-sensitive; verify file imports match exact filename casing.
- Check timeout allowances: Windows runners may need higher test timeouts for heavy DOM rendering.

---

## PR Checklist Summary

Before considering a PR complete:

- [ ] Atomic: contains exactly one feature or bugfix
- [ ] Conventional Commit title without AI signatures
- [ ] File directory limits respected (≤ 10 children per directory)
- [ ] All 13 i18n locale JSON files updated if user-facing strings changed
- [ ] `bun run lint:fix` passes with 0 errors
- [ ] `bun run format` applied
- [ ] `bunx tsc --noEmit` passes with 0 errors
- [ ] Patch test coverage meets ≥ 80% (exceeding Codecov 50% minimum)
- [ ] Pushed via `just push`
- [ ] GitHub Actions CI checks all passing (Ubuntu, macOS, Windows)
- [ ] Codecov patch status green
