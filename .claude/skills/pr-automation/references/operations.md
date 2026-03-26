# PR Automation Operations Guide

## Pipeline Architecture

Three-phase pipeline per PR: shell precheck → Claude review/fix → shell postmerge.

```
┌─ Shell: pr-automation-precheck.sh ──────────────────────────────┐
│ 1. Lock: add bot:reviewing label + lock comment                  │
│ 2. CI pre-check: verify required jobs passed                     │
│    → if CI never triggered: approve pending workflows → retry    │
│ 3. Conflict pre-check: attempt rebase                           │
│    → if rebase fails: pass has_conflicts signal to Claude        │
└──────────────────────────────────────────────────────────────────┘
                            ↓
┌─ Claude: /pr-automation <pr_number> ────────────────────────────┐
│ 4. Handle conflicts (if has_conflicts signal): intelligent merge │
│ 5. Review: execute pr-review skill → structured report           │
│ 6. Fix: if conditional + fixable → execute pr-fix skill          │
│    Exit: post review comment + label if rejected/unfixable       │
└──────────────────────────────────────────────────────────────────┘
                            ↓
┌─ Shell: pr-automation-postmerge.sh ─────────────────────────────┐
│ 7. Final rebase to latest base branch                            │
│ 8. Wait for full CI (gh pr checks --watch)                       │
│ 9. Merge: rebase (fallback squash) + delete branch               │
│10. Cleanup: add bot:done label, switch to main                   │
└──────────────────────────────────────────────────────────────────┘
```

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/pr-automation-daemon.sh` | Daemon entry point: scan → precheck → claude → postmerge, runs continuously |
| `.claude/skills/pr-automation/scripts/pr-automation-precheck.sh` | Lock, CI verify, rebase, checkout PR |
| `.claude/skills/pr-automation/scripts/pr-automation-postmerge.sh` | Final rebase, CI wait, merge, cleanup |

## Constants

```
LOCK_TIMEOUT_MIN    = 30
REQUIRED_CI_JOBS    = Code Quality, Unit Tests (ubuntu-latest), Unit Tests (macos-14),
                      Unit Tests (windows-2022), Coverage Test, i18n-check
GITHUB_TEAM         = iOfficeAI/trusted-contributors
SKIP_LABELS         = hold, bot:reviewing, bot:fixing, bot:needs-fix,
                      bot:needs-human-review, bot:done
```

## Daemon Mode (7x24 Unattended)

Runs continuously in a tmux session:

```bash
# Start in tmux for persistence
tmux new -s pr-daemon './scripts/pr-automation-daemon.sh'

# Custom interval (default 300s) and max PRs per cycle (default 3)
./scripts/pr-automation-daemon.sh --interval 180 --max-prs 5

# Logs: ~/.aionui-auto-merge/daemon.log
# Stop: kill $(cat ~/.aionui-auto-merge/daemon.lock)
```

Uses `caffeinate -i` on macOS to prevent sleep.

## PR Priority Order

1. PRs authored by `iOfficeAI/trusted-contributors` team members (trusted first)
2. Oldest PR first (FIFO) within same priority tier

## Blocking a PR from Automation

Add `hold` label, or include `WIP` in the PR title.
