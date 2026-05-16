# Report Templates

## Triage Report (Phase 1 output)

Output before proceeding to Phase 2:

```
=== GitHub Issue Triage ===

Will fix — direct (N issues):
  1. #1782 [bug] Guard close handler against destroyed BrowserWindow
     → src/process/windowManager.ts — null check on BrowserWindow
     → Clue: error message in issue body points to close handler

Will fix — defensive (N issues):
  1. #1774 [bug] TypeError on null addInstance when toggling MCP server
     → Pattern: "addInstance" matches McpManager.ts
     → Defensive fix: check context holder before calling addInstance

Fix pending merge (P issues):
  1. #1780 [bug] OfficeDocViewer crashes with TypeError
     → PR #1795 (OPEN) — fix submitted but not yet merged

Skipped (M issues):
  1. #1707 [bug] Kaspersky blocking → Environment: antivirus software
  2. #1376 [bug] Windows installation error → Environment: OS/installer
  3. #1656 [bug] Empty body → Unclear: no description provided
  4. #1620 [bug] npm.cmd shim fails in Program Files → Environment: Windows path

```

## Summary Report (Phase 3 output)

Output after the issue is fixed:

```
=== Fix Issues Results ===

Fixed — PR Created:
  1. #1782 Guard close handler against destroyed BrowserWindow
     PR: <pr-url>
     Issue: Closes #1782
     Verification: PASS — unit tests pass

Skipped (K issues):
  1. #1707 Kaspersky blocking
     → Reason: Environment issue, antivirus software
  2. #1376 Windows installation error
     → Reason: Environment issue, OS/installer
  ...

Total: 1 fixed (PR created), K skipped
```
