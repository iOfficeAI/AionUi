# Assistant Module — Backend Migration Verification

**Date:** 2026-04-23
**Author:** Coordinator (Claude)
**Status:** Draft — pending user review
**Depends on:** Skill-Library pilot (complete, CLEAN transport verdict)

## 1. Background & Surprise Finding

The original pilot spec (2026-04-22) split the Assistant surface into three
capability-area submodules (Assistant-CRUD / Assistant-Editor-Content /
Assistant-Skill-Binding) with 7 distinct endpoints, expecting each to be a
separate migration effort similar in scope to Skill-Library.

Post-pilot inspection reveals that **the Assistant endpoints were already
implemented during the Skill-Library pilot** because they share file and code
paths with skill routes (`skill_routes.rs`, `skill_service.rs`). Specifically:

| Endpoint                                  | Backend status                         | Renderer status                                  |
| ----------------------------------------- | -------------------------------------- | ------------------------------------------------ |
| `GET /api/extensions/assistants`          | ✅ `aionui-extension/src/routes.rs:41` | ✅ `ipcBridge.extensions.getAssistants` declared |
| `POST /api/skills/assistant-rule/read`    | ✅ `skill_routes.rs:68`                | ✅ `ipcBridge.fs.readAssistantRule`              |
| `POST /api/skills/assistant-rule/write`   | ✅ `skill_routes.rs:70`                | ✅ `ipcBridge.fs.writeAssistantRule`             |
| `DELETE /api/skills/assistant-rule/{id}`  | ✅ `skill_routes.rs:74`                | ✅ `ipcBridge.fs.deleteAssistantRule`            |
| `POST /api/skills/assistant-skill/read`   | ✅ `skill_routes.rs:79`                | ✅ `ipcBridge.fs.readAssistantSkill`             |
| `POST /api/skills/assistant-skill/write`  | ✅ `skill_routes.rs:83`                | ✅ `ipcBridge.fs.writeAssistantSkill`            |
| `DELETE /api/skills/assistant-skill/{id}` | ✅ `skill_routes.rs:87`                | ✅ `ipcBridge.fs.deleteAssistantSkill`           |

All 7 endpoints are also exercised by the renderer hooks (`useAssistantList`,
`useAssistantEditor`, `useAssistantSkills`) already in place.

Additionally, `tests/e2e/features/assistants/` ships **3 e2e files with 50+
tests** (core-interactions 6 + ui-states 26 + edge-cases ~18), and unlike
skill-library helpers, `tests/e2e/helpers/assistantSettings.ts` **does not use
any legacy `invokeBridge('subscribe-*')` calls** — it drives the UI through
Playwright DOM directly.

## 2. What this spec is (and isn't)

**This is NOT a migration pilot.** The code migration is already done as a
side effect of the Skill-Library pilot. This is a **verification track**:
confirm that the existing Assistant implementation preserves the pre-migration
behavior end-to-end.

**In scope:**

- Run Vitest for Assistant-scoped files and fix any auto-unwrap mock issues
  (same class of fix frontend-dev did for SkillsHub).
- Run the 50+ Assistant e2e tests, classify failures by owner-category
  (same rubric as Skill pilot: D=transport, A=stateful, F=contract gap,
  B/C/E=test-authoring).
- Manually exercise `AssistantSettings` page in `bun start` to catch any
  visual or interaction regression not covered by e2e.
- Document findings + route fixes for anything discovered.

**Out of scope (deferred to separate tickets):**

- Restarting the pipeline as if migration weren't done.
- Refactoring existing hook code that works.
- Adding new e2e tests.
- The two P0 post-pilot tickets from Skill-Library
  (`docs/backend-migration/post-pilot/2026-04-23-skill-library-followups.md`)
  remain separate — this verification proceeds IN SPITE OF them, not after
  them, because Assistant helpers don't depend on the sandbox fix.

## 3. Prerequisites (from Skill-Library lessons)

Before any e2e run:

1. Backend binary MUST be current: `cd aionui-backend && cargo install --path crates/aionui-app`.
2. Renderer bundle MUST be rebuilt: `bunx electron-vite build` in AionUi.
3. `~/.cargo/bin` MUST be on PATH for the Playwright Electron launcher.
4. Database + skills dir state MUST be backed up:
   `cp -v ~/.aionui-dev/aionui.db ~/.aionui-dev/aionui.db.bak-assistant-verify-$(date +%Y%m%d-%H%M%S)`.

## 4. Team Topology

Smaller than the pilot — only 2 working teammates + coordinator:

| Role         | Responsibility                                                                                                    |
| ------------ | ----------------------------------------------------------------------------------------------------------------- |
| coordinator  | Schedule, switch branches, route incidents, write closure doc. Does not write code.                               |
| frontend-dev | Run Vitest for assistant scope, fix mock unwrap issues if any. Manual UI spot-check of AssistantSettings. Commit. |
| e2e-tester   | Run all 3 assistant e2e files, classify failures, write report + handoff.                                         |

Backend-dev is NOT spawned up front. Only if e2e uncovers a Class D
(transport/migration) or Class F (backend contract gap) failure, coordinator
spawns backend-dev as an on-demand teammate.

## 5. Branching

Flat names, same convention as pilot.

| Branch                                     | Repo           | Base                            | Owner                               |
| ------------------------------------------ | -------------- | ------------------------------- | ----------------------------------- |
| `feat/backend-migration-coordinator`       | AionUi         | (exists, reused)                | coordinator                         |
| `feat/backend-migration-assistant-verify`  | AionUi         | `origin/feat/backend-migration` | fe + e2e both work here, serialized |
| (on-demand) `feat/extension-assistant-fix` | aionui-backend | `origin/feat/backend-migration` | backend-dev (only if needed)        |

We don't split fe and e2e into separate branches this time because:

- No large code changes expected (code already migrated in pilot).
- Assistant e2e helpers need no migration.
- Merging `kaizhou-lab/test/e2e-coverage` is still needed for the e2e files —
  but it's merged into the single verification branch, not duplicated.

## 6. Workflow

Serialized on the single AionUi working tree:

1. **Pre-flight (coordinator):**
   - Create `feat/backend-migration-assistant-verify` from
     `origin/feat/backend-migration`.
   - Merge `origin/kaizhou-lab/test/e2e-coverage` (brings in the 3 assistant
     e2e files + helpers).
   - Verify the 7 `ipcBridge` assistant endpoints match backend route paths
     (documentation check, 1 min).
   - Push branch.
2. **frontend-dev activation (coordinator switches to branch, spawns):**
   - Run `bun run lint:fix && bun run format && bunx tsc --noEmit`.
   - Run `bun run test -- --run tests/unit/assistant*.test.ts`.
   - Fix any failures (anticipated: auto-unwrap mock issues as in SkillsHub).
   - Launch `bun start`, open Settings → Assistants, visually verify
     (list loads, edit drawer opens, rule/skill read/write roundtrips, delete
     works).
   - Write module log + handoff. Commit + push.
3. **e2e-tester activation:**
   - Coordinator verifies backend binary + renderer bundle current.
   - e2e-tester runs `bun run test:e2e tests/e2e/features/assistants/`.
   - Classify failures by owner-category.
   - Write report + handoff.
4. **If Class D or F failures → coordinator spawns backend-dev for targeted fix, then e2e-tester re-runs.**
5. **Coordinator closure.** Same rule as pilot: no merge back into base.

## 7. Success Criteria

The verification passes when:

1. Vitest assistant-scoped tests all green.
2. Manual UI check: AssistantSettings page loads, list populates, edit drawer
   opens and rule/skill editing works, delete works.
3. E2E Class D (transport/migration) failures = 0.
4. Class F (backend contract gap) = 0 OR documented as pre-existing TS gap
   inherited.
5. Class A/B/C/E failures documented in a post-verification ticket, not
   treated as blockers.
6. Each teammate has a handoff file.
7. Module record at `docs/backend-migration/modules/assistant.md` summarizes.

## 8. Risks

| Risk                                                                                 | Mitigation                                                                                         |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| The SkillsHub state pollution bug (125 dangling symlinks) also affects Assistant e2e | Assistant tests don't hammer the skills dir at N=20 scale; most assertions are UI-level. Low risk. |
| ipcBridge declarations subtly mismatch backend routes                                | Pre-flight doc check by coordinator (5 min) catches this before teammate time is spent             |
| Unknown backend contract gap like TC-S-17 surfaces                                   | Same recovery path: spawn backend-dev for targeted fix                                             |
| Test fixture sandbox issue contaminates assistant state the same way                 | e2e-tester applies same state-reset pattern as Phase B rerun                                       |

## 9. Decision log

- **Scope downgrade:** originally planned as 3-submodule pilot; reduced to
  verification track after discovering all code paths already migrated.
  Estimated total effort: 2-3 hours vs. pilot's ~9 hours.
- **Team size:** 2 teammates (frontend-dev + e2e-tester), backend-dev on
  demand only. Coordinator still runs the pipeline.
- **Branch strategy:** single verification branch instead of split fe/e2e, to
  reduce merge surface.
- **P0 post-Skill-pilot tickets NOT a prerequisite:** Assistant helpers are
  DOM-driven, not IPC-driven, so the helper-migration P0 doesn't apply.
  The sandbox P0 is orthogonal.
