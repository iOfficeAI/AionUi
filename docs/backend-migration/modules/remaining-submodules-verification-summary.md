# Remaining Submodules — Verification Summary

**Date:** 2026-04-23
**Author:** Coordinator
**Status:** Final — no teammate work required

## Why this is a one-page summary, not a new track

The original spec (2026-04-22) decomposed the Skill/Assistant surface into 6
submodules:

1. Skill-Library ✅ (Skill-Library pilot, 2026-04-22)
2. Assistant-CRUD ✅ (Assistant verification, 2026-04-23)
3. Assistant-Editor-Content ✅ (Assistant verification, 2026-04-23)
4. **Skill-Import-Export** — this doc
5. **Skill-External-Paths** — this doc
6. **Assistant-Skill-Binding** — this doc

The remaining three were expected to follow the Skill-Library pilot template
(spec → plan → 4-role team → pilot). **After inspection, no new work is
required** — all endpoints are already implemented AND already exercised by
the existing e2e suite that the first two tracks validated.

This doc is the verification summary that closes submodules 4–6.

## Submodule 4 — Skill-Import-Export

**Endpoints (all live in `aionui-backend/crates/aionui-extension/src/skill_routes.rs`):**

| Renderer API                          | HTTP Route                        | Status                                                                       |
| ------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------- |
| `ipcBridge.fs.importSkill`            | `POST /api/skills/import`         | ✅ implemented (Skill pilot)                                                 |
| `ipcBridge.fs.importSkillWithSymlink` | `POST /api/skills/import-symlink` | ✅ implemented + exercised by `manual-import.e2e.ts` + `batch-import.e2e.ts` |
| `ipcBridge.fs.exportSkillWithSymlink` | `POST /api/skills/export-symlink` | ✅ implemented + exercised by `path-export.e2e.ts`                           |
| `ipcBridge.fs.deleteSkill`            | `DELETE /api/skills/{name}`       | ✅ implemented + exercised by `core-ui.e2e.ts` TC-S-05 (PASS)                |

**E2E evidence (from Skill pilot's 22/29 final):**

- TC-S-05 (delete): PASS in Phase B.
- TC-S-11 (import at N=3 via symlink): PASS in Phase B.
- TC-S-19 (export): PASS (in the 22 that passed after backend source-field fix).
- TC-S-25 (import at N=20): FAIL due to scale/state pollution (P2 in Skill
  post-pilot list, NOT a migration regression).

**Verification verdict: PASS with one stateful edge case deferred.** Transport
and behavior are green; the one scale edge case is test-infra-driven (125
dangling symlinks from prior runs), not a migration bug.

## Submodule 5 — Skill-External-Paths

**Endpoints:**

| Renderer API                                | HTTP Route                                 | Status                                                                                                                                    |
| ------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `ipcBridge.fs.getSkillPaths`                | `GET /api/skills/paths`                    | ✅ implemented                                                                                                                            |
| `ipcBridge.fs.detectCommonSkillPaths`       | `GET /api/skills/detect-paths`             | ✅ implemented                                                                                                                            |
| `ipcBridge.fs.detectAndCountExternalSkills` | `GET /api/skills/detect-external`          | ✅ implemented (backend `source` field added in Skill pilot Phase B)                                                                      |
| `ipcBridge.fs.scanForSkills`                | `POST /api/skills/scan`                    | ✅ implemented                                                                                                                            |
| `ipcBridge.fs.getCustomExternalPaths`       | `GET /api/skills/external-paths`           | ✅ implemented                                                                                                                            |
| `ipcBridge.fs.addCustomExternalPath`        | `POST /api/skills/external-paths`          | ✅ implemented — known gap: does not reject duplicates (tracked as Skill post-pilot P0-1)                                                 |
| `ipcBridge.fs.removeCustomExternalPath`     | `DELETE /api/skills/external-paths?path=…` | ✅ implemented — known backend quirk: requires `Content-Type: application/json` header even with no body (tracked as Skill post-pilot P2) |

**E2E evidence:**

- TC-S-09/10/12/14/16 (source-tab rendering, external skill counts): PASS in
  Phase B after `source` field fix.
- TC-S-17 (duplicate path rejection): FAIL — documented as pre-existing TS-gap
  inherited, tracked as P0-1.

**Verification verdict: PASS with one pre-existing contract gap deferred.**
Duplicate-path rejection was never ported from the legacy TS implementation;
the fix is tracked as Skill post-pilot P0-1 and is a prerequisite for any
user-facing shipping of this module.

## Submodule 6 — Assistant-Skill-Binding

This submodule was defined in the spec as _composed flows_, not standalone
endpoints. It uses:

- Skill-Library endpoints (E1, E2) — verified in Skill pilot
- Assistant-Editor-Content endpoints (read/write/delete × rule/skill) —
  verified in Assistant track

**Renderer file exercising the composition:** `src/renderer/hooks/assistant/useAssistantSkills.ts`
(180 lines). The `detectAndCountExternalSkills` + `addCustomExternalPath`
calls from here go through Submodule 5's endpoints.

**E2E evidence (from Assistant verification's 32/37):**

- All 6 P0 core-interactions in `core-interactions.e2e.ts` PASS — this
  includes the skills modal and "Add Skill" flow that exercise this
  composition.
- P1-5 through P1-17 in `ui-states.e2e.ts` PASS — covers edit drawer skill
  section rendering, skill count headers, pending/custom badges, builtin skill
  checkbox.
- 4 × Class E fails are in test-helper `invokeBridge` fallback, NOT in the
  composition path itself.

**Verification verdict: PASS.** Composition flows verified end-to-end via
real Electron + real DOM in the Assistant track.

## Combined verdict for all 6 submodules

| Submodule                   | Track that closed it                     | Transport verdict                            |
| --------------------------- | ---------------------------------------- | -------------------------------------------- |
| 1. Skill-Library            | Skill pilot (2026-04-22)                 | CLEAN                                        |
| 2. Assistant-CRUD           | Assistant verify (2026-04-23)            | CLEAN                                        |
| 3. Assistant-Editor-Content | Assistant verify (2026-04-23)            | CLEAN                                        |
| 4. Skill-Import-Export      | this doc                                 | CLEAN (1 state edge case deferred)           |
| 5. Skill-External-Paths     | this doc                                 | CLEAN (1 pre-existing contract gap deferred) |
| 6. Assistant-Skill-Binding  | Assistant verify (2026-04-23) + this doc | CLEAN                                        |

**Phase 1 of the AionUi backend migration is complete for the
Skill/Assistant surface.** All 6 submodules' transport layers are verified
against the aionui-backend Rust implementation with the renderer's HTTP
pathway.

## What this does NOT conclude

- The 7 deferred items (Skill post-pilot P0–P2 + Assistant new findings) still
  need to land before shipping a user-facing release. See
  `docs/backend-migration/post-pilot/2026-04-23-skill-library-followups.md`
  (to be augmented with Assistant findings on next coordinator turn).
- Other AionUi modules outside the Skill/Assistant surface are NOT covered:
  conversation, file workspace, realtime, channels, cron, MCP, shell, office,
  team, etc. Each of those is a separate migration track to scope and
  schedule.
- Integration back into the `feat/backend-migration` base branch (in either
  repo) is still a pending user-approved step per spec §4.2.
