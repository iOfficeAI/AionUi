# Triage Rules — GitHub Issues Decision Flow

Classify each issue/group into one of the categories below.

## Core Principle: Search Before Skipping (HARD GATE)

**Do NOT classify based on surface impressions alone.** Before marking an issue as `environment_issue`
or `unclear_unfixable`, you MUST search the codebase for relevant code paths.

**HARD RULE: If `Grep` finds matching code in `src/`, the issue CANNOT be classified as
`environment_issue` or `unclear_unfixable`.** It must be `direct_fix` or `defensive_fix`.
This rule has NO exceptions — even if the root cause is external, our code can add guards,
fallbacks, or adapter logic to handle it.

For each issue, log the search result in the triage report:

```
#1619: Grep("cowork", "ENOENT") → MATCH in fsBridge.ts:748 → MUST be direct_fix or defensive_fix
#1707: Grep("Kaspersky", "antivirus") → NO MATCH → may be environment_issue
```

## Step A: Skip — Environment or external issues

These issues originate **entirely** outside our codebase with **no code path in our repo** involved.
**Skip immediately** only when ALL of these are true:

1. The error happens outside our process (OS, package manager, antivirus, external service)
2. Searching our codebase for related keywords yields **no matching code**
3. There is no adapter/converter/bridge code on our side that handles this case

| Issue pattern                                       | Source               | Action |
| --------------------------------------------------- | -------------------- | ------ |
| Installation failure on specific OS                 | OS/package manager   | Skip   |
| Antivirus blocking (Kaspersky, Windows Defender)    | Third-party software | Skip   |
| Proxy/firewall configuration (no code path in repo) | User network         | Skip   |
| `EPERM` on system-protected paths (`Program Files`) | OS permission        | Skip   |
| Docker/container deployment requests                | Infrastructure       | Skip   |

### NOT environment issues (common misclassifications)

These look like external problems but are often fixable in our code:

| Pattern                                             | Why it's fixable                              | Correct classification      |
| --------------------------------------------------- | --------------------------------------------- | --------------------------- |
| Third-party API returns unexpected field/format     | Our converter/adapter code needs to handle it | Direct fix                  |
| "Model capacity exceeded" with small input          | Our encoding/token calculation is wrong       | Direct fix                  |
| CLI not detected in specific mode (headless, WebUI) | Our detection code doesn't cover that path    | Direct fix or Defensive fix |
| Resource/directory not found in packaged app        | Our path resolution logic is wrong            | Direct fix                  |
| Feature works in mode A but not mode B              | Our code has a conditional gap                | Direct fix                  |

**Rule: If an error message references a function, module, or file that exists in our `src/`,
it is NOT an environment issue — even if a third-party API or external tool is involved.**

## Step B: Direct fix — Error trace or code path is clear

When the issue body contains enough information to locate the exact code:

| Criteria                                                   | Result |
| ---------------------------------------------------------- | ------ |
| Stack trace or error message points to `src/` files        | Fix    |
| Error log shows our code's output (log messages, warnings) | Fix    |
| Specific component/function name mentioned + reproducible  | Fix    |
| API error but our converter/adapter code handles that API  | Fix    |
| Error cause is clear from description                      | Fix    |
| Fix is straightforward (null check, try-catch, validation) | Fix    |
| Requires architectural redesign or major refactor          | Skip   |
| Only affects third-party lib with no app-side workaround   | Skip   |

**Note on file paths:** Issue reporters may reference outdated paths. After refactoring,
files may have moved. Use `Glob` to locate the actual file in the current codebase.

## Step C: Defensive fix — No trace, but pattern is identifiable

Some issues are reported without stack traces but contain enough context to find the
responsible code path.

**Approach:** Extract distinctive patterns from the issue body (error messages, component names,
UI descriptions, keywords), then search the codebase for matching code paths. If a matching
code path is found, apply a defensive fix.

| Scenario                                                  | Result        |
| --------------------------------------------------------- | ------------- |
| Error message/keyword matches a code path in our codebase | Defensive fix |
| UI behavior description matches a specific component      | Defensive fix |
| Error references app-internal files (config, resources)   | Defensive fix |
| Error is purely user-specific with no matching code       | Skip          |

## Step D: Skip filters (apply to all categories)

| Condition                                            | Action                        |
| ---------------------------------------------------- | ----------------------------- |
| Recent commit in `main` addresses the reported error | Skip (already fixed)          |
| Has OPEN PR addressing the root cause                | Skip (or improve existing PR) |
| Issue has assignee (someone is working on it)        | Skip                          |
| Issue body is empty or provides no actionable info   | Skip (unclear)                |

**How to check for existing fixes:**

```bash
# Check recent commits for keywords from the issue
git log --oneline --since="2 weeks ago" --grep="<keyword-from-error>"

# Check open PRs
gh pr list --repo iOfficeAI/AionUi --state open --search "<error-keyword>" --json number,title

# Check closed PRs (recently merged)
gh pr list --repo iOfficeAI/AionUi --state merged --search "<error-keyword>" --limit 5 --json number,title,mergedAt
```

## Step E: Judging "needs_more_info" vs fixable

**Judge by actual information content, NOT by whether template fields are filled.**

An issue is fixable if it provides enough to locate the code path, regardless of form completeness:

| Actual content                                                                                 | Classification                          |
| ---------------------------------------------------------------------------------------------- | --------------------------------------- |
| Clear description of behavior + which feature/mode → can `Grep` for matching code              | Fixable (Direct or Defensive)           |
| Error message or log output → can search codebase                                              | Fixable (Direct fix)                    |
| Template fields say "n/a" but title + description are clear                                    | Fixable — ignore empty fields           |
| Screenshot showing error message, UI state, or component → download and `Read` to extract info | Analyze screenshot first, then classify |
| Screenshot analyzed but shows only generic UI with no error information                        | needs_more_info                         |
| Title only, body is empty or just template boilerplate                                         | needs_more_info                         |
| Vague "sometimes crashes" with no pattern or trigger                                           | needs_more_info                         |

**Screenshot analysis:** Issues with screenshots as the only detail must NOT be auto-classified
as `needs_more_info`. Download the image (`curl -sL -o /tmp/issue-N.png <url>`) and use `Read`
to view it. Screenshots often contain error messages, stack traces, and UI context that the
text description lacks.

**Key rule:** If you can construct a `Grep` query from the issue that finds relevant code,
it has enough info. "n/a" in optional fields does NOT make an issue unfixable.

## Step F: Judging "unclear_unfixable"

Use this classification **only** when:

1. The issue cannot be reproduced or understood from the description, AND
2. Searching the codebase yields no matching code path, AND
3. The fix would require designing a new system (not just adding logic to existing code)

**These are NOT "unclear_unfixable":**

| Wrongly classified as                                             | Actually is         | Why                                                                      |
| ----------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------ |
| "Needs architecture change" for adding debounce/throttle          | Direct fix          | Adding rate limiting to existing handlers is a targeted fix              |
| "Complex session/state issue" without investigating               | Potentially fixable | Must search codebase first — many "complex" bugs have simple root causes |
| "Feature request" when it's a regression                          | Direct fix          | If it worked before and broke, it's a bug                                |
| "Informally assigned" (mentioned in comments, not assignee field) | Still a candidate   | Only skip if `assignees` field is non-empty                              |

## Classification Summary

| Category              | Criteria                                                     | Action                         |
| --------------------- | ------------------------------------------------------------ | ------------------------------ |
| **Direct fix**        | Error/trace → our code, or API error with our converter      | Fix with targeted code change  |
| **Defensive fix**     | No trace, but error pattern matches our code                 | Fix with defensive guards      |
| **Pending merge**     | Existing OPEN PR addresses the root cause                    | Skip or improve existing PR    |
| **Already fixed**     | Recent commit / merged PR addresses it                       | Skip                           |
| **Environment**       | Entirely outside our code — no matching code path in repo    | Skip                           |
| **Needs more info**   | Cannot construct any search query from the description       | Skip + comment asking for info |
| **Unclear/unfixable** | Searched codebase, no match, AND fix needs new system design | Skip                           |
