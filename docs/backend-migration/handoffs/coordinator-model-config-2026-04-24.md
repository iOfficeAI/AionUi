---
title: Coordinator Handoff — Model-Config Migration
date: 2026-04-24
pilot: aionui-model-sync
team_size: 1 lead + 3 teammates (backend-dev, frontend-dev, frontend-tester)
status: closed
---

# Coordinator Handoff — Model-Config Migration

## Summary

Pre-launch cleanup of a dual-source drift where model provider config
was stored both in the backend-local `providers` table AND in the
generic client-preferences KV as the key `model.config`. The KV path
was a leftover from the legacy-migration pass and caused
`GET /api/settings/client` to return the entire `IProvider[]` array as
a side-effect. Frontend also hit the wrong data source — some
components read from `providers` (empty in fresh installs), others
read from KV (populated by migration).

**Outcome**: single source of truth. Frontend talks to
`/api/providers/*` CRUD. `model.config` no longer exists in
`ConfigKeyMap` or the legacy-migration list. Backend relaxes its
create API just enough to avoid forcing workarounds (optional id,
per-model fields on create, plaintext api_key).

## Merged branches

| Repo | Branch | Final SHA | Merged into |
| --- | --- | --- | --- |
| AionUi | `feat/model-sync-fe` | `140ec6950` (tip) | `feat/backend-migration-coordinator` via merges `e39b47f77` (initial) + `dc8b11754` (docs follow-ups) |
| aionui-backend | `feat/model-sync-be` | `7b09985` (tip) | `feat/builtin-skills` via merges `8dcccc8` (T1/T1b) + `d08255e` (T4) |

No PRs per project convention.

## Scope shipped

Backend (see `aionui-backend` spec `2026-04-24-model-config-backend-migration-design.md`):

- T1: `CreateProviderRequest` accepts optional `id` + `model_protocols`
  + `model_enabled` + `model_health`. Service `create()` uses provided
  id if set (lenient validation: 1..=128 chars, `[A-Za-z0-9_-]`,
  duplicate → 409 Conflict) else generates UUID. Per-model JSON
  fields persist at create time.
- T1: `ProviderResponse.api_key` is decrypted to plaintext on
  response. Mask helper retained only for protocol-detection
  multi-key diagnostics (`KeyTestResult.masked_key`).
- T1b: New anonymous `POST /api/providers/fetch-models` for pre-
  create form preview. Route order verified against
  `/api/providers/{id}/models` shadow.
- 22 new unit tests (T1: 13 + T1b: 11) plus 5 flipped from `***`
  assertions to plaintext.

Backend T4 (SHA `7b09985`, added post-initial-closure when user
reported `/api/providers` empty in their dev env — see "Data
migration reversal" below):

- New `crates/aionui-system/src/provider_migration.rs` (631 lines +
  16 tests). Startup-triggered one-shot migration: reads legacy
  `client_preferences.model.config` JSON, translates camelCase →
  snake_case, encrypts api_key, INSERTs into providers table,
  deletes the KV row.
- 3 idempotency guards: providers-non-empty skip, KV-key-absent
  skip, post-success KV delete.
- Translation handles nested `modelHealth[m].lastCheck →
  last_check`, bedrock 3-branch (nested object / flat `bedrock*`
  on bedrock platform only / drop as stale), `useModel` drop,
  `enabled` default-true.
- Non-fatal failure mode — any translate/insert error leaves KV
  key in place for retry.
- End-to-end verified on copy of user's real dev DB: 4 legacy
  providers lifted with preserved ids, `model.config` row deleted,
  `GET /api/providers` returns correct data, encryption round-trips
  through decrypt.

Frontend (see spec `2026-04-24-model-config-frontend-migration-design.md`):

- T2: `IProvider.model → models` (plural). `model_health[x].lastCheck →
  last_check`. Other snake_case fields were already flipped pre-pilot.
- T2: `ipcBridge.mode` rewritten. Old batch shim (`saveModelConfig` /
  `getModelConfig`) removed. New surface: `listProviders`,
  `createProvider`, `updateProvider`, `deleteProvider`,
  `fetchProviderModels` (by-id refresh), `fetchModelList` (T1b
  anonymous pre-create), `detectProtocol`. 409 conflict toasted via
  new i18n key `settings.providerIdConflict`.
- T2: `'model.config'` removed from `ConfigKeyMap` (`configKeys.ts`)
  and `ALL_LEGACY_KEYS` (`configMigration.ts`). This is the root-
  cause fix for the reported `/api/settings/client` leak.
- T2: ~30 consumer sites rewired. Renderer sites switched to the new
  bridge CRUD; process-side sites (TeamSessionService / SystemActions
  / modelListHandler / WorkerTaskManagerJobExecutor /
  createConversationParams) route via `httpBridge` the same way
  `assistants.list.invoke()` already does.
- T2.5: 4 new Vitest files (29 tests total). Baseline diff clean
  (+29/0 new failures). Integration regression probe green — posting
  via `/api/providers` does NOT leak `model.config` into
  `/api/settings/client`; provider persists across backend restart.

## Data migration reversal (late-pilot correction)

Initial user direction was "pre-launch, no migration needed". I
interpreted that as "no data migration anywhere", and scoped T1–T2.5
to pure code migration — frontend talks to new API, legacy KV
abandoned. After closure smoke, user ran backend against their own
dev DB and found `/api/providers` returned empty, because the 4
legacy providers were still in `client_preferences.model.config` and
nothing moved them.

Correct interpretation: user meant "no production rollout to worry
about", not "my own dev data doesn't matter". Added T4 (backend
one-shot startup migration) to cover the dev-env case. Lesson for
the playbook: when user says "pre-launch no migration", verify
whether their own dev state is empty OR whether they expect an
automatic lift — the answer decides if the pilot needs a migration
task or not.

## Observable outcome (user-reported symptom)

Before pilot: `GET /api/settings/client` returned `{"model.config": [<IProvider[]>], ...}`.
After pilot: `GET /api/settings/client` has no `model.config` key
(verified in T2.5 integration probe and final coordinator smoke).

`ModelModalContent` now loads providers from `/api/providers` which
on first boot post-T4 rehydrates automatically from the legacy KV.
User's 4 dev-env providers (Zhipu / Gemini / New API / OpenAI)
preserved with original ids, api keys, model_enabled state, and
model_health.last_check timestamps.

## Deviations & followups

1. **ModelModalContent mixed partial/full-body PUT** — spec wanted
   all toggle paths to send partial updates (only the changed
   fields). Implementation routes toggles through `updatePlatform`
   which sends full body; only `performHealthCheck` and
   `clearAllHealthData` are partial. Accepted because backend
   `UpdateProviderRequest` supports both, and api_key plaintext
   eliminated the "mask overwrites real key" risk that was the
   original motivation for strict-partial. Documented in T2.5 e2e
   report §"Spec vs implementation deviation".

2. **E2E helper stale IPC channel** — `tests/e2e/helpers/chatAionrs.ts:57`
   and `tests/e2e/helpers/chatGemini.ts:38,449` still call the
   removed `mode.get-model-config` IPC channel. Not a regression
   (test code, pre-existing skip). Fix requires rewiring from
   `invokeBridge` (`@office-ai/platform` subscribe protocol) to
   direct HTTP fetch against backend port — ~20-30 lines with
   port-discovery. Filed as T2.5 e2e report followup #3.

3. **`electron.vite.config.ts` stale viteStaticCopy targets**
   (`src/process/resources/{skills,assistant}/*`) — deleted in prior
   pilots, never cleaned from vite config. Blocked Playwright
   smoke. Coordinator fixed directly (commit `3c825efb2`). Same
   class of issue as the 2026-04-24 playbook lesson "delete stale
   frontend source".

4. **Coordinator branch pre-existing tsc errors** (~267 after this
   merge, ~270 before) — snake_case payloads calling camelCase type
   signatures from prior assistant-realignment work merged but never
   finished. NOT introduced by this pilot. This merge net -3 errors.
   Out of scope; flagged as a separate cleanup.

## Gates at closure

**Backend** (`feat/builtin-skills` tip `d08255e`):
- cargo fmt ✓, test ✓ (touched crates 1142+/0 after T4 adds 16), clippy ✓ (no new warnings).
- Final coordinator live probe (release binary, fresh data-dir, port 25912):
  - POST provider with 8-char hex id + model_enabled → 201, plaintext api_key, field persisted ✓
  - `/api/settings/client` → `data: {}` (no model.config) ✓
  - Kill + relaunch with same data-dir → provider persists ✓
- T4 migration verified on copy of user's real dev DB (port 25915):
  - 4 legacy providers migrated, ids preserved, KV key deleted, original api_key decrypts back to plaintext ✓

**Frontend** (`feat/backend-migration-coordinator` tip `e39b47f77`):
- `bunx tsc --noEmit` → 267 errors, ALL pre-existing on coordinator
  branch (see Deviation #4). Merge net -3.
- `bun run lint --quiet` → 1727 warnings / 1 error (baseline 1728/1, -1 warning).
- `bun run test --run` → 425 passed / 9 skipped test files; 4406 passed
  / 50 skipped / 22 todo tests (pre-pilot baseline 421/4377; +4 files / +29 tests, zero new failures).
- `bunx electron-vite build` → 14s clean after Deviation #3 fix.

## Team conduct notes (for playbook)

See module log `modules/provider-config.md` for lessons added to the
playbook. Key items:

- Message-timing hazard with mid-stream arbitration flips: delete or
  explicitly void the superseded message rather than leaving both in
  the teammate's inbox. Triggered multi-round re-confirmation by
  backend-dev after I flipped strict-UUID → lenient mid-stream.
- Zombie replacement of frontend-tester at 16:49 — standard criteria
  met (silence ≥ 10 min, inbox unread, zero new commits), replaced
  autonomously per playbook. New agent successfully picked up the
  dirty-worktree state (4 test files, 949 lines, all green when
  measured). Records the "zombie can die mid-execution with clean
  intermediate state" case.

## Shutdown

- TeamDelete `aionui-model-sync` after this handoff commit pushes.
- Worktrees `aionui-model-sync-fe` and `aionui-backend-model-sync-be`
  can be removed once other session activity confirms nothing else is
  using them.
- `~/.cargo/bin/aionui-backend` symlink restored to `aionui-backend-
  assistant-camel/target/release/aionui-backend` (pre-pilot target).
