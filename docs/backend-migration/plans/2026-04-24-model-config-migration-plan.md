# Model-Config Migration — Implementation Plan

> **Team mode.** Pre-launch cleanup: frontend stops using local
> `model.config`, talks to `/api/providers` directly. Backend softens
> 3 constraints to make the frontend rewrite clean.
>
> **Companion specs:**
> - Backend: `aionui-backend/docs/backend-migration/specs/2026-04-24-model-config-backend-migration-design.md`
> - Frontend: `AionUi/docs/backend-migration/specs/2026-04-24-model-config-frontend-migration-design.md`

**Goal:** (1) frontend `IProvider` aligns with backend `ProviderResponse`
wire contract (snake_case + `models` plural); (2) frontend consumers use
single-provider CRUD instead of the batch `saveModelConfig` shim;
(3) drop `model.config` from the client-preferences KV so
`/api/settings/client` stops returning the model array; (4) backend
accepts optional `id` + per-model fields on create and returns plaintext
`api_key`.

**Team size:** 1 coordinator + 3 teammates (backend-dev, frontend-dev,
frontend-tester). Backend changes are small (3 schema tweaks + service
glue) — backend-dev self-gates via `cargo test`. Frontend touches ~14
consumer sites + IProvider-wide type flip + process-side HTTP rewiring,
which is exactly the shape of the 2026-04-23 "Migration work needs
real-user-data dry-run" lesson — dev self-test misses cross-site
regressions, so a dedicated frontend-tester is mandatory. No backend-
tester.

---

## Branches & worktrees

| Role | Worktree | Branch | Base |
| --- | --- | --- | --- |
| coordinator | `/Users/zhoukai/Documents/github/AionUi` (primary) | `feat/backend-migration-coordinator` | (existing) |
| frontend-dev | `/Users/zhoukai/Documents/worktrees/aionui-model-sync-fe` | `feat/model-sync-fe` | `origin/feat/backend-migration-coordinator` |
| frontend-tester | `/Users/zhoukai/Documents/worktrees/aionui-model-sync-fe` (same worktree, after frontend-dev push) | `feat/model-sync-fe` | (pulls after T2) |
| backend-dev | `/Users/zhoukai/Documents/worktrees/aionui-backend-model-sync-be` | `feat/model-sync-be` | `origin/feat/builtin-skills` |

Worktrees already created.

---

## Task graph

```
T0 coordinator (spec + plan commit, team spawn)
  │
  ▼
T1 backend-dev (soften provider API)
  │
  ▼
T2 frontend-dev (rewrite to CRUD, drop model.config)
  │
  ▼
T2.5 frontend-tester (vitest baseline + new coverage + e2e smoke + regression)
  │
  ▼
T3 coordinator closure (smoke + handoff)
```

Critical path: T0 → T1 → T2 → T2.5 → T3. T2 strictly depends on T1 —
posting IProvider with new optional fields before backend accepts them
returns 400 on every save. T2.5 strictly depends on T2 — nothing to test
until the rewrite lands. T3 waits for T2.5 green.

---

## Task 0 — Coordinator setup

Owner: coordinator.

- [ ] 0.1 Commit spec + plan to `feat/backend-migration-coordinator` + push. Also commit backend spec to `feat/model-sync-be`.
- [ ] 0.2 `TeamCreate` `aionui-model-sync`.
- [ ] 0.3 Spawn `backend-dev` and `frontend-dev` (Agent tool, general-purpose).
- [ ] 0.4 Assign T1 to backend-dev (the only unblocked task). frontend-dev waits on T1.

---

## Task 1 — Backend softening

Owner: backend-dev. Worktree: `aionui-backend-model-sync-be`. Branch: `feat/model-sync-be`.

See backend spec §Changes 1–3. In short:

- `CreateProviderRequest`: add `id: Option<String>`, `model_protocols`, `model_enabled`, `model_health` as optional.
- `ProviderService::create`: use `req.id` if set (validate UUID), else generate; persist per-model fields instead of hardcoding `None` at current lines 52–54.
- `ProviderResponse.api_key`: decrypt and return plaintext; delete masking helper + its tests.
- Flip/add tests per spec §Tests.

Gates (per spec §Definition of Done):
- `cargo fmt --all -- --check` clean
- `cargo test -p aionui-api-types -p aionui-system` green
- `cargo clippy --workspace -- -D warnings` baseline
- Live probe recipe in spec passes

Commit message: `feat(provider): accept optional id + per-model fields on create; return plaintext api_key (pre-launch)`

Push + SendMessage team-lead with SHA + probe output.

Progress reporting: ping team-lead every ~10 min if still working.

---

## Task 2 — Frontend rewrite

Owner: frontend-dev. Worktree: `aionui-model-sync-fe`. Branch: `feat/model-sync-fe`. Depends on T1.

See frontend spec §File Changes. In short:

1. Flip `IProvider` to snake_case + `models` plural. Remove `'model.config'` from `ConfigKeyMap` and `ALL_LEGACY_KEYS`.
2. Rewrite `ipcBridge.ts` lines 515–540 — single-provider CRUD surface; drop batch save.
3. Rewrite the ~14 consumer sites listed in the spec. Key sites:
   - `ModelModalContent.tsx`: SWR key + optimistic update + per-mutation CRUD calls.
   - `createConversationParams.ts`: drop `configService.get('model.config')` — route through new providers cache or HTTP bridge.
   - Process-side (`TeamSessionService`, `modelListHandler`, `WorkerTaskManagerJobExecutor`, `SystemActions`, `createConversationParams` reads): route through `httpBridge` like the assistant migration does.
4. Flip Vitest fixtures.

Gates (per spec §Definition of Done):
- grep checks clean
- `bunx tsc --noEmit` clean
- `bun run lint --quiet` baseline
- `bun run test --run` baseline or better
- Live smoke: local backend running, Settings → Model round-trips a provider, no `model.config` in `/api/settings/client` response

Commit message: `refactor(model-config): migrate IProvider to /api/providers CRUD; drop local model.config store`

Push + SendMessage team-lead with SHA + smoke transcript.

Progress reporting every ~10 min.

---

## Task 2.5 — Frontend testing

Owner: frontend-tester. Worktree: `aionui-model-sync-fe` (pulls T2's commit). Depends on T2.

**Scope:**

1. **Vitest baseline diff.** Pre-T2 baseline (on `origin/feat/backend-migration-coordinator`): run `bun run test --run`, capture pass/fail/skip counts. Post-T2: rerun, diff. Any NEW failure vs baseline = regression, route back to frontend-dev with file:line.

2. **New Vitest coverage** for the rewrite (write these, they did not exist before):
   - `tests/unit/ipcBridge.providers.test.ts` — unit test the 6 new `mode.*` bridge entries (create, update, delete, list, fetchModelList, detectProtocol) hit the right URL + method + body shape. Mock `fetch`.
   - `tests/unit/ModelModalContent.crud.test.tsx` — add, remove, update, toggle-model-enable, toggle-protocol each call the expected single CRUD endpoint with the expected payload. Mock `ipcBridge.mode.*`. Important scenarios:
     * Adding a new platform sends `createProvider` with a UUID v4 id.
     * Toggling `model_enabled` sends `updateProvider` with ONLY `model_enabled` in the body (partial update), not the whole IProvider.
     * Deleting sends `deleteProvider` by id only.
     * Health check result persists via `updateProvider` with only `model_health`.
   - `tests/unit/createConversationParams.providers.test.ts` — verifies the new provider lookup path (not `configService.get('model.config')`).
   - `tests/unit/configMigration.noModelConfig.test.ts` — regression: `ALL_LEGACY_KEYS` does NOT contain `'model.config'`, and migrating a legacy store containing a `model.config` entry does NOT push it to the backend (important — this is the observed bug).

3. **Playwright e2e smoke.** Run `tests/e2e/features/**` suites that touch model selection or settings. Expected: baseline green. If a provider-related scenario exists, rerun it against the real backend built from `feat/model-sync-be` (launch backend manually, or per existing e2e harness).

4. **Integration regression probe** (MANDATORY — this is the whole point of the migration, lesson from 2026-04-23):
   - Launch backend (`cd /Users/zhoukai/Documents/worktrees/aionui-backend-model-sync-be && cargo run --release -- --local --port 25910 --data-dir "$(mktemp -d)"`)
   - Launch the Electron app (or use a Vitest-based HTTP test with `fetch`) pointing at `127.0.0.1:25910`
   - Add a provider via the UI (or POST)
   - `curl http://127.0.0.1:25910/api/settings/client | jq 'keys'` → must NOT contain `"model.config"`
   - `curl http://127.0.0.1:25910/api/providers | jq '.data[0].id'` → must equal what the frontend sent
   - Restart app → provider list still populated (persistence check)

**Gates:**
- Baseline Vitest diff: no new failures.
- New Vitest tests: all green.
- Playwright: baseline or better.
- Integration regression probe: all 3 checks pass.

**Deliverables:**
- Commit new Vitest files under `tests/unit/`, message: `test(model-config): coverage for /api/providers CRUD migration`
- Append a "T2.5 test report" section to `docs/backend-migration/e2e-reports/2026-04-24-model-config-migration.md` (new file): baseline diff, new test results, probe transcript.
- Push + SendMessage team-lead with SHA and summary.

**If you find regressions:** route back to frontend-dev with specific file:line and expected vs actual. Do not claim T2.5 complete until everything is green.

Progress reporting every ~10 min.

---

## Task 3 — Coordinator closure

Owner: coordinator.

- [ ] 3.1 Pull both branches, inspect diffs.
- [ ] 3.2 Run the live smoke from frontend spec DoD (backend started, add provider via UI, restart, inspect `/api/settings/client`).
- [ ] 3.3 Merge `feat/model-sync-fe` into `feat/backend-migration-coordinator` (+ merge backend branch on the backend repo per that repo's convention).
- [ ] 3.4 Write handoff `docs/backend-migration/handoffs/coordinator-model-config-2026-04-24.md`.
- [ ] 3.5 Append module log to `docs/backend-migration/modules/` (new file: `provider-config.md`).
- [ ] 3.6 Shutdown teammates, TeamDelete.

No PRs — per user convention.

---

## Operational rules (from playbook)

- Zombie replacement is autonomous — no user approval (10 min silence + zero git + no messages = replace).
- Coordinator spot-checks TaskList + inbox + `git log -3` on both repos every ~10 min when actively waiting.
- Every teammate completion message must be ACK'd within one coordinator turn.
- Spawn prompt ≤ 40 lines — teammates read plan for detail.
- User asks "status?" → run full scan before answering.

## Success Criteria

- [ ] `grep -rn "'model.config'" AionUi/src/` zero hits
- [ ] Backend `POST /api/providers` with `{"id":"..."}` returns that exact id; response `api_key` is plaintext
- [ ] ModelModalContent loads providers from `/api/providers`
- [ ] `/api/settings/client` response has no `model.config` key after a clean round-trip
- [ ] All gates green on both sides
