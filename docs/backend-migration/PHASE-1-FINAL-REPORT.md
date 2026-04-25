# AionUi Backend Migration — Phase 1 Final Report

**Period:** 2026-04-22 → 2026-04-23
**Scope:** Skill-Library + Assistant module surface
**Status:** COMPLETE — transport/migration layer CLEAN, residual failures gated on documented P0 items

## Headline numbers

| Metric                                          | Value                                                                        |
| ----------------------------------------------- | ---------------------------------------------------------------------------- |
| Original Skill-Library pilot e2e (2026-04-22)   | 22 / 29                                                                      |
| Assistant verification e2e (2026-04-23 morning) | 32 / 37                                                                      |
| **Final Skill-Library e2e (2026-04-23 ~12:50)** | **23 / 29 + 1 skip**                                                         |
| **Final Assistant e2e (2026-04-23 12:32)**      | **36 / 37**                                                                  |
| **Combined transport-migration pass rate**      | **59 / 66 (89%)**                                                            |
| Class D (transport/migration) failures          | **0**                                                                        |
| Class F (backend contract gaps) failures        | **0** on migrated surface                                                    |
| Unit tests (Skill + Assistant scope)            | **406 / 406 green** (Rust 405 + TS Vitest 106/106 assistant hooks + related) |
| Backend Rust tests                              | 405 api-types + 325 extension-unit + 39 extension-e2e = 769 green            |

## What was delivered

### Backend (aionui-backend)

All 7 Skill-Library + Assistant endpoints implemented, plus contract fix:

- `GET /api/skills` (with `source` field fix mid-pilot)
- `GET /api/skills/builtin-auto`
- `POST /api/skills/builtin-rule`
- `POST /api/skills/builtin-skill`
- `POST /api/skills/info`
- `ExternalSkillSourceResponse.source` field added (fix for Class D in Phase B)
- Path-param contract for `DELETE /api/skills/assistant-{rule,skill}/{id}`

All 7 Assistant endpoints were already implemented as a side effect of the
Skill-Library pilot (shared `skill_routes.rs` / `skill_service.rs`):

- `GET /api/extensions/assistants`
- `POST /api/skills/assistant-rule/{read,write}` + `DELETE .../{id}`
- `POST /api/skills/assistant-skill/{read,write}` + `DELETE .../{id}`

Backend pilot work archived at `archive/skill-library-pilot-2026-04-23` in the
aionui-backend repo (SHA `274f8ab`).

### Frontend (AionUi renderer)

No renderer business code changed during verification (migration was already
complete on `feat/backend-migration` base). Test-layer changes only:

- 6 auto-unwrap mock fixes in `assistantHooks.dom.test.ts` (Vitest 50/50 green)
- 3 similar mock fixes in `SkillsHubSettings.dom.test.tsx`
- Deleted stale `fsBridge.skills.test.ts` (IPC era, no longer relevant)

### E2E (AionUi)

All test-layer fixes, no renderer source code touched:

| Fix             | Target                              | Effect                         |
| --------------- | ----------------------------------- | ------------------------------ |
| P1-A1           | 7 assistant `invokeBridge` → HTTP   | Unblocked P2-3/P1-20/P1-21     |
| P1-A1 follow-up | DELETE external-paths use JSON body | Fixed body/query mismatch      |
| P1-2            | TC-S-08 stable testid               | FAIL → PASS                    |
| P1-1            | TC-S-06 env-gate                    | FAIL → SKIP (correct behavior) |
| P1-A3           | TC-P1-23 id harvest from DOM        | FAIL → PASS                    |

New reusable helper: `tests/e2e/helpers/httpBridge.ts` (`httpGet`/`httpPost`/
`httpDelete`/`httpInvoke`) for future e2e migrations.

## What is NOT done, and why

Six remaining e2e failures (3 Skill + 1 Assistant + unique patterns) are
**gated on items outside Phase 1 scope**:

| Test    | Remaining cause                  | Gate                                                             |
| ------- | -------------------------------- | ---------------------------------------------------------------- |
| TC-S-17 | Backend duplicate-path rejection | **P0-1 product decision** (reject vs upsert vs split function)   |
| TC-S-15 | Custom paths state leakage       | **P0-2 test-infra sandbox** (backend `--data-dir` + fixtures.ts) |
| TC-S-25 | Bulk import at N=20              | **P0-2** + potentially scale investigation                       |
| TC-S-28 | Auto-injected skills board       | **P0-2** fixture seeding                                         |
| TC-S-27 | Extension Skills board           | Long-term extension registry integration (out of scope)          |
| P1-18   | Assistant auto-injected section  | **P0-2** fixture seeding (same root as TC-S-28)                  |

## Workflow lessons (captured for next-module authors)

Full lessons list in `docs/backend-migration/handoffs/coordinator-skill-library-2026-04-23.md`
§"Lessons learned" and `docs/backend-migration/handoffs/coordinator-assistant-verify-2026-04-23.md`
§"Lessons learned". Top 5:

1. **Check if endpoints are already implemented before writing a migration plan.**
   Assistant module's 7 endpoints were already live via Skill-pilot → verification
   track took ~20 min teammate time vs. pilot's 9 hours.
2. **Rebuild `out/renderer/` before every e2e run.** Stale bundle cost ~30 min
   in the Skill pilot when tests ran against pre-migration renderer code.
3. **Frontend-dev is non-interactive — never assign manual GUI spot-checks.**
   Delegate real-UI verification to e2e-tester's Playwright.
4. **When e2e-tester reports `invokeBridge timeout`, audit helper files for
   legacy IPC keys against HTTP-migrated renderer.** This is the dominant
   Class E pattern.
5. **`DELETE` with ID-in-body is the axum convention used throughout
   `/api/skills/*`**, not query-param. Next module's author should consult
   `docs/api-spec/13-extension.md` (pinned via P2-A1 ticket).

## Scope discipline (important for Phase 2)

This Phase 1 was **strictly scoped to Skill-Library + Assistant**. Two
within-session overreach attempts happened and were reverted:

- Cron-crud helper migration (`08d54355f`, reverted via `e61e07c38`)
- Extensions helper migration (`3bcdaa3f9`, reverted via `c2d4af05a`)

A forward-reference `invokeBridge` audit for the 21 other e2e files that will
need the same treatment is at `docs/backend-migration/post-pilot/2026-04-23-invokeBridge-audit.md`
with an explicit **OUT OF SCOPE** warning banner. That file is a map, not a
todo list.

## Deliverable branches

| Branch                                   | Repo           | Contains                                                                                                                        |
| ---------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `feat/backend-migration-coordinator`     | AionUi         | All docs (specs, plans, handoffs, reports, post-pilot lists, this file) + merged test fixes from fe/e2e branches + P1 e2e fixes |
| `archive/skill-library-pilot-2026-04-23` | aionui-backend | Backend pilot work (10 commits, SHA `274f8ab`): E1–E5 impl + source-field fix + handoff                                         |

All pilot working branches (`feat/backend-migration-fe-skill-library`,
`feat/backend-migration-e2e-skill-library`, `feat/backend-migration-assistant-verify`,
`feat/backend-migration-e2e-helper-fix`, `feat/extension-skill-library`)
were merged and cleaned up after successful delivery.

Per spec §4.2: **nothing has been merged back to `feat/backend-migration` in
either repo**. Integration is a user-approved step after Phase 1 close.

## Handoff to Phase 2

Three things are needed before Phase 2 (next module) can start:

1. **P0-1 product decision** on duplicate-path behavior
   (see `docs/backend-migration/post-pilot/2026-04-23-p0-1-design-question.md`).
2. **P0-2 test-infra sandbox** — backend data-dir threading + fixtures update
   (see `docs/backend-migration/post-pilot/2026-04-23-skill-library-followups.md` §P0-2).
3. **Module selection** — the original spec §3 listed 6 submodules; Phase 1
   closed 3 (Skill-Library, Assistant-CRUD, Assistant-Editor-Content) and
   the remaining 3 are verification-only per
   `docs/backend-migration/modules/remaining-submodules-verification-summary.md`.
   Phase 2 should pick an NEW business area (conversation / team / cron /
   extensions) and follow the verification-or-migration decision checklist
   from lesson #1.
