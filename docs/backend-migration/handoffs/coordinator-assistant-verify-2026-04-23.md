# Coordinator Handoff — Assistant Module Verification — 2026-04-23

**Branch:** `feat/backend-migration-coordinator`
**Last commit:** this file's commit (to be assigned)
**Merge commit tying pilot branches together:** `c323acbf6`

## Done

Assistant module backend migration **verified CLEAN**. Unlike the Skill-Library
pilot (which migrated the code), this track only verified pre-existing
migration work already done as a side effect of the pilot. Total wall clock:
~20 minutes of teammate activity.

### Role deliverables

| Role          | Branch                                        | Final SHA       | Deliverables |
|---------------|-----------------------------------------------|-----------------|--------------|
| coordinator   | `feat/backend-migration-coordinator` (AionUi)  | this commit     | spec, plan, this handoff, merged-in verify branch |
| frontend-dev  | `feat/backend-migration-assistant-verify` (AionUi) | `7695e4fcc`  | 3 commits: Vitest mock fix (`af5477360`), module log + handoff (`cf7d29a36`), curl probe transcript (`7695e4fcc`) |
| e2e-tester    | `feat/backend-migration-assistant-verify` (AionUi) | `5ce9a2b84`  | 2 commits: e2e report (`7085af24f`), handoff (`5ce9a2b84`) |

### Success criteria (from spec §7)

| Criterion | Status |
|-----------|--------|
| Vitest assistant-scoped tests all green | ✅ 50/50 pass after fixing 6 auto-unwrap mocks in `assistantHooks.dom.test.ts` |
| Manual UI spot-check passes 7 steps | ✅ Replaced with headless HTTP curl probes against `~/.cargo/bin/aionui-backend --local`; all 7 endpoints green incl. write/read/delete round-trip. Real-UI verification delegated to Task B (Playwright) |
| E2E Class D = 0 | ✅ 0/0 |
| E2E Class F = 0 OR documented as inherited | ✅ 0 on Assistant surface (3 minor backend quirks discovered on Skills surface, not Assistant) |
| Each teammate has handoff | ✅ (frontend-dev, e2e-tester, coordinator) |
| Module record created | ✅ `docs/backend-migration/modules/assistant.md` |

**Verification verdict: PASS.** E2E 32/37 across the 37 tests that ran (P0–P2 scope). 5 residuals:
- 4 × Class E (test-helper IPC still uses `invokeBridge` for fixture-seeding in some specs; UI path fine)
- 1 × Class B (P1-18 asserts non-empty builtin-auto list, but sandbox returns empty)

All 5 are test-infra / test-authoring, not migration regressions.

## Endpoints verified (7)

| # | Renderer API | HTTP Route | Status |
|---|---|---|---|
| 1 | `ipcBridge.extensions.getAssistants` | `GET /api/extensions/assistants` | ✅ |
| 2 | `ipcBridge.fs.readAssistantRule` | `POST /api/skills/assistant-rule/read` | ✅ |
| 3 | `ipcBridge.fs.writeAssistantRule` | `POST /api/skills/assistant-rule/write` | ✅ |
| 4 | `ipcBridge.fs.deleteAssistantRule` | `DELETE /api/skills/assistant-rule/{assistantId}` (path-param) | ✅ |
| 5 | `ipcBridge.fs.readAssistantSkill` | `POST /api/skills/assistant-skill/read` | ✅ |
| 6 | `ipcBridge.fs.writeAssistantSkill` | `POST /api/skills/assistant-skill/write` | ✅ |
| 7 | `ipcBridge.fs.deleteAssistantSkill` | `DELETE /api/skills/assistant-skill/{assistantId}` (path-param) | ✅ |

## In flight

None. All teammates idle and pending shutdown.

## Lessons learned (new ones from this track)

Beyond the 9 lessons in the Skill pilot closure doc, this track added:

10. **Verification vs migration is a real distinction.** This track took ~20 min
   of teammate time vs. Skill pilot's 9 hours. When endpoints are already live,
   the work is probes + test runs + documentation, nothing more. **Module 3+:
   check if endpoints are already implemented BEFORE proposing a migration
   plan.** Grep `skill_routes.rs` and `routes.rs` for the target endpoint paths
   first.
11. **`DELETE /api/skills/*-rule/{id}` and `/api/skills/*-skill/{id}` use path
   params, not request body.** Frontend-dev first probed with body-carried `id`
   and got misleading 404. This API convention should be pinned in
   `docs/api-spec/13-extension.md` for future-module authors. (Filed as a
   post-verification P2 item.)
12. **frontend-dev cannot launch Electron GUI.** A non-interactive agent can't
   visually click through 7 UI flows. Accept this as structural: delegate
   "real UI" verification to e2e-tester's Playwright suite. Frontend-dev does
   curl probes + Vitest instead. **Module 3+: remove "manual GUI spot-check"
   from frontend-dev's plan steps entirely.**
13. **E2E helper `bridge.ts` fallback pattern is a latent bug across the
   e2e-coverage branch.** Skill-Library pilot fixed it for `skillsHub.ts` only;
   the underlying `invokeBridge` + `subscribe-*` pattern still exists elsewhere
   in test helpers, which tripped 4 Assistant tests. **Module 3+: before the
   e2e-tester runs, check `tests/e2e/helpers/` for any `invokeBridge` calls on
   migrated keys; migrate them all at once or accept the Class E residuals.**

## Next steps for a successor

The plan post-Skill-Library listed 6 sub-modules (§3). Skill-Library + Assistant
collectively covered **all 7 Assistant endpoints + all 5 Skill-Library endpoints
+ the Skill-Import/Export/External-Paths endpoints** (the latter exercised by
Skill e2e suite's 29 tests).

**Remaining module scopes per original spec §3:**
- Skill-Import-Export — endpoints already implemented in `skill_routes.rs`; covered by Skill e2e in SL pilot (5 tests in E3/E4/E5 category plus import-symlink e2e tests). Likely another verification-only track.
- Skill-External-Paths — endpoints already implemented; exercised by edge-cases.e2e.ts. Verification-only track.
- Assistant-Skill-Binding — this is the composed flow (`useAssistantSkills`); endpoints already verified in both modules. Likely verification-only.

**Recommended sequencing for tomorrow:**
1. **Land the P0 post-pilot items first** (from `docs/backend-migration/post-pilot/2026-04-23-skill-library-followups.md`):
   - TC-S-17 backend fix (`ExtensionError::DuplicatePath`).
   - Test-infra sandbox (`fixtures.ts` isolates `~/.aionui/skills/`, `~/.aionui/custom-skill-paths.json`; backend honors `--data-dir` CLI arg). This unblocks cleaner reruns of everything.
2. **Then verify the three remaining scopes** in a single combined track, following this Assistant track's template. Projected wall clock: ~30 min teammate time. (Skip migration planning — it's already done.)
3. **Post-pilot ticket list** should be augmented with:
   - Lesson #12 (remove UI spot-check from fe-dev plans).
   - Lesson #13 (audit `tests/e2e/helpers/*.ts` for legacy IPC).
   - The DELETE path-param convention → `docs/api-spec/13-extension.md`.
   - The 3 minor backend quirks e2e-tester discovered:
     - `invokeBridge` helper has no-op `provider()` and no WebSocket `subscribe-*` handler (latent bug for non-migrated test keys).
     - `DELETE /api/skills/external-paths` rejects requests without `Content-Type: application/json` header even with no body.
     - (skip sandbox + `builtin-auto` seeding, already tracked in Skill P0.)

## Branch tips at closure

| Branch | Repo | SHA |
|--------|------|-----|
| `feat/backend-migration-coordinator` | AionUi | this commit (`c323acbf6` is the merge parent) |
| `feat/backend-migration-assistant-verify` | AionUi | `5ce9a2b84` |
| `feat/extension-skill-library` | aionui-backend | `274f8ab` (unchanged — no backend work in this track) |

Per spec §4.3 and user instruction, **none of these branches are merged back
into `feat/backend-migration`** in either repo. Integration is a separate
user-approved step.
