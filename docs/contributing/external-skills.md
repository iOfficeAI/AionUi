# External Codex Skills

This document defines the trial rules for external Codex skills used by the AionUi development team. External skills must not replace the repository's primary development, testing, review, or security workflows.

## Trial Candidate

| Field                | Value                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------- |
| Candidate            | `playwright-interactive`                                                               |
| Source               | `https://github.com/openai/skills/tree/main/skills/.curated/playwright-interactive`    |
| Repository main HEAD | `b0401f07213a66414d84a65cb50c1d226f99485a`                                             |
| `SKILL.md` SHA       | `7d85f8284014c8c2690918a596a4b5bef7cb86e1`                                             |
| Status               | Approved for documentation only. Installation and vendoring require separate approval. |

## Purpose

The purpose of this trial is to evaluate whether an external Codex skill can improve local UI debugging and exploratory QA without weakening AionUi's existing testing and review standards.

AionUi's `testing` skill remains the primary testing workflow. `playwright-interactive` may only be used as a supplemental local debugging aid.

## Allowed Uses

`playwright-interactive` may be considered for these limited uses:

- IA-Orchestrator personal local debugging.
- Electron and UI exploratory QA.
- Dark/light contrast checks.
- Screenshot comparison during manual verification.
- Viewport and initial-window fit checks.

## Prohibited Uses

The skill must not be used for these purposes:

- CI, shared automation, production, or any AionUi codebase editing task that requires `danger-full-access`, including one-off use.
- Persistent `js_repl` sessions across unrelated tasks or agent handoffs.
- Replacing or overriding `AGENTS.md`, the AionUi `testing` skill, Playwright E2E tests, or PR verification workflows.
- Dynamic retrieval through `$skill-installer` or raw install from upstream during normal project work.

## Adoption Conditions

Before any trial installation or vendoring, all of these conditions must be met:

- Vendor the skill into a reviewed repository location and pin it to the approved upstream SHA.
- Preserve upstream `LICENSE.txt` and `NOTICE.txt` files with the vendored copy.
- Treat `--enable js_repl` as session-scoped. Do not enable it as a team-wide default.
- Do not persist `js_repl = true` in `~/.codex/config.toml`; use `--enable js_repl` per session only.
- `--sandbox danger-full-access` may only be used on a developer's local machine for the duration of the debug session, and must be revoked or the session terminated when debugging is complete.
- Review any code executed through `page.evaluate(...)` or `electronApp.evaluate(...)` when it affects app state, security-sensitive data, or debugging conclusions.
- Quarterly re-checks must be filed by C-Reviewer or an equivalent reviewer role. Any SHA bump requires re-running the security review and updating the SHAs in this document via a reviewed PR.

## Relationship To Existing Workflows

| Area                         | Primary AionUi workflow                                 | `playwright-interactive` role                                    |
| ---------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------- |
| Unit and integration testing | `testing` skill with Vitest                             | No replacement                                                   |
| E2E regression               | Existing Playwright E2E suite                           | No replacement; may help reproduce failures before writing tests |
| UI exploration               | IA-Orchestrator manual verification                     | Supplemental structured session workflow                         |
| Visual checks                | Screenshot/manual review as requested                   | Supplemental screenshot and viewport evidence                    |
| PR readiness                 | `oss-pr`, `pr-review`, `pr-fix`, `pr-verify`, `pr-ship` | No replacement                                                   |

## Activation Copy

Codex currently recognizes skills from the global Codex skills directory, so activation requires a copy under `~/.codex/skills/playwright-interactive/`. The reviewed source of truth is the Tier 1 vendor copy committed at `.codex/skills/external/playwright-interactive@b0401f0/`. The global `~/.codex` copy is Tier 2 activation-only state and must be treated as disposable and reproducible from Tier 1. Tier 2 must be updated only by one-way copy/overwrite from Tier 1; manual edits to Tier 2 are prohibited.

## Trial Procedure

If the team approves a trial in a later task:

1. Vendor the skill from the pinned upstream SHA.
2. Keep `LICENSE.txt` and `NOTICE.txt` with the vendored files.
3. Add AionUi-specific notes for `bun start`, Electron launch, cleanup, and screenshot artifact storage.
4. Limit trial usage to IA-Orchestrator local UI debugging.
5. Record findings before deciding whether to keep, modify, or remove the vendored skill.

Raw installation is intentionally not part of this procedure. Any vendor trial requires a separate explicit approval.
