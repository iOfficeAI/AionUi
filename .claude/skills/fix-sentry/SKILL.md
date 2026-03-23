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

#### Step 1.2: Fetch High-Frequency Unresolved Issues

**Always include `is:unresolved`** to exclude issues already marked as resolved in Sentry.

```
mcp__sentry__list_issues(
  projectSlugOrId="electron",
  query="times_seen:>100 is:unresolved",
  sort="freq",
  limit=25
)
```

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

Classify each issue group into one of four categories using the decision flow below.

##### Step A: Skip — System-level or framework-internal errors

These errors originate outside our codebase and cannot be fixed by application code changes.
**Skip immediately** without further analysis.

| Error pattern                       | Source              | Action |
| ----------------------------------- | ------------------- | ------ |
| `write EPIPE` / `broken pipe`       | OS pipe closed      | Skip   |
| `ENOSPC: no space left on device`   | Disk full           | Skip   |
| `write EIO` (no app code in stack)  | I/O hardware/driver | Skip   |
| `uv__loop_interrupt`                | libuv internal      | Skip   |
| `SingletonCookie` / `SingletonLock` | Chromium internal   | Skip   |
| `ERR_INTERNET_DISCONNECTED`         | Network offline     | Skip   |

##### Step B: Direct fix — Stack trace points to our code

When a stack trace is available and points to our codebase:

| Criteria                                                   | Result |
| ---------------------------------------------------------- | ------ |
| Stack trace points to `src/` files in our repo             | Fix    |
| Error cause is clear from trace                            | Fix    |
| Fix is straightforward (null check, try-catch, type guard) | Fix    |
| Stack trace points to third-party lib only (no app code)   | Skip   |
| Fix requires architectural redesign                        | Skip   |

**Note on file paths:** Sentry stack traces reference build output paths (e.g., `src/common/chatLib.ts`).
After refactoring, files may have moved (e.g., → `src/common/chat/chatLib.ts`).
Use `Glob` to locate the actual file in the current codebase.

##### Step C: Defensive fix — No stack trace, but error pattern is identifiable

Some errors (especially native Node.js `fs`, `net` errors) are reported **without stack traces**.
These should NOT be automatically skipped — the error message itself often contains enough
information to locate the responsible code.

**Approach:** Extract distinctive patterns from the error message (file name fragments, path
structures, keywords), then search the codebase for code that produces or consumes matching
patterns. If a matching code path is found, trace its error handling and apply a defensive fix
(guards, try-catch, existence checks) even without 100% certainty it's the exact source.

| Scenario                                                | Result        |
| ------------------------------------------------------- | ------------- |
| Error pattern matches a code path in our codebase       | Defensive fix |
| Error is purely user-specific with no matching code     | Skip          |
| Error references app-internal files (config, resources) | Defensive fix |

##### Step D: Skip filters (apply to all categories)

| Condition                                  | Action                        |
| ------------------------------------------ | ----------------------------- |
| Has merged PR / mentioned in release notes | Skip (already fixed)          |
| Resolved with `inRelease` in Sentry        | Skip (already fixed)          |
| Has OPEN PR addressing the root cause      | Skip (or improve existing PR) |

##### Classification summary

Each issue ends up in one of these categories:

| Category          | Criteria                                           | Action                        |
| ----------------- | -------------------------------------------------- | ----------------------------- |
| **Direct fix**    | Stack trace → our code, clear cause                | Fix with targeted code change |
| **Defensive fix** | No stack trace, but error path matches our code    | Fix with defensive guards     |
| **Pending merge** | Existing OPEN PR addresses the root cause          | Skip or improve existing PR   |
| **Already fixed** | Merged PR / resolved in Sentry                     | Skip                          |
| **System-level**  | EPIPE, ENOSPC, EIO, uv, Chromium internal          | Skip                          |
| **Unfixable**     | No stack trace, no matching code path, third-party | Skip                          |

**Output a triage report** to the user before proceeding:

```
=== Sentry Issue Triage ===

Will fix — direct (N groups):
  1. [ELECTRON-XX] Error description (N events)
     → file:line — root cause summary

Will fix — defensive (N groups):
  1. [ELECTRON-YY] Error description (N events)
     → Pattern: "batch-export-*.zip" matches createZip in fsBridge.ts
     → Defensive fix: ensure parent directory exists before write

Fix pending merge (P groups):
  1. [ELECTRON-ZZ] Error description (N events)
     → PR #1234 (OPEN) — fix submitted but not yet merged/deployed

Skipped (M issues):
  1. [ELECTRON-AA] EPIPE (N events) → System-level: OS pipe closed
  2. [ELECTRON-BB] SingletonCookie (N events) → Chromium internal
  3. [ELECTRON-CC] Error (N events) → Already fixed: PR #456 merged

```

Output the triage report for transparency, then **proceed immediately** — do not wait for user confirmation.

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

Verification strategy depends on **which process** the error originates from.

**Determine process type from the Sentry stack trace:**

| Culprit path / error origin          | Process  | Verification method |
| ------------------------------------ | -------- | ------------------- |
| `src/process/`, `src/index.ts`       | main     | Unit tests only     |
| `src/process/worker/`                | worker   | Unit tests only     |
| `src/renderer/`, `src/common/` (IPC) | renderer | CDP + unit tests    |

##### Main / Worker process errors → Unit tests only

Most high-frequency Sentry errors originate from the main process (fs, net, cron, IPC bridge
providers). CDP (Chrome DevTools Protocol) connects to the renderer process and **cannot inspect
main or worker process errors**.

For these fixes:

1. Unit tests from Step 2.3 are the **primary and sufficient** verification
2. Quality checks from Step 2.4 must pass
3. No CDP verification needed — do not attempt it
4. Mark as **verified** if unit tests pass

##### Renderer process errors → CDP verification

Only use CDP when the error originates from renderer-side code (React components, UI hooks,
renderer-side IPC calls). These are errors visible in the browser DevTools console.

**Prerequisites:**

- `mcp__chrome-devtools__*` tools must be available
- CDP is enabled by default in dev mode on port 9230
- Start the app if not running: `bun run start &`
  Wait ~20s, then poll `mcp__chrome-devtools__list_pages` until pages appear.

**CRITICAL — MCP session rules:**

1. **NEVER run `claude mcp remove/add` mid-session** — tools become permanently unavailable.
2. The chrome-devtools MCP server connects to CDP lazily — app can be started during workflow.
3. If MCP tools return "No such tool", classify as skipped and rely on unit tests.

See [docs/cdp.md](../../docs/cdp.md) for CDP configuration details.

**CDP verification flow:**

1. Navigate to the relevant page using `mcp__chrome-devtools__navigate_page`
2. Reproduce the error scenario via `click`, `fill`, `press_key`, `evaluate_script`
3. Check for errors: `list_console_messages`, `take_screenshot`, `list_network_requests`
4. **Pass**: error no longer occurs. **Fail**: error still occurs or new error introduced.

**On failure — retry loop (max 3 attempts):**

Adjust the fix → re-run tests → re-run quality checks → re-verify.
After 3 failures, proceed to commit & PR but mark verification as FAILED.

**On success — collect evidence** (screenshots, console logs) for the PR.

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

#### Step 2.7: Wait for CI & Auto-Merge

After the PR is created and marked as Ready for Review, wait for all CI checks to pass,
then automatically merge the PR.

**Only auto-merge when ALL of these conditions are met:**

1. PR is marked as **Ready for Review** (not Draft)
2. All required CI checks pass (see list below)
3. No check is in `failure` state

**If the PR is Draft** (verification failed/skipped → `needs-manual-review`), skip auto-merge
and proceed to the next group.

**Polling flow:**

```bash
# Poll CI status (max 15 minutes, check every 30 seconds)
gh pr checks <pr-number> --repo <org>/<repo> --watch --fail-fast
```

If `gh pr checks --watch` is not available, use a manual polling loop:

```
max_wait = 900  # 15 minutes
interval = 30   # seconds
elapsed = 0

while elapsed < max_wait:
    checks = gh pr checks <pr-number>
    if all checks passed:
        break
    if any check failed:
        report failure, skip merge
        break
    sleep interval
    elapsed += interval

if elapsed >= max_wait:
    report timeout, skip merge
```

**CI checks to monitor (fast checks only — ignore slow Build Test jobs):**

| Check                      | Monitor |
| -------------------------- | ------- |
| Code Quality               | Yes     |
| Unit Tests (all platforms) | Yes     |
| Coverage Test              | Yes     |
| I18n Check                 | Yes     |
| Release Script Test        | Yes     |
| Build Test (all platforms) | Skip    |
| CodeQL / Analyze           | Skip    |

Only wait for the "Yes" checks above. Build and CodeQL jobs are slow and non-blocking
for bug-fix PRs — do not wait for them.

When polling, check only the monitored jobs. If all monitored checks pass, proceed to merge
even if Build Test / CodeQL are still pending or skipped.

**On all monitored checks passed — merge:**

```bash
gh pr merge <pr-number> --repo <org>/<repo> --squash --delete-branch
```

Use `--squash` to keep commit history clean. `--delete-branch` cleans up the remote branch.

**On any check failed:**

1. Do NOT merge
2. Add `ci-failed` label to the PR
3. Report the failed check(s) in the summary
4. Proceed to the next group

**On timeout (15 minutes):**

1. Do NOT merge
2. Add `ci-timeout` label
3. Report in summary that CI did not complete in time

#### Step 2.8: Return to Main

```bash
git checkout main
```

Proceed to the next group.

### Phase 3: Summary Report

After all groups are processed, output:

```
=== Fix Sentry Results ===

Fixed & Merged (N groups, covering X Sentry issues):
  1. [ELECTRON-5, ELECTRON-6X, ELECTRON-1A] Missing credentials in fetchModelList
     PR: <pr-url> (merged ✓)
     Issue: #<number>
     Verification: PASS — screenshot attached, no console errors
     CI: all checks passed, auto-merged via squash

  2. ...

Fixed, Pending Manual Review (P groups):
  1. [ELECTRON-YY] Worker process error
     PR: <pr-url> (draft)
     Verification: skipped — worker process, not verifiable via chrome-devtools
     → Requires manual review and merge

Fixed, CI Failed (F groups):
  1. [ELECTRON-ZZ] Error description
     PR: <pr-url> (ci-failed)
     → Failed check: Build Test (windows-x64)

Already fixed (M issues):
  1. [ELECTRON-6, ELECTRON-6Y] Unsupported message type 'finished'
     → Evidence: PR #456 merged in v1.8.31

Skipped (K issues):
  1. [ELECTRON-J] write EPIPE
     → Reason: System-level error, no application code

Total: N fixed (A auto-merged, B pending review, C ci-failed), M already fixed, K skipped
```

## Configuration

Default parameters (can be overridden via skill args):

| Parameter | Default  | Description              |
| --------- | -------- | ------------------------ |
| threshold | 100      | Minimum occurrence count |
| project   | electron | Sentry project slug      |
| sort      | freq     | Sort order for issues    |

Override example: `/fix-sentry threshold=50 project=electron`

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
