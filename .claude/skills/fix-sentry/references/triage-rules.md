# Triage Rules — Detailed Decision Flow

Classify each issue group into one of the categories below.

## Step A: Skip — System-level or framework-internal errors

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

## Step B: Direct fix — Stack trace points to our code

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

## Step C: Defensive fix — No stack trace, but error pattern is identifiable

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

## Step D: Skip filters (apply to all categories)

| Condition                                  | Action                        |
| ------------------------------------------ | ----------------------------- |
| Has merged PR / mentioned in release notes | Skip (already fixed)          |
| Resolved with `inRelease` in Sentry        | Skip (already fixed)          |
| Has OPEN PR addressing the root cause      | Skip (or improve existing PR) |

## Classification Summary

| Category          | Criteria                                           | Action                        |
| ----------------- | -------------------------------------------------- | ----------------------------- |
| **Direct fix**    | Stack trace → our code, clear cause                | Fix with targeted code change |
| **Defensive fix** | No stack trace, but error path matches our code    | Fix with defensive guards     |
| **Pending merge** | Existing OPEN PR addresses the root cause          | Skip or improve existing PR   |
| **Already fixed** | Merged PR / resolved in Sentry                     | Skip                          |
| **System-level**  | EPIPE, ENOSPC, EIO, uv, Chromium internal          | Skip                          |
| **Unfixable**     | No stack trace, no matching code path, third-party | Skip                          |
