---
name: fix-issues
description: |
  Auto-fix GitHub issues labeled as bugs: fetch open bug issues, analyze feasibility,
  fix code, and submit PRs. One issue per invocation.
  Use when: (1) User says "/fix-issues", (2) User asks to fix GitHub issues.
---

# Fix Issues Skill

Automated workflow: GitHub bug issues → analyze → fix → PR.

**Announce at start:** "I'm using fix-issues skill to find and fix a GitHub bug issue."

## Operating Modes

### Batch Mode (default)

Invocation: `/fix-issues`

- Fetches open bug issues, finds the best candidate, fixes it
- Runs full Phase 1 → Phase 2 → Phase 3
- Fixes 1 issue per invocation

### Daemon Mode

Invocation: `/fix-issues limit=1` (from daemon script)

- Phase 1 uses **priority descent**: high-signal issues first, then progressively lower
- Fixes only 1 issue (controlled by `limit` parameter), then exits
- If no fixable issue exists → outputs `[NO_FIXABLE_ISSUES]` and exits

## Prerequisites

- **gh CLI** must be authenticated
- Working directory will be auto-cleaned (stash + checkout main) at startup

## Workflow

### Phase 1: Collect & Filter Issues

#### Step 1.1: Verify Environment

```bash
git status --porcelain
git branch --show-current
```

If working directory has **staged or modified tracked files**, stash them and proceed:

```bash
git stash -m "fix-issues: auto-stash before starting"
```

**Do NOT use `--include-untracked`** — untracked files (like skill files not yet merged to main)
must remain in the working directory.

Then switch to main:

```bash
git checkout main
git pull origin main
```

#### Step 1.1b: Load Skip List (Daemon Mode Only)

In daemon mode (`limit > 0`), load the skip list to avoid re-analyzing issues that were already
triaged in previous sessions. The skip list is stored at:

```
~/.aionui-fix-issues/skip-list.json
```

Format:

```json
{
  "1782": { "reason": "already_fixed", "summary": "PR #1800 merged" },
  "1707": { "reason": "environment_issue", "summary": "Kaspersky antivirus blocking" },
  "1697": {
    "reason": "needs_more_info",
    "summary": "Missing reproduction steps",
    "commented_at": "2026-03-27T12:00:00Z"
  },
  "1774": {
    "reason": "fix_failed",
    "summary": "Type check failed after 3 attempts",
    "commented_at": "2026-03-27T14:00:00Z"
  }
}
```

Entries **never expire**. Re-analysis is triggered only by concrete signals.

**On load:**

1. Read the file (if it doesn't exist, start with an empty skip list)
2. All entries remain active (no expiry logic)

**During Phase 1.2 (Fetch Issues):**

When iterating through fetched issues, if an issue number is in the active skip list,
check whether re-analysis is warranted based on the reason:

| Reason              | Re-analyze condition                                | How to check                                     |
| ------------------- | --------------------------------------------------- | ------------------------------------------------ |
| `needs_more_info`   | New comment on issue since `commented_at`           | `gh api` check (see below)                       |
| `fix_failed`        | New comment on issue since `commented_at`           | `gh api` check (see below)                       |
| `already_fixed`     | Issue was **reopened** (state changed back to open) | Already filtered by `--state open` in fetch      |
| `fix_pending_merge` | Linked PR was **closed without merge**              | `gh pr list --state closed --search "<keyword>"` |
| `environment_issue` | **Always** — re-run Classification Gate (Grep)      | Run Step 1.4 gate on every `environment_issue`   |
| `unclear_unfixable` | **Always** — re-run Classification Gate (Grep)      | Run Step 1.4 gate on every `unclear_unfixable`   |

**Re-analysis for `environment_issue` / `unclear_unfixable` (MANDATORY):**

These classifications are error-prone and must be re-verified every session. For each
`environment_issue` or `unclear_unfixable` entry in the skip list:

1. Extract keywords from the skip-list `summary` field
2. Run `Grep` against `src/` with those keywords
3. If matching code is found → **remove from skip list and re-analyze** as `direct_fix` or `defensive_fix`
4. If no matching code → keep in skip list

This prevents misclassifications from becoming permanent. The Grep check is cheap and
ensures issues with code paths in our repo are never permanently skipped.

**Comment check for `needs_more_info` / `fix_failed`:**

First, get the authenticated user login (the bot account):

```bash
BOT_LOGIN=$(gh api user --jq '.login')
```

Then check for comments from **other users** after `commented_at`:

```bash
gh api repos/iOfficeAI/AionUi/issues/<number>/comments \
  --jq '[.[] | select(.created_at > "<commented_at>" and .user.login != "'$BOT_LOGIN'")] | length'
```

- If result > 0 → **remove from skip list and re-analyze**
  Log: `Re-analyzing #1697 (new comments from other users since last attempt)`
- If result == 0 → **skip**
  Log: `Skipping #1697 (needs_more_info — no new comments from others)`

This ensures:

- Our own bot comments (analysis started, fix failed, needs info) are excluded
- Only human-provided information triggers re-analysis

**In batch mode (`limit=0`):** skip list is ignored — always analyze everything fresh.

#### Step 1.2: Fetch Open Bug Issues

```bash
gh issue list --repo iOfficeAI/AionUi --state open --label bug --limit 50 \
  --json number,title,body,labels,assignees,comments,createdAt
```

##### Filtering Pipeline

Apply these filters **in order** to narrow down candidates:

**Filter 1 — No assignee:**

```
assignees == [] (nobody is working on it)
```

**Filter 2 — Has sufficient description:**

Issue body must contain at least ONE of:

- Error message or stack trace
- Steps to reproduce
- Log output
- Screenshot (image link) — will be analyzed in Step 1.3e
- Code snippet or file path reference

Issues with empty body, only a title, or body like `[Bug]:` with no content → **skip**.

**Note:** Issues with screenshots as the only detail should NOT be skipped here.
Pass them through to Step 1.3e for image analysis before deciding.

**Filter 3 — No linked PR (open or merged):**

```bash
# Check if this issue already has a linked PR (via "Closes #N" or manual link)
gh api repos/iOfficeAI/AionUi/issues/<number>/timeline --jq \
  '[.[] | select(.event == "cross-referenced" and .source.issue.pull_request != null)] | length'
```

If the issue has any linked PR (open or merged) → **skip** (classify as "fix pending merge" or "already fixed").

This catches PRs created by this skill (which use `Closes #N`) as well as manually linked PRs.

##### Priority Descent (Daemon Mode)

In daemon mode, evaluate candidates in this priority order:

1. **Tier 1 — Has error/stack trace in body**: highest signal, most likely fixable
2. **Tier 2 — Has file/function reference**: mentions specific code locations
3. **Tier 3 — Has reproduction steps only**: may be fixable through investigation
4. **Tier 4 — Vague description**: lowest priority, skip if nothing better exists

For each tier, attempt triage (Step 1.4). If a fixable issue is found, proceed.
If all issues in a tier are unfixable, move to the next tier.

If **all tiers are exhausted** with no fixable issues, output:

```
[NO_FIXABLE_ISSUES] All tiers exhausted, no actionable issues found.
```

#### Step 1.3: Deduplicate by Root Cause

After selecting a candidate issue to fix, **search for sibling issues** that describe the same
underlying problem. Multiple users often file separate issues for the same bug.

**Step 1.3a: Extract signature from the candidate issue:**

Pull distinctive identifiers from the issue body:

- Error message (e.g., `TypeError: Cannot read properties of null (reading 'addInstance')`)
- Component/module name (e.g., `JsonImportModal`, `OfficeDocViewer`)
- File path (e.g., `src/renderer/components/McpManager.ts`)
- Behavior description keywords (e.g., "white screen", "crashes on close")

**Step 1.3b: Search for sibling issues:**

```bash
# Search by error message fragment
gh issue list --repo iOfficeAI/AionUi --state open --label bug --limit 50 \
  --search "<error-message-fragment>" --json number,title,body

# Search by component name
gh issue list --repo iOfficeAI/AionUi --state open --label bug --limit 50 \
  --search "<component-name>" --json number,title,body
```

**Step 1.3c: Confirm same root cause:**

For each candidate sibling, verify it describes the **same code-level problem** (not just similar
symptoms). Two issues are siblings if they share at least TWO of:

- Same error type/message
- Same component/file
- Same trigger action (e.g., "toggle MCP server", "import JSON")

**Step 1.3d: Merge into one fix group:**

Group all confirmed siblings. The PR will:

- Fix the shared root cause once
- Reference all issue numbers: `Closes #1786, closes #1771, closes #1778`
- Branch name uses the lowest issue number: `fix/issue-1771`

Example: #1786 and #1771 are both `JsonImportModal` + "invalid JSON" crashes
→ One fix group, one branch, one PR closing both issues.

#### Step 1.3e: Analyze Screenshots in Issue Body

Issue bodies often contain screenshots as the **only** source of error information (especially
for UI bugs, error dialogs, and Chinese-language reports). Before triaging, extract and analyze
all images to avoid misclassifying issues as `needs_more_info`.

**When to analyze:** If the issue body contains image markdown (`![Image](url)` or
`<img ... src="url" ...>`) AND the text description alone is insufficient for triage.

**How to analyze:**

```bash
# Extract image URL from issue body (GitHub user-attachments format)
curl -sL -o /tmp/issue-<number>-<index>.png "<image-url>"
```

Then use `Read` to view the downloaded image. Claude can understand screenshots and extract:

- Error messages and dialog text
- UI state (which page, which component, which mode)
- Console errors visible in DevTools
- Stack traces shown in error overlays
- Application version, model selection, and configuration visible in the UI

**Important rules:**

- Download images to `/tmp/` — do NOT commit them to the repo
- Only analyze images from `github.com` or `user-attachments` domains (trusted sources)
- If the image reveals error text or component names, use them for codebase search in triage
- If the image is a generic UI screenshot with no error information, it adds no triage value — skip

**Example:** Issue #1298 has only a screenshot. Downloading and reading it reveals:
"Internal error" on first message with Sonnet + Claude Code backend → searchable error path.

#### Step 1.4: Triage — Can We Fix It?

Classify each issue/group using the detailed decision flow in
[references/triage-rules.md](references/triage-rules.md).

##### Classification Gate (MANDATORY)

For EVERY candidate issue, you MUST complete this gate before assigning a classification:

1. Extract 2-3 keywords from the issue (error message, component, file path, behavior)
2. Run `Grep` against `src/` for each keyword
3. Record whether matching code was found: `[MATCH]` or `[NO MATCH]`
4. Apply the gate rule below

**Gate rule — code match blocks skip classifications:**

- `Grep` found matching code in `src/` → classification MUST be `direct_fix` or `defensive_fix`.
  You CANNOT classify as `environment_issue` or `unclear_unfixable` when our code handles the
  relevant path. Even if the root cause is external (third-party API, packaged app, platform),
  our code can add guards, fallbacks, or adapter logic.
- `Grep` found NO matching code → may classify as `environment_issue` or `unclear_unfixable`

**Include the gate result in the triage report** for each issue:

```
#1619: keywords=["cowork", "ENOENT", "rules"] → [MATCH] fsBridge.ts:748 → direct_fix
#1707: keywords=["Kaspersky", "antivirus"] → [NO MATCH] → environment_issue
```

##### Quick reference — seven categories

| Category              | Action                                                            |
| --------------------- | ----------------------------------------------------------------- |
| **Direct fix**        | Error + code path identified → fix                                |
| **Defensive fix**     | Pattern matches our code → fix with guards                        |
| **Pending merge**     | Open PR exists → skip or improve                                  |
| **Already fixed**     | Recent commit addresses it → skip                                 |
| **Environment**       | **Zero** matching code in `src/`, entirely external → skip        |
| **Needs more info**   | Cannot construct any search query from description → skip+comment |
| **Unclear/unfixable** | **Zero** matching code, AND needs new system design → skip        |

**Output a triage report** (see [references/report-template.md](references/report-template.md)
for format), then **proceed immediately** — do not wait for user confirmation.

#### Step 1.5: Comment on `needs_more_info` Issues (Mandatory)

**After triage, before moving to Phase 2**, comment on EVERY issue classified as `needs_more_info`.
This step is mandatory — without a comment, the skip-list `commented_at` field is meaningless
and re-analysis will never be triggered.

```bash
gh issue comment <number> --repo iOfficeAI/AionUi --body "$(cat <<'EOF'
🔍 **Automated analysis — needs more info**

This issue was analyzed but cannot be fixed automatically due to insufficient detail.

**What would help:**
- <specific missing info>

Once the above is provided, this issue will be re-analyzed automatically.
EOF
)"
```

Record the current UTC timestamp as `commented_at` for the skip-list entry.
Do NOT comment on issues skipped by filters (has assignee, has linked PR, etc.).

### Phase 2: Fix the Issue

#### Issue Comments

Comment on the issue at key stages to keep reporters informed and enable follow-up.
Use `gh issue comment` — all comments should be concise and actionable.

**Comment 1 — Start (after triage selects this issue):**

```bash
gh issue comment <number> --repo iOfficeAI/AionUi --body "$(cat <<'EOF'
🔍 **Automated analysis started**

Analyzing this issue for an automated fix. Will update with results.
EOF
)"
```

**Comment 2a — Success (after PR is created):**

```bash
gh issue comment <number> --repo iOfficeAI/AionUi --body "$(cat <<'EOF'
✅ **Fix submitted**

PR: <pr-url>

- Root cause: <one-line summary>
- Fix: <one-line summary of what changed>
- Tests: passing
EOF
)"
```

**Comment 2b — Abandoned (if fix fails after 3 attempts):**

```bash
gh issue comment <number> --repo iOfficeAI/AionUi --body "$(cat <<'EOF'
❌ **Automated fix unsuccessful**

Attempted to fix this issue but could not produce a passing solution.

**What was tried:** <brief description of approach>
**Why it failed:** <type check failure / test failure / could not locate code>

<If missing info — add specific questions:>
**To help with a future fix attempt, it would be useful to have:**
- <specific missing info, e.g., "full stack trace", "steps to reproduce", "Electron version">

A future attempt will be made if more information is provided.
EOF
)"
```

**Comment 2c — Skipped during triage (insufficient info):**

```bash
gh issue comment <number> --repo iOfficeAI/AionUi --body "$(cat <<'EOF'
🔍 **Automated analysis — needs more info**

This issue was analyzed but cannot be fixed automatically due to insufficient detail.

**What would help:**
- <specific missing info>

Once the above is provided, this issue will be re-analyzed automatically.
EOF
)"
```

**Important:** Only comment on issues that were actually analyzed or attempted. Do NOT comment
on issues that were skipped by filters (no assignee, has linked PR, etc.).

#### Step 2.1: Create Branch

```bash
git checkout main
git pull origin main
git checkout -b fix/issue-<number>
```

Branch naming: `fix/issue-<number>` using the primary issue number.

#### Step 2.2: Locate and Fix Code

**Architecture rules (must follow):**

- `src/process/` = main process — no DOM APIs
- `src/renderer/` = renderer — no Node.js APIs
- `src/process/worker/` = fork workers — no Electron APIs
- Cross-process communication MUST go through IPC bridge (`src/preload.ts`)
- Use path aliases: `@/*`, `@process/*`, `@renderer/*`, `@worker/*`
- Use `@arco-design/web-react` for UI components, `@icon-park/react` for icons
- Prefer `type` over `interface`, no `any`, no implicit returns

1. Extract clues from the issue body:
   - Error messages → `Grep` for the exact string
   - File paths → `Glob` to locate the file
   - Component names → search for the component
   - Function names → search for the function
2. Read the file(s) identified
3. Understand the surrounding context (read neighboring code, types, callers)
4. Implement the minimal fix:
   - Add null/undefined guards
   - Add try-catch for unhandled exceptions
   - Fix incorrect type assertions
   - Add missing error handling
   - Fix race conditions with proper async handling
   - Fix validation logic
5. **Do NOT** refactor surrounding code — fix only the reported issue

#### Step 2.3: Write Tests for the Fix

**Every bug fix MUST have a corresponding unit test.** No exceptions — if you cannot write a
test for the fix, the issue is not fixable by this skill. Skip it and move to the next candidate.

1. Check if a test file already exists for the modified module (e.g., `foo.test.ts` for `foo.ts`)
2. If no test file exists, create one colocated with the source file
3. Write test(s) that:
   - **Reproduce the bug**: a test that would have failed before the fix
   - **Verify the fix**: the same test now passes with the fix applied
   - Cover at least one failure path

**Test conventions (from project rules):**

- Framework: Vitest (`vitest.config.ts`)
- Test files: colocated `*.test.ts` next to source file
- Run command: `bun run test`
- Mock Electron/Node APIs when needed, but test the logic

#### Step 2.4: Quality Gate (ALL must pass)

Run all checks in order. **Every check must pass before proceeding to Step 2.6.**

```bash
# 1. Lint + auto-fix
bun run lint:fix

# 2. Format + auto-fix
bun run format

# 3. Type check — MUST pass
bunx tsc --noEmit

# 4. Tests — MUST pass
bun run test
```

**i18n check** (run if any `src/renderer/`, `locales/`, or `src/common/config/i18n` files were modified):

```bash
bun run i18n:types
node scripts/check-i18n.js
```

- `i18n:types` must run **before** `check-i18n.js`
- If `check-i18n.js` exits with errors → fix them before proceeding
- If `check-i18n.js` exits with warnings only → may proceed

**Final CI verification** — replicate the exact CI check locally:

```bash
prek run --from-ref origin/main --to-ref HEAD
```

- If `prek` reports issues → fix them (run `bun run lint:fix` and `bun run format` again), then re-run `prek`
- `prek` uses check-only commands (`lint`, `format:check`) — it will catch anything the auto-fix missed

**Gate rules:**

| Check      | Result | Action                                                              |
| ---------- | ------ | ------------------------------------------------------------------- |
| Type check | FAIL   | Fix type errors and re-run. Max 3 attempts, then **abandon issue**. |
| Tests      | FAIL   | Adjust fix/test and re-run. Max 3 attempts, then **abandon issue**. |
| i18n       | FAIL   | Fix missing keys and re-run.                                        |
| prek       | FAIL   | Fix reported issues and re-run.                                     |

**"Abandon issue"** means:

1. `git checkout main` (discard the branch)
2. `git branch -D fix/issue-<number>` (clean up)
3. In daemon mode: add issue to skip-list with reason `fix_failed` and `commented_at` timestamp
4. Proceed to Phase 3 (report the failure)

**No partial passes.** If tests or type check don't pass after 3 attempts, the fix is not
ready and must NOT be submitted as a PR.

#### Step 2.6: Commit & Create PR

**Delegate to existing skills** — do not manually construct commit messages or PR bodies.

**Pre-flight duplicate check** (safety net):

```bash
gh pr list --repo iOfficeAI/AionUi --state open --search "<error-keyword-or-file>" --json number,title
```

If an existing OPEN PR addresses the same root cause, **skip this issue** — do not create a
duplicate. Log it as "fix pending merge" in the triage report and proceed to Phase 3.

1. **Commit** directly (do NOT invoke `/commit` — it may prompt for confirmation):

   ```bash
   git add <changed-files>
   git commit -m "<type>(<scope>): <subject>"
   ```

   Follow project commit conventions: `<type>(<scope>): <subject>` in English.
   No AI signatures. Reference the issue number in the commit body if needed.

2. **Push branch and create PR** (do NOT invoke `/pr` — it may prompt for confirmation):

   ```bash
   git push -u origin fix/issue-<number>

   gh pr create --title "<pr-title>" --body "$(cat <<'EOF'
   ## Summary

   <1-3 bullet points>

   ## Related Issues

   Closes #<number>, closes #<number>

   ## Test Plan

   - [x] Unit tests pass
   - [x] Type check passes
   - [x] Lint and format pass
   EOF
   )"
   ```

   The PR body MUST include `Closes #<number>` for **every issue in the fix group**
   (e.g., `Closes #1786, closes #1771, closes #1778`). This auto-closes all sibling
   issues on merge and prevents them from being picked up by future daemon cycles.

   **PR is always created as a regular (non-draft) PR** — by this point all tests,
   type checks, and quality checks have already passed. The fix is complete and ready
   for review.

#### Step 2.7: Return to Main

```bash
git checkout main
```

### Phase 3: Summary Report

After the issue is fixed, output a summary report.
See [references/report-template.md](references/report-template.md) for the exact format.

#### Step 3.1: Update Skip List (Daemon Mode Only)

In daemon mode (`limit > 0`), after the summary report, update `~/.aionui-fix-issues/skip-list.json`
with all issues that were **skipped** in this session.

**TTL by classification:**

| Classification      | Re-trigger condition                              |
| ------------------- | ------------------------------------------------- |
| `environment_issue` | Always — re-run Classification Gate (Grep)        |
| `already_fixed`     | Issue reopened (detected by `--state open` fetch) |
| `fix_pending_merge` | Linked PR closed without merge                    |
| `unclear_unfixable` | Always — re-run Classification Gate (Grep)        |
| `fix_failed`        | New comment on issue since `commented_at`         |
| `needs_more_info`   | New comment on issue since `commented_at`         |

**Write rules:**

1. Read the existing file first (preserve entries from previous sessions that haven't expired)
2. For each skipped issue in this session, add or update its entry with the appropriate TTL
3. For issues that were **fixed** in this session (PR created), do NOT add to skip list —
   they should be detected as "already fixed" by the next session's normal triage
4. Write the merged result back to the file

## Configuration

Default parameters (can be overridden via skill args):

| Parameter | Default          | Description                                                         |
| --------- | ---------------- | ------------------------------------------------------------------- |
| repo      | iOfficeAI/AionUi | GitHub repository (owner/repo)                                      |
| limit     | 0                | Max issues to fix per invocation (0 = batch mode, >0 = daemon mode) |
| label     | bug              | Issue label to filter by                                            |

Override examples:

- Batch mode: `/fix-issues`
- Daemon mode: `/fix-issues limit=1`

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
If found, improve the existing PR instead of creating a duplicate.

### One Root Cause = One Branch = One PR

Group duplicate issues by root cause. Each unique root cause gets one branch and one PR.

### Skill Changes Stay Separate

Do NOT include changes to `.claude/skills/` in bug-fix branches. Skill updates should go through
their own branch and PR.
