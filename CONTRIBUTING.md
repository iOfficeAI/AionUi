# Contributing Guide

> **Chinese version**: [CONTRIBUTING.zh.md](CONTRIBUTING.zh.md)

## Prerequisites

See [docs/contributing/development.md](docs/contributing/development.md) for environment setup. You will need:

- Node.js 22+
- [bun](https://bun.sh)
- [Rust stable + Cargo](https://rustup.rs) for the local GEACore backend
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

## Rule 2: Commit and PR Title Format

Commit messages and PR titles must use Conventional Commit format in English:

```text
<type>(<scope>): <subject>
```

Use one of these types:

| Type       | Meaning                  | Changelog visibility |
| ---------- | ------------------------ | -------------------- |
| `feat`     | New user-facing behavior | Visible              |
| `fix`      | Bug fix                  | Visible              |
| `perf`     | Performance improvement  | Visible              |
| `refactor` | Code restructuring       | Visible              |
| `docs`     | Documentation            | Visible              |
| `style`    | Formatting or styles     | Hidden               |
| `chore`    | Maintenance work         | Hidden               |
| `test`     | Tests                    | Hidden               |
| `ci`       | CI configuration         | Hidden               |
| `build`    | Build system             | Hidden               |

Examples:

- `fix(preview): restore local html loading`
- `feat(workspace): add file preview shortcuts`
- `docs(contributing): document pr title format`

## Rule 3: Pass Local Checks Before Push

CI will reject your PR if these checks fail. Run them locally **before pushing** to save time.

### Recommended workflow

```bash
# Fast feedback while iterating
just quick-check

# Run relevant targeted tests for the files or behavior you changed
bunx vitest run <test-file>

# Run the complete local gate once on the final commit, then push.
just push <remote> <branch>
```

`just quick-check` runs formatting checks, strict lint, type checking, and i18n validation without the full unit-test suite. Use it during implementation together with the closest targeted tests. `just push` then runs that quick gate plus the full unit-test suite once on the final commit before calling `git push`. Omit `<remote> <branch>` when the current branch already has an upstream.

After opening a PR, use `just watch-pr <pr-number>` for one continuous check wait instead of repeatedly polling GitHub. It reads the repository from `origin`; pass a second remote name only when the PR targets another configured remote.

Personal forks cannot use GitHub's organization-only merge queue. For an explicitly authorized merge, `just integrate-pr <pr-number>` provides a fail-closed local substitute: it accepts only an open, ready PR targeting `main`, serializes integrations in the current clone, updates the branch, waits for at least one required check, and squash-merges only the exact checked head commit. The command changes remote state and merges the PR; do not run it for read-only monitoring. Its lock coordinates operators using the same clone, not other machines. If `main` or the PR head changes, rerun the command and let branch protection require fresh checks.

Use the individual commands below only to diagnose or fix a failed gate:

```bash
bun run format          # fix formatting
bun run lint:fix        # fix auto-fixable lint issues
bunx tsc --noEmit       # diagnose type errors
bun run i18n:types      # regenerate i18n types
node scripts/check-i18n.js
bunx vitest run         # reproduce unit-test failures
```

### Common failures and fixes

| Failure       | Fix                                                                  |
| ------------- | -------------------------------------------------------------------- |
| Format errors | `bun run format` (auto-fixes)                                        |
| Lint errors   | `bun run lint:fix` for auto-fixable issues; fix the rest manually    |
| Type errors   | Fix the TypeScript issue, then re-run `bunx tsc --noEmit`            |
| i18n errors   | Check for missing keys; run `bun run i18n:types` to regenerate types |
| Test failures | Fix the failing test or implementation; re-run `bunx vitest run`     |

## Rule 4: Preserve Required CI Contexts

When changing pull-request workflows:

- Read the active GitHub ruleset and account for every required status-check context by its exact job name.
- Keep one authoritative workflow for required checks. Do not rely on path-filtering a required workflow away; GitHub can leave its contexts in `Expected`.
- Make change classification fail safe: API errors, empty file lists, and unknown paths must run the full CI suite.
- Verify four routes before delivery: code-only, docs-only, mixed code/docs, and classification failure.

## Rule 5: Agent-managed PR Follow-through

When the user explicitly asks an agent to submit a PR:

1. Resolve and state the push remote and PR base. The default target is the user's personal fork; an official/upstream target requires explicit authorization in the current request.
2. Commit and push only the intended files, then create the PR as **Ready for review**, not Draft, with its final title, description, linked Issue, and validation evidence.
3. Monitor required checks, review findings, unresolved threads, conflicts, and mergeability. Apply focused fixes to the same branch and keep the same PR under review.
4. Merge automatically when required checks pass, no blocking review finding or thread remains, the branch is current and mergeable, and the final diff has been audited.
5. Re-fetch the merged PR and close its linked Issue as described in `docs/agents/issue-tracker.md`.

If permissions, an external dependency, or a required human decision prevents progress, report the exact blocker instead of weakening or bypassing the gate.

## Enforcement

When these rules are not followed, maintainers may:

1. **Close and request resubmission** (preferred) — you retain full credit upon proper resubmission.
2. **Cherry-pick valuable portions** — your authorship is preserved in git history, but the original PR shows as "Closed" rather than "Merged".

Code style, dependency choices, and documentation polish are handled by maintainers post-merge. Focus your PR on the functional change.

## Local builds and release artifacts

Use `bun run build` to compile the client without creating installers. Use `bun run dist:mac` for a DMG targeting the host architecture, or `build-mac:arm64` / `build-mac:x64` for an explicit architecture. Use `build-win:x64` or `build-win:arm64` for Windows EXE installers.

Formal releases build only macOS and Windows x64/arm64 installers (DMG / EXE), without ZIP, Linux, or Web CLI packages. Windows updater metadata is retained. macOS uses manual DMG installation and does not publish ZIP-based updater metadata. GEA automatic updates remain disabled by the existing service policy. Packaging retries preserve the original targets without adding ZIPs.
