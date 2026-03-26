# PR Auto-Merge Operations Guide

## Daemon (7x24 Unattended Mode)

The daemon script scans eligible PRs and launches a fresh `claude` process per PR — zero context accumulation.

```bash
# Start in tmux/screen for persistence
tmux new -s pr-daemon './scripts/pr-auto-merge-daemon.sh'

# Custom interval (default 300s) and max PRs per cycle (default 3)
./scripts/pr-auto-merge-daemon.sh --interval 180 --max-prs 5

# Logs: ~/.aionui-auto-merge/daemon.log
# Stop: kill $(cat ~/.aionui-auto-merge/daemon.lock)
```

Uses `caffeinate -i` on macOS to prevent sleep.

## Pipeline Architecture

Three-phase pipeline per PR: shell precheck → claude review/fix → shell postmerge.

```
┌─ Shell: pr-auto-merge-precheck.sh ──────────────────────────┐
│ 0. Scan: daemon finds eligible PRs via gh CLI                │
│ 1. Lock: add bot:reviewing label + lock comment              │
│ 2. CI pre-check: verify required jobs passed                 │
│ 3. Conflict pre-check: rebase to main, resolve or abort     │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌─ Claude: /pr-auto-merge <pr_number> ────────────────────────┐
│ 4. Review: execute pr-review skill → structured report       │
│ 5. Fix: if conditional + fixable → execute pr-fix skill      │
│ 6. Re-review: re-execute review → check fix (max 3 rounds)  │
│    Exit: post review comment + label if rejected             │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌─ Shell: pr-auto-merge-postmerge.sh ─────────────────────────┐
│ 8. Final rebase to latest main                               │
│ 9. Wait for full CI (including build)                        │
│10. Merge: rebase (fallback squash) + delete branch           │
│11. Abort: post report + result label + release lock          │
│12. Cleanup: labels, branches, switch to main                 │
└──────────────────────────────────────────────────────────────┘
```

## Shell Scripts

| Script | Purpose |
|--------|---------|
| `scripts/pr-auto-merge-daemon.sh` | Daemon loop: scan → precheck → claude → postmerge |
| `.claude/skills/pr-auto-merge/scripts/pr-auto-merge-precheck.sh` | Lock, CI verify, rebase, checkout PR branch |
| `.claude/skills/pr-auto-merge/scripts/pr-auto-merge-postmerge.sh` | Final rebase, CI wait, merge, cleanup |

## Constants (Shell)

```
LOCK_TIMEOUT_MIN    = 30
REQUIRED_CI_JOBS    = Code Quality, Unit Tests (ubuntu-latest), Unit Tests (macos-14),
                      Unit Tests (windows-2022), Coverage Test
GITHUB_TEAM         = iOfficeAI/trusted-contributors
```
