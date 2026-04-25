# Coordinator Handoff — Assistant User Data Migration — 2026-04-23

**Coordinator branch (AionUi):** `feat/backend-migration-coordinator` — final SHA written by this commit
**Feature branch (AionUi):** `feat/backend-migration-assistant-user-data` @ `f3207451e`
**Feature branch (aionui-backend):** `feat/assistant-user-data` @ `0a970ee`
**Base branches:** AionUi feat branched from `feat/backend-migration-coordinator`; aionui-backend feat branched from `archive/skill-library-pilot-2026-04-23`
**PRs:** Per user instruction — **none raised**. Both feature branches stay pushed for user inspection.

## What shipped

Migrated user-authored assistant definitions from Electron's
`ConfigStorage.get('assistants')` into the Rust backend as the single source
of truth. New `aionui-assistant` crate; `GET /api/assistants` merges built-in

- user + extension server-side; one-shot Electron migration hook; insert-only
  import endpoint for idempotent retries.

### Role deliverables (all branches pushed)

| Role            | Deliverable                                                                                        | Last SHA (branch)                                                 |
| --------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| coordinator     | spec, plan, playbook, handoffs, branch merges, module log                                          | this commit on `feat/backend-migration-coordinator`               |
| backend-dev     | T1a scaffolding, T1b service + dispatch, H1 canonicalize, H2 include_dir embed                     | `0a970ee` (aionui-backend `feat/assistant-user-data`)             |
| backend-tester  | T2 HTTP integration suite (44 tests)                                                               | `77e41b4` (same branch)                                           |
| frontend-dev    | T3a refactor, T3b migration hook, H3 disabled-builtin state, H4 main-process port, H5 naming split | `f3207451e` (AionUi `feat/backend-migration-assistant-user-data`) |
| frontend-tester | T4 unit coverage (70 tests) + bridge port decoupling                                               | `bf152c581` (same branch)                                         |
| e2e-tester      | T5 Playwright suite (10 scenarios) + report + handoff                                              | `d801a6deb` (same branch)                                         |

### Final endpoints (summary)

| Method | Path                                              | Source                                                 |
| ------ | ------------------------------------------------- | ------------------------------------------------------ |
| GET    | `/api/assistants`                                 | Merged: builtin (embedded) + user (SQLite) + extension |
| POST   | `/api/assistants`                                 | User — create                                          |
| PUT    | `/api/assistants/{id}`                            | User — update (403 on builtin/extension)               |
| DELETE | `/api/assistants/{id}`                            | User — delete + cascade fs                             |
| PATCH  | `/api/assistants/{id}/state`                      | enabled/sort_order/last_used_at (400 on extension)     |
| POST   | `/api/assistants/import`                          | Insert-only bulk import (migration path)               |
| GET    | `/api/assistants/{id}/avatar`                     | Serves bytes for builtin + user                        |
| POST   | `/api/skills/assistant-rule/{read,write,delete}`  | Source-dispatched                                      |
| POST   | `/api/skills/assistant-skill/{read,write,delete}` | Source-dispatched                                      |

### Migration invariant

`migration.electronConfigImported` flag in `aionui-config.txt` — flips to
`true` only when the whole run (user-row imports + disabled-builtin overrides)
succeeds. Insert-only import endpoint means retries skip already-imported
rows rather than clobber user edits. Hook honors
`AIONUI_SKIP_ELECTRON_MIGRATION=1` for E2E.

### Single-source-of-truth rule (enforced post-migration)

Production frontend code under `src/` now has **zero** reads or writes of
`ConfigStorage.get('assistants')` / `ConfigStorage.set('assistants', ...)`
(verified via grep in T3a gate). Future PRs must preserve this. Any
reintroduction should be rejected in review.

## Verdict

**SUCCESS with followups.**

All nine planned tasks (T0–T6) plus five in-flight hotfixes (H1–H5) landed
clean. T2 44/44 green, T4 70/70 green, T5 10/10 green (two consecutive
runs). Full frontend Vitest regression suite matches pre-pilot baseline
(103 pre-existing failures unchanged — all T3a/T3b fallout owned by T4).

User manually confirmed post-migration backend state:

- 20 built-in assistants present
- 11 user-authored assistants migrated from legacy file
- Disabled-builtin state preserved via overrides

## In-flight hotfixes — context

Five hotfixes were filed mid-pilot as user-driven bug reports surfaced
issues the plan's test matrix missed:

| Hotfix | Problem                                                                                                                                                             | Fix                                                                                                          | Commit      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------- |
| H1     | `GET /api/assistants` returned `[]` in dev because `current_exe()` doesn't follow macOS symlinks                                                                    | canonicalize in `BuiltinAssistantRegistry`                                                                   | `3d4502f`   |
| H2     | `current_exe()` + sibling-assets assumption was fragile for packaging (`prepareAionuiBackend.js` only ships the binary, not assets)                                 | embed assets into binary via `include_dir` crate                                                             | `0a970ee`   |
| H3     | User-disabled built-ins lost their `enabled=false` state during migration                                                                                           | migrate overrides as a second phase via `PATCH /api/assistants/{id}/state`                                   | `63ab47530` |
| H4     | Main-process calls to `ipcBridge.assistants.*` silently failed because `getBaseUrl()` only reads `window.__backendPort` (renderer), falling back to hardcoded 13400 | `getBackendPort()` resolves `globalThis.__backendPort` (main) → `window.__backendPort` (renderer) → fallback | `ffff7b48b` |
| H5     | Guid `AssistantSelectionArea` prop named `customAgents` collided with unrelated `acp.customAgents`; consumers filtered on dead `isPreset` flag                      | split `useCustomAgentsLoader` return into `assistants: Assistant[]` + `customAgents: AcpBackendConfig[]`     | `f3207451e` |

Each hotfix is a lesson — see playbook notes for generalized rules.

## Lessons captured

Appended to `docs/backend-migration/notes/team-operations-playbook.md`:

1. **Zombie teammate detection + autonomous replacement** — 10-min silence
   threshold, config.json edit + inbox rm + re-spawn, never ask user to
   approve.
2. **Coordinator message backlog** — scan TaskList + git + inbox on every
   user prompt; don't assume "no new inbox message = no change."
3. **Autonomous diagnostic decisions** — don't ask user "was that rebase
   you?"; resolve from git state; bake self-healing into spawn prompts.
4. **Migration-class work needs real-user-data dry-run** — plan's fixture-
   based tests missed bugs A (port resolution) and B (disabled-builtin
   state) that only showed up against the user's production
   `aionui-config.txt`. Future migration plans must include a real-data
   dry-run task before E2E.
5. **Teammate progress reporting** — silence during long investigation is
   not acceptable; every spawn prompt now includes "progress update every
   10 minutes even mid-investigation."

## Followups (not blocking this pilot)

1. **Frontend regression debt** — 103 pre-existing Vitest failures are from
   T3a/T3b's renderer hook rewrites. T4 did not fix them; they pre-exist on
   the pre-pilot base. Worth a dedicated sweep sprint.
2. **Test fixture — real legacy-file dry-run** — E2E S8-S10 use clean
   fixture files. Add a scenario that seeds one sanitized real legacy file.
3. **Cross-platform asset validation** — macOS only verified. Linux/Windows
   probe deferred; requires CI runner access.
4. **ChatLayout-side `acp.customAgents` cleanup** — H5 only renamed the
   Guid-side prop. ChatLayout still reads `acp.customAgents` for ACP
   engine configs — legitimate today but easy to confuse. Consider a
   follow-up pass to rename to `acpCustomAgents` or similar.
5. **AionUi packaging pipeline** — `scripts/prepareAionuiBackend.js`
   no longer needs to carry assets (H2 embedded them), but the script
   itself wasn't touched; verify packaged builds pull binary from the
   right release.
6. **Next module candidate** — `ConfigStorage.get('acp.customAgents')` is
   the natural next migration target per original brainstorm. Builds on
   the single-source-of-truth rule established here.

## Branch tips at closure

| Branch                                       | Repo           | SHA                                                            |
| -------------------------------------------- | -------------- | -------------------------------------------------------------- |
| `feat/backend-migration-coordinator`         | AionUi         | this commit (merged feat back + adds plan/playbook/module log) |
| `feat/backend-migration-assistant-user-data` | AionUi         | `f3207451e`                                                    |
| `feat/assistant-user-data`                   | aionui-backend | `0a970ee`                                                      |

Per user instruction, **no PRs are raised**. Merging feature branches to
main is out of scope of this pilot.
