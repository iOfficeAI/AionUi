# Report Templates

## Triage Report (Phase 1 output)

Output before proceeding to Phase 2:

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

## Summary Report (Phase 3 output)

Output after all groups are processed:

```
=== Fix Sentry Results ===

Fixed — PR Created (N groups, covering X Sentry issues):
  1. [ELECTRON-5, ELECTRON-6X, ELECTRON-1A] Missing credentials in fetchModelList
     PR: <pr-url>
     Issue: #<number>
     Verification: PASS — unit tests pass

  2. ...

Fixed — Pending Manual Review (P groups):
  1. [ELECTRON-YY] Worker process error
     PR: <pr-url> (draft)
     Verification: skipped — worker process, not verifiable via chrome-devtools
     → Requires manual review

Already fixed (M issues):
  1. [ELECTRON-6, ELECTRON-6Y] Unsupported message type 'finished'
     → Evidence: PR #456 merged in v1.8.31

Skipped (K issues):
  1. [ELECTRON-J] write EPIPE
     → Reason: System-level error, no application code

Total: N fixed (PR created), P pending review, M already fixed, K skipped
```
