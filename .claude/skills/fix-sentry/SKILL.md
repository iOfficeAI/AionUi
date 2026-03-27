---
name: fix-sentry
description: |
  Auto-fix high-frequency Sentry issues: fetch issues > N occurrences, analyze stack traces,
  fix code, create GitHub issues, and submit PRs.
  Use when: (1) User says "/fix-sentry", (2) User asks to fix Sentry issues.
---

# Fix Sentry Skill

Automated workflow: Sentry issues → analyze → fix → GitHub Issue → PR.

**Announce at start:** "I'm using fix-sentry skill to find and fix high-frequency Sentry issues."

## Operating Modes

### Batch Mode (default)

Invocation: `/fix-sentry` or `/fix-sentry threshold=50`

- Uses the specified threshold (default 100) to fetch issues
- Runs full Phase 1 → Phase 2 → Phase 3
- Fixes all qualifying issues

### Daemon Mode

Invocation: `/fix-sentry limit=1` (from daemon script)

- Phase 1 uses **adaptive threshold descent**: starts at 100, lowers progressively until a fixable issue is found
- Fixes only 1 issue (controlled by `limit` parameter), then exits
- If no fixable issue exists at any threshold → outputs `[NO_FIXABLE_ISSUES]` and exits

## Prerequisites

- **Sentry MCP** must be configured (global or project scope) with `mcp__sentry__*` tools available
- **gh CLI** must be authenticated
- Working directory must be clean (`git status` shows no uncommitted changes)

## Workflow

### Phase 1: Collect & Filter Issues

#### Step 1.1: Verify Environment

```bash
git status --porcelain   # must be clean
git branch --show-current
```

If working directory is dirty, **STOP** and ask user to commit or stash first.

#### Step 1.2: Fetch Unresolved Issues

**Always include `is:unresolved`** to exclude issues already marked as resolved in Sentry.

##### Batch mode (no `limit` parameter or `limit=0`)

Use the specified `threshold` parameter (default 100) directly:

```
mcp__sentry__list_issues(
  projectSlugOrId="<project>",
  query="times_seen:><threshold> is:unresolved",
  sort="freq",
  limit=25
)
```

##### Daemon mode (`limit > 0`): Adaptive Threshold Descent

When `limit` is set, use **adaptive threshold descent** to find fixable issues. Start high and
lower progressively — this ensures the most impactful issues are fixed first.

**Threshold sequence:** 100 → 80 → 60 → 40 → 20 → 10

For each threshold in the sequence:

1. Fetch issues: `mcp__sentry__list_issues(query="times_seen:><threshold> is:unresolved", sort="freq", limit=25)`
2. Run Steps 1.3–1.6 (filter, deduplicate, triage)
3. If any "Needs fix" issues are found → proceed to Phase 2 with the top `limit` issues
4. If all issues are skipped (already fixed, system-level, unfixable) → log and try the next lower threshold

If **all thresholds are exhausted** with no fixable issues, enter **Deep Analysis Mode** (Step 1.2b).

##### Step 1.2b: Deep Analysis Mode — Issues Without Stack Traces

When no fixable issues remain at any standard threshold, search for issues that lack stack traces
but may still be fixable through code analysis:

```
mcp__sentry__list_issues(
  projectSlugOrId="<project>",
  query="!has:stacktrace is:unresolved",
  sort="freq",
  limit=10
)
```

For these issues, apply **Step C (Defensive fix)** logic from Step 1.6:

- Extract distinctive patterns from the error message (file names, paths, keywords)
- Search the codebase for matching code paths
- If a matching code path is found → classify as "Defensive fix" and proceed to Phase 2

If deep analysis also yields no fixable issues, output the following **exact text** and exit:

```
[NO_FIXABLE_ISSUES] All thresholds exhausted, no actionable issues found.
```

**This marker is machine-readable** — the daemon script uses it to determine backoff timing.

#### Step 1.3: Evidence-Based Filtering

Determine whether each issue has already been addressed. **Only skip issues with concrete evidence
of a fix** — version distribution alone is NOT sufficient to conclude an issue is fixed (the latest
release may simply have fewer users).

1. **Get the latest release version:**

   ```bash
   gh release list --repo <org>/<repo> --limit 3
   ```

2. **Search for existing fixes (concrete evidence required):**

   ```bash
   gh release view <latest-tag> --repo <org>/<repo>
   git log --oneline --since="<release-date>" --grep="<keyword-from-error>"
   ```

3. **Cross-reference with Sentry issue metadata:**
   - If the issue has a GitHub annotation linking to a **merged** PR, skip it
   - If the issue status is `resolved` with `inRelease`, skip it
   - If release notes explicitly mention a fix for this error, skip it

4. **Check for existing OPEN PRs:**

   ```bash
   gh pr list --repo <org>/<repo> --state open --search "<error-keyword>" --json number,title,state
   ```

   - If an OPEN PR already addresses this issue, do NOT create a duplicate
   - Classify as **"fix pending merge"** — the issue is still occurring because the fix hasn't been deployed yet
   - If the OPEN PR has quality issues (e.g., missing tests), note it for improvement

**Important: version distribution is supplementary info, NOT a skip criterion.**
"Only seen on v1.8.30, not on v1.8.31" does NOT mean the issue is fixed — the latest version
may have too few users to trigger the error. Include version info in the triage report for context,
but never use it as the sole reason to skip an issue.

**Classification criteria (three states):**

| Condition                                  | Classification    | Action                        |
| ------------------------------------------ | ----------------- | ----------------------------- |
| Has merged PR / mentioned in release notes | Already fixed     | Skip                          |
| Resolved with `inRelease` in Sentry        | Already fixed     | Skip                          |
| Has OPEN PR addressing the root cause      | Fix pending merge | Skip (or improve existing PR) |
| No concrete fix evidence found             | Needs fix         | Fix it                        |

#### Step 1.4: Deduplicate by Root Cause

Sentry creates separate issues for the same error across different releases or slight variations.
Group issues by their **root cause** (same function + same error type):

Example: ELECTRON-5, ELECTRON-6X, ELECTRON-1A are all `fetchModelList` + "Missing credentials"
→ Treat as **one fix group**, reference all Sentry IDs in the PR.

#### Step 1.5: Get Stack Traces (Rate-Limit Aware)

For each **unique issue group**, get details **one at a time**:

```
mcp__sentry__get_issue_details(issueUrl="<sentry-url>")
```

**Important:** Sentry API rate limit is 5 requests/second. Call `get_issue_details` sequentially,
never in parallel. If you hit a 429, wait a moment and retry.

Extract:

- Error message and type
- Stack trace (file paths, line numbers, function names)
- First/last seen timestamps
- Release version(s) affected
- Frequency and affected users count

#### Step 1.6: Triage — Can We Fix It?

Classify each issue group using the detailed decision flow in [references/triage-rules.md](references/triage-rules.md).

**Quick reference — six categories:**

| Category          | Action                                                   |
| ----------------- | -------------------------------------------------------- |
| **Direct fix**    | Stack trace → our code → fix                             |
| **Defensive fix** | No trace, but pattern matches our code → fix with guards |
| **Pending merge** | Open PR exists → skip or improve                         |
| **Already fixed** | Merged PR / resolved → skip                              |
| **System-level**  | EPIPE, ENOSPC, EIO, uv, Chromium → skip                  |
| **Unfixable**     | No trace, no matching code → skip                        |

**Output a triage report** (see [references/report-template.md](references/report-template.md) for format),
then **proceed immediately** — do not wait for user confirmation.

### Phase 2: Fix Issues (Serial, One Group at a Time)

Phase 2 handles two types of work:

- **New fixes**: issues with no existing PR → full flow (Steps 2.1–2.7)
- **Pending-merge fixes**: issues with an OPEN PR that needs improvement (e.g., missing tests)
  → checkout existing branch, add tests, push update (Steps 2.1b–2.5, then 2.7)

Process all groups serially: pending-merge groups first (quick improvement), then new fixes.

#### Step 2.1: Create Branch (New Fix)

For issues with **no existing PR**:

```bash
git checkout main
git pull origin main
git checkout -b fix/sentry-<primary-issue-shortId>
```

Branch naming: `fix/sentry-<shortId>` using the highest-frequency issue in the group
(e.g., `fix/sentry-ELECTRON-6X`).

#### Step 2.1b: Checkout Existing Branch (Pending-Merge Fix)

For issues with an **existing OPEN PR** that needs improvement (e.g., missing tests):

```bash
# Get the branch name from the PR
gh pr view <pr-number> --repo <org>/<repo> --json headRefName --jq '.headRefName'
# Checkout and sync
git checkout <branch-name>
git pull origin <branch-name>
```

Then skip Step 2.2 (code fix already exists) and go directly to Step 2.3 (Write Tests).

#### Step 2.2: Locate and Fix Code

1. Use `Glob` to find the actual file path (may differ from Sentry stack trace due to refactoring)
2. Read the file(s) identified in the stack trace
3. Understand the surrounding context (read neighboring code, types, callers)
4. Implement the minimal fix:
   - Add null/undefined guards
   - Add try-catch for unhandled exceptions
   - Fix incorrect type assertions
   - Add missing error handling
   - Fix race conditions with proper async handling
5. **Do NOT** refactor surrounding code — fix only the reported issue

#### Step 2.3: Write Tests for the Fix

**Every bug fix MUST have a corresponding unit test.** This is enforced by the commit skill
and the testing skill — do not skip it.

1. Check if a test file already exists for the modified module (e.g., `utils.test.ts` for `utils.ts`)
2. If no test file exists, create one following the [testing skill](../testing/SKILL.md) conventions
3. Write test(s) that:
   - **Reproduce the bug**: a test that would have failed before the fix
   - **Verify the fix**: the same test now passes with the fix applied
   - Cover at least one failure path (e.g., null input, missing key, invalid URL)
4. Run `bun run test` to confirm the new tests pass
5. If the fix is in code that's hard to unit test (e.g., deep Electron API dependency),
   document why in a code comment and add the closest possible test

**Examples of good fix tests:**

- Fix: added null check for `apiKey` → Test: call function with `undefined` apiKey, assert graceful error
- Fix: wrapped `fs.readdir` in try-catch → Test: mock `fs.readdir` to throw EPERM, assert no crash
- Fix: validated URL before `new URL()` → Test: pass invalid URL string, assert error response

#### Step 2.4: Quality Checks

Run quality checks with fallback commands. Some projects use `bun run` scripts,
others need direct `npx`/`bunx` invocation. Try the script first, fall back to direct invocation.

```bash
# Lint — try script first, fall back to npx
bun run lint:fix 2>/dev/null || npx oxlint --fix

# Format — try script first, fall back to npx
bun run format 2>/dev/null || npx oxfmt

# Type check — always works
bunx tsc --noEmit

# Tests — run if available, warn if test script is missing
bun run test 2>/dev/null || echo "Warning: no test script found, skipping tests"
```

**Type check must pass.** Lint and format are best-effort with fallback.
If tests fail due to the fix, adjust the fix. If tests fail for unrelated reasons, note it in the PR.

#### Step 2.5: Verify Fix

Verification strategy depends on **which process** the error originates from:

| Culprit path / error origin          | Process  | Verification method |
| ------------------------------------ | -------- | ------------------- |
| `src/process/`, `src/index.ts`       | main     | Unit tests only     |
| `src/process/worker/`                | worker   | Unit tests only     |
| `src/renderer/`, `src/common/` (IPC) | renderer | CDP + unit tests    |

- **Main / Worker**: unit tests from Step 2.3 are sufficient. Mark as **verified** if tests pass.
- **Renderer**: use CDP for live verification. See [references/cdp-verification.md](references/cdp-verification.md) for full flow.

#### Step 2.6: Commit & Create PR

**Delegate to existing skills** — do not manually construct commit messages or PR bodies.

**Pre-flight duplicate check** (safety net, supplements triage-phase filtering):

```bash
gh pr list --repo <org>/<repo> --state open --search "<error-keyword-or-file>" --json number,title
gh issue list --repo <org>/<repo> --state open --search "<error-keyword>" --json number,title
```

If an existing OPEN PR/issue addresses the same root cause, **STOP** — do not create a duplicate.
Instead, report to the user and suggest updating the existing PR if needed.

1. **Commit**: Invoke the [commit skill](../commit/SKILL.md) (`/commit`).
   The commit skill will analyze changes, run quality checks, format the commit message,
   and handle all conventions (no AI signatures, no --no-verify, etc.).
   Provide context: this is a Sentry bug fix, reference the Sentry issue IDs.

2. **Create PR as Draft**: Invoke the [PR skill](../pr/SKILL.md) (`/pr`).
   The PR skill will create a GitHub issue if needed, push the branch, and create the PR
   with proper formatting and issue linkage.
   **Always create as Draft** (`gh pr create --draft`) — PR starts in WIP state.
   Provide context: include Sentry issue IDs, occurrence counts, error details,
   **and verification results** (screenshots, console logs, pass/fail status)
   so the PR skill can incorporate them into the issue and PR body.

3. **Mark PR Ready based on verification result:**

   | Process  | Verification Result             | PR Action                                            |
   | -------- | ------------------------------- | ---------------------------------------------------- |
   | main     | Unit tests pass                 | `gh pr ready <pr-number>` — mark as Ready for Review |
   | main     | Unit tests fail / not writable  | Keep as Draft, add `needs-manual-review` label       |
   | renderer | CDP pass                        | `gh pr ready <pr-number>` — mark as Ready for Review |
   | renderer | CDP fail (3 attempts exhausted) | Keep as Draft, add `needs-manual-review` label       |

   ```bash
   # On pass (unit tests pass for main, or CDP pass for renderer):
   gh pr ready <pr-number>

   # On fail:
   gh pr edit <pr-number> --add-label "needs-manual-review"
   ```

This ensures all commits and PRs follow the project's established conventions
without duplicating rules across skills.

#### Step 2.7: Return to Main

```bash
git checkout main
```

Proceed to the next group.

### Phase 3: Summary Report

After all groups are processed, output a summary report.
See [references/report-template.md](references/report-template.md) for the exact format.

## Configuration

Default parameters (can be overridden via skill args):

| Parameter | Default  | Description                                                        |
| --------- | -------- | ------------------------------------------------------------------ |
| threshold | 100      | Minimum occurrence count (batch mode only)                         |
| project   | electron | Sentry project slug                                                |
| sort      | freq     | Sort order for issues                                              |
| limit     | 0        | Max issues to fix per invocation (0 = unlimited, >0 = daemon mode) |

Override examples:

- Batch mode: `/fix-sentry threshold=50 project=electron`
- Daemon mode: `/fix-sentry limit=1 project=electron`

## Mandatory Rules

### No AI Signature

**NEVER add any AI-related signatures** to commits, PRs, or issues.

### Minimal Fix Only

Fix the reported error. Do NOT refactor, add features, or "improve" surrounding code.

### No Blocking Questions

The entire workflow runs end-to-end without stopping for user confirmation.
Output the triage report for transparency, then proceed immediately.
The goal is uninterrupted automation — questions block the flow.

### No Duplicate PRs

Before creating a new PR/issue, always check for existing OPEN PRs addressing the same root cause.
If found, improve the existing PR (e.g., add missing tests) instead of creating a duplicate.

### One Root Cause = One Branch = One PR

Group duplicate Sentry issues by root cause. Each unique root cause gets one branch, one GitHub issue, and one PR.

### Rate Limit Awareness

Sentry API has a rate limit of ~5 requests/second. Always call `get_issue_details` sequentially, never in parallel.

### Skill Changes Stay Separate

Do NOT include changes to `.claude/skills/` in bug-fix branches. Skill updates should go through their own branch and PR.
