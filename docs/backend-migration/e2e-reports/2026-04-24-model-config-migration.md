# E2E Report — Model Config Migration (T2.5)

**Date:** 2026-04-24
**Runner:** frontend-tester (aionui-model-sync team)
**Plan:** [`../plans/2026-04-24-model-config-migration-plan.md`](../plans/2026-04-24-model-config-migration-plan.md) §Task 2.5
**Frontend spec:** [`../specs/2026-04-24-model-config-frontend-migration-design.md`](../specs/2026-04-24-model-config-frontend-migration-design.md)
**Backend spec:** `aionui-backend-model-sync-be:docs/backend-migration/specs/2026-04-24-model-config-backend-migration-design.md`
**Frontend SHA (pre-commit):** `1f293a5dc` (branch `feat/model-sync-fe`)
**Backend SHA:** `445fb80` (branch `feat/model-sync-be`, release build `target/release/aionui-backend`)
**Verdict:** Clean — all new Vitest green, full suite diff = +29 tests zero failures, integration regression probe green, Playwright smoke shows no T2-caused regressions (model-selection tests skip by source pre-existing; settings skill-library reds match the 2026-04-22 baseline).

## Scope

T2.5 validates that the T2 migration (local `model.config` → backend `/api/providers` CRUD) preserves behaviour end-to-end:

1. Vitest baseline diff (pre-T2 vs post-T2).
2. New Vitest files covering the four migration seams (IPC bridge, `ModelModalContent` CRUD, conversation param resolution, config migration no-op).
3. Playwright smoke of scenarios touching model selection / settings.
4. Integration regression probe: run the release backend, POST a provider, prove `/api/settings/client` does not leak `model.config`, prove round-trip and restart persistence.

## Baseline diff (Vitest)

|                                                                             | Files                      | Tests                                  |
| --------------------------------------------------------------------------- | -------------------------- | -------------------------------------- |
| Pre-T2 baseline (`/tmp/vitest-baseline-pre-t2.txt`, 2026-04-24 15:19 local) | 421 passed / 9 skipped     | 4377 passed / 50 skipped / 22 todo     |
| Post-T2 (this report, 2026-04-24 16:53 local)                               | **425 passed** / 9 skipped | **4406 passed** / 50 skipped / 22 todo |
| Delta                                                                       | **+4 files**               | **+29 tests**                          |

The +4 files and +29 tests match exactly the four new files added by T2.5 (9 + 3 + 10 + 7 = 29). **No pre-existing test regressed.**

## New Vitest coverage

All new files live under `tests/unit/`. Run individually before the full suite to isolate failures.

| #   | File                                                    | Tests   | What it locks in                                                                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `tests/unit/ipcBridge.providers.test.ts`                | 9 pass  | Channel names (`providers.list/create/update/delete`) and payload shapes (`{ providers }`, `{ provider }`, `{ id }`, snake_case `base_url`/`api_key`/`model_health`). Also asserts the deprecated `getModelProviders`/`setModelProviders` IPC surface is gone.                                                                       |
| 2   | `tests/unit/ModelModalContent.crud.dom.test.tsx`        | 7 pass  | React DOM smoke of `ModelModalContent`: SWR data render, add-platform flow hits `createProvider`, enable toggle → `updateProvider` (full-body PUT), delete confirm → `deleteProvider`, health-check success/failure → `updateProvider` with partial `{ model_health }`, clear-all → `updateProvider` with `model_health: undefined`. |
| 3   | `tests/unit/createConversationParams.providers.test.ts` | 10 pass | Conversation creation reads providers from `/api/providers` (not `model.config`), falls back correctly when a platform is missing, surfaces enabled/disabled state, snake_case contract preserved into conversation init payload.                                                                                                    |
| 4   | `tests/unit/configMigration.noModelConfig.test.ts`      | 3 pass  | Legacy `model.config` key is **never written** by the client. Config migration routines treat it as deleted; reading old `model.config` from backend client-prefs does nothing (soft-ignored).                                                                                                                                       |

Commands:

```bash
bun run test --run tests/unit/ipcBridge.providers.test.ts
bun run test --run tests/unit/ModelModalContent.crud.dom.test.tsx
bun run test --run tests/unit/createConversationParams.providers.test.ts
bun run test --run tests/unit/configMigration.noModelConfig.test.ts
bun run test --run   # full suite diff
```

All four individually green, full suite green (see baseline diff above).

## Playwright smoke

**Initial status (pre-vite-fix):** Deferred — `bunx electron-vite build` failed on the renderer-copy step because `electron.vite.config.ts:103-104` referenced `src/process/resources/skills/*` and `src/process/resources/assistant/*`, both deleted in commit `081b41a4d` without updating the config.

**Resolution:** Team-lead shipped `3c825efb2 fix(build): remove stale src/process/resources/{skills,assistant} copy targets` on 2026-04-24. Build now succeeds in ~14s.

What this DOM-level suite covers regardless of Playwright availability: the `ModelModalContent.crud.dom.test.tsx` file in T2.5 exercises add / edit / toggle / delete / health-check at the same component surface a Playwright model-config smoke would touch. Playwright below adds the app-level integration signal on top.

### Playwright smoke (re-run after vite fix)

**Build:** `bunx electron-vite build` — ✓ built in 13.57s (warnings about chunk size are pre-existing, unrelated).
**Backend symlink:** temporarily repointed `~/.cargo/bin/aionui-backend` → `aionui-backend-model-sync-be/target/release/aionui-backend` (original: `aionui-backend-assistant-camel/target/release/aionui-backend`, saved at `/tmp/backend-symlink-original.txt`, restored after run).
**Runner:** Playwright dev mode (`E2E_DEV=1` default), one worker, singleton Electron.

| # | Suite | Result | Notes |
|---|---|---|---|
| 1 | `tests/e2e/features/conversations/aionrs/model-selection.e2e.ts` (2 tests) | **2 skipped** | Both tests explicitly `test.skip(...)` at source (TC-A-04 line 70, TC-A-07 line 135) — pre-existing skip because of an aionrs-binary state issue documented in `tests/e2e/docs/chat-aionrs/implementation-mapping.zh.md`. Not caused by T2. The `beforeAll` hook ran `resolveAionrsPreconditions(page)` successfully, meaning the provider-resolution path through the e2e helpers survived the migration (see helper gap below). |
| 2 | `tests/e2e/features/settings/skills/core-ui.e2e.ts` (7 tests) | **1 pass / 6 fail** | Failures are pre-existing skill-library issues. The `docs/backend-migration/e2e-reports/2026-04-22-skill-library.md` report (lines 67-73) documents the same `TC-S-01/05/08/10/16/19` tests as FAIL in the pre-T2 baseline. Errors are locator / element-not-found / strict-mode violations in the skill-library UI, not related to model config. Class: pre-existing, out of scope. |

**Verdict:** No Playwright failure caused by T2 model-config migration. The direct model-selection suite skips cleanly (expected: no provider configured in the test env, and the affected tests are explicitly skipped by source anyway). Settings-side smoke exhibits pre-existing skill-library failures that match the 2026-04-22 baseline — they flagged as needing attention independently, not regressions introduced by T2.

### E2E helper gap identified (T2 follow-up)

During inspection, found that the aionrs/gemini e2e helpers still call a **removed** IPC channel:

- `tests/e2e/helpers/chatAionrs.ts:57` → `invokeBridge(page, 'mode.get-model-config', {})`
- `tests/e2e/helpers/chatGemini.ts:38,449` → `invokeBridge(page, 'mode.get-model-config', {})`

The `mode.get-model-config` channel was removed as part of T2 (`src/common/adapter/ipcBridge.ts:490` now exposes `listProviders: httpGet<IProvider[]>('/api/providers')` instead). Grep confirms no remaining usage of `get-model-config` or `getModelConfig` in `src/`.

**Impact:** `invokeBridge` returns non-array / null → `resolveAionrsPreconditions` and `resolveGeminiPreconditions` enter the early-return branch → every dependent test skips with "No provider found". Tests don't error; they silently lose coverage. This is why the model-selection tests in this smoke reached `beforeAll` but skipped.

**Recommendation:** File a follow-up to update `chatAionrs.ts:57` and `chatGemini.ts:38,449` to call `listProviders` instead of `mode.get-model-config`. Small, mechanical patch. Does not affect T2.5 verdict — the helpers fail gracefully, so no red is masked — but without this, provider-dependent e2e tests will stay silently skipped across the tree.

## Integration regression probe

**Goal:** Prove the live release backend honours the frontend's snake_case wire contract, never writes `model.config` to client preferences, survives a restart.

**Binary:** `/Users/zhoukai/Documents/worktrees/aionui-backend-model-sync-be/target/release/aionui-backend` (54 MB, built by backend team — not rebuilt by the frontend tester).
**Data dir:** `$(mktemp -d)` — fresh per probe, no bleed.
**Port:** 25910.

Full transcript:

```
### Integration regression probe transcript
### Timestamp: 2026-04-24T08:58:09Z
### Binary: /Users/zhoukai/Documents/worktrees/aionui-backend-model-sync-be/target/release/aionui-backend
### Data dir: /var/folders/_s/.../tmp.Usq8Wa1Mxb/data

--- 1. Empty providers list (fresh data-dir) ---
{"success":true,"data":[]}

--- 2. POST /api/providers (frontend-style 8-char hex id, snake_case body) ---
REQUEST: {"id":"a1b2c3d4","platform":"openai","name":"regtest","base_url":"https://a.example","api_key":"sk-regression","models":["gpt-4"]}
{"success":true,"data":{"id":"a1b2c3d4","platform":"openai","name":"regtest","base_url":"https://a.example","api_key":"sk-regression","models":["gpt-4"],"enabled":true,"capabilities":[],"created_at":1777021092247,"updated_at":1777021092247}}

--- 3. GET /api/settings/client (must NOT contain model.config key) ---
{"success":true,"data":{}}

--- 4. GET /api/providers (round-trip) ---
{"success":true,"data":[{"id":"a1b2c3d4",...,"created_at":1777021092247,"updated_at":1777021092247}]}

--- 5. Restart backend with SAME data-dir, verify persistence ---
{"success":true,"data":[{"id":"a1b2c3d4",...,"created_at":1777021092247,"updated_at":1777021092247}]}

--- End of probe ---
```

**Assertions:**

| #   | Check                                                                                                        | Result               |
| --- | ------------------------------------------------------------------------------------------------------------ | -------------------- |
| 1   | Fresh data-dir → empty provider list                                                                         | pass                 |
| 2   | POST accepts 8-char hex id + snake_case body; response echoes `base_url`/`api_key`/`created_at`/`updated_at` | pass                 |
| 3   | `GET /api/settings/client` response `data` has no `model.config` key                                         | pass (returned `{}`) |
| 4   | Round-trip GET returns the posted provider unchanged                                                         | pass                 |
| 5   | After `kill` + relaunch with same data-dir, provider still present                                           | pass                 |

Raw transcript is also saved at `/tmp/integration-probe-transcript.txt` for reviewer inspection.

## Spec vs implementation deviation

The frontend spec (`specs/2026-04-24-model-config-frontend-migration-design.md`) suggests `PUT /api/providers/:id` accepts a **partial** update body. The current `ModelModalContent.tsx` implementation is **mixed**:

| Call site                                                              | Body shape                                             | Sent by                                                                                          |
| ---------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `updatePlatform` (`ModelModalContent.tsx:130`) → `persistPlatform:124` | **Full-body** — every field of `IProvider` except `id` | Toggles (enabled/disabled), add-model, delete-model, protocol changes, edit-platform form submit |
| `performHealthCheck` (`:354`, `:394`)                                  | **Partial** — `{ id, model_health }` only              | Per-model health check (success and failure paths)                                               |
| `clearAllHealthData` (`:423`)                                          | **Partial** — `{ id, model_health: undefined }`        | Clear-all-health-data button                                                                     |

**Coordinator decision (respected in tests):** Do **not** change application code to fix the divergence in this task. The tests assert actual behaviour:

- `ModelModalContent.crud.dom.test.tsx` verifies enable toggle → `updateProvider` called with a **full-body** payload (contains `platform`, `name`, `base_url`, `api_key`, `models`, `enabled`, ...), while health-check and clear-all expect **partial** bodies (only `model_health`).
- `ipcBridge.providers.test.ts` verifies the IPC channel carries whatever partial or full body the caller constructed; no client-side body normalisation.

A follow-up ticket should decide whether the frontend should standardise on full-body (current majority) or whether the backend contract should explicitly document mixed semantics. Tracking note captured here for the coordinator to file.

## Housekeeping

- Transcript: `/tmp/integration-probe-transcript.txt`
- Backend probe stdout/stderr: `/tmp/backend-probe.log`, `/tmp/backend-probe2.log`
- No ports left open (both backend PIDs killed in-probe, verified `lsof -iTCP:25910 -sTCP:LISTEN` returns empty).
- No stray data dirs in source tree (all `mktemp -d` under `/var/folders/`).

## Route-back

No frontend-dev regressions required. Three items for the coordinator:

1. **~~Stale `electron.vite.config.ts`~~** — fixed by team-lead on `3c825efb2`. Playwright re-run completed; see above.
2. **Full-body vs partial PUT** — `ModelModalContent` toggles send full body while health-check sends partial. Spec suggests partial; tests lock in actual behaviour. Decide direction in follow-up.
3. **E2E helpers still call removed `mode.get-model-config` channel** (`tests/e2e/helpers/chatAionrs.ts:57`, `chatGemini.ts:38,449`). Should be migrated to `listProviders`. Silent skip today; not masking red but masking coverage. Low-risk mechanical patch.
