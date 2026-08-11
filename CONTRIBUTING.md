# Contributing Guide

> **Chinese version**: [CONTRIBUTING.zh.md](CONTRIBUTING.zh.md)

## Prerequisites

See [docs/development.md](docs/development.md) for environment setup. You will need:

- Node.js 22+
- [bun](https://bun.sh)
- [prek](https://github.com/j178/prek) (`npm install -g @j178/prek`)

## Rule 1: Atomic PRs

Each pull request must contain **exactly one feature or one bug fix** that cannot be further decomposed.

**How to check:** Ask yourself (or an AI): _"Can this diff be split into multiple independently mergeable PRs?"_ If yes, split it before submitting.

### Examples

**Acceptable (single PR):**

- A bug fix with one root cause, even if it touches multiple files (e.g., fixing toast z-index across modal and chat layers)
- A single coherent feature (e.g., team creation modal with form validation)

**Must be split into separate PRs:**

- Team chat scroll fix + Sentry user tracking + office preview performance optimization = 3 PRs
- Unrelated bug fixes bundled together (e.g., titlebar navigation fix + i18n missing key + speech input UI fix)
- Independent technical layers (e.g., IPC bridge refactor + renderer component + worker process change for unrelated features)

## Rule 2: Pass Local Checks Before Push

CI will reject your PR if these checks fail. Run them locally **before pushing** to save time.

### Step-by-step

```bash
# 1. Format (always run — covers .ts, .tsx, .css, .json, .md)
bun run format

# 2. Lint (skip if no .ts/.tsx files changed)
bun run lint

# 3. Type check (skip if no .ts/.tsx files changed)
bunx tsc --noEmit

# 4. i18n validation (only if you changed files in src/renderer/, locales/, or src/common/config/i18n/)
bun run i18n:types
node scripts/check-i18n.js

# 5. Tests
bunx vitest run
```

### One-command alternative

This replicates the exact CI quality check, then runs tests:

```bash
prek run --from-ref origin/main --to-ref HEAD
bunx vitest run
```

> `prek` runs format-check + lint + tsc in read-only mode. If it reports issues, run the auto-fix commands above first, then re-run prek.

### Common failures and fixes

| Failure       | Fix                                                                  |
| ------------- | -------------------------------------------------------------------- |
| Format errors | `bun run format` (auto-fixes)                                        |
| Lint errors   | `bun run lint:fix` for auto-fixable issues; fix the rest manually    |
| Type errors   | Fix the TypeScript issue, then re-run `bunx tsc --noEmit`            |
| i18n errors   | Check for missing keys; run `bun run i18n:types` to regenerate types |
| Test failures | Fix the failing test or implementation; re-run `bunx vitest run`     |

### Claude Code shortcut

If you use [Claude Code](https://docs.anthropic.com/en/docs/claude-code), run `/oss-pr` to automate the entire check + commit + PR flow.

## After Your PR

This repository runs a PR automation bot that reviews, fixes minor issues, and prepares PRs for merge. You may see these labels on your PR:

| Label                    | Meaning                                | Action needed                           |
| ------------------------ | -------------------------------------- | --------------------------------------- |
| `bot:reviewing`          | Bot is reviewing your PR               | Wait                                    |
| `bot:ci-waiting`         | CI failed; bot is waiting for your fix | Push a new commit to fix CI             |
| `bot:needs-rebase`       | Merge conflict; bot cannot auto-rebase | Rebase your branch onto `main` and push |
| `bot:needs-human-review` | Blocking issue found                   | A maintainer will review and comment    |
| `bot:ready-to-merge`     | All checks passed                      | A maintainer will merge when ready      |

See [docs/conventions/pr-automation.md](docs/conventions/pr-automation.md) for the full automation workflow.

## Enforcement

When these rules are not followed, maintainers may:

1. **Close and request resubmission** (preferred) — you retain full credit upon proper resubmission.
2. **Cherry-pick valuable portions** — your authorship is preserved in git history, but the original PR shows as "Closed" rather than "Merged".

Code style, dependency choices, and documentation polish are handled by maintainers post-merge. Focus your PR on the functional change.
