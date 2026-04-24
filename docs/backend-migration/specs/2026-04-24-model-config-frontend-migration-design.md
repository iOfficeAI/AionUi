---
title: Model-Config Frontend Migration to /api/providers
date: 2026-04-24
status: draft
scope: frontend (AionUi)
companion_backend_spec: aionui-backend/docs/backend-migration/specs/2026-04-24-model-config-backend-migration-design.md
---

# Model-Config Frontend Migration — Frontend Design Spec

## Background

Before launch. Model configuration (`IProvider[]`) was historically stored
locally under config key `'model.config'` and served via an IPC shim. The
backend now exposes a real provider resource at `/api/providers/*`. This
spec cuts the local path entirely — frontend talks to `/api/providers`
directly, no legacy migration, no compatibility shim.

The `/api/settings/client` endpoint currently returns `model.config`
entries as a side-effect of the old migration path pushing `IProvider[]`
into the generic key-value store. This is the observable symptom. The
root cause is that `'model.config'` is still in `ALL_LEGACY_KEYS`
(`src/common/config/configMigration.ts:19`) and still in `ConfigKeyMap`
(`src/common/config/configKeys.ts:46`). Removing both kills the
symptom and eliminates the dual-source drift.

Not in scope: preserving existing local data. Pre-launch; users reset.

## Wire Contract (authoritative in backend spec)

`IProvider` must match `ProviderResponse` exactly:

- snake_case on every field (`base_url`, `api_key`, `context_limit`,
  `model_protocols`, `model_enabled`, `model_health`, `bedrock_config`)
- `models: string[]` (plural; was `model: string[]` single)
- `api_key` is **plaintext** (backend stops masking — see backend spec)
- per-model maps (`model_protocols`, `model_enabled`, `model_health`) are
  optional; backend accepts them on create and update

## File Changes

### `src/common/config/storage.ts`

Flip `IProvider` to snake_case and rename `model` → `models`:

```ts
export interface IProvider {
  id: string;
  platform: string;
  name: string;
  base_url: string;
  api_key: string;
  models: string[];
  capabilities?: ModelCapability[];
  context_limit?: number;
  model_protocols?: Record<string, string>;
  model_enabled?: Record<string, boolean>;
  model_health?: Record<string, {
    status: 'unknown' | 'healthy' | 'unhealthy';
    last_check?: number;
    latency?: number;
    error?: string;
  }>;
  bedrock_config?: {
    auth_method: 'accessKey' | 'profile';
    region: string;
    access_key_id?: string;
    secret_access_key?: string;
    profile?: string;
  };
  enabled?: boolean;
}
```

Remove `'model.config': IProvider[]` from `IConfigStorageRefer`.
Update `TProviderWithModel = Omit<IProvider, 'models'> & { useModel: string }`.

### `src/common/config/configKeys.ts`

Remove line 46: `'model.config': IProvider[];`.

### `src/common/config/configMigration.ts`

Remove line 19: `'model.config',` from `ALL_LEGACY_KEYS`. No other
changes — if there's any stale `model.config` row in client_preferences
from a previous dev run, a separate one-off delete is enough; not
required for correctness (the frontend stops reading it).

### `src/common/adapter/ipcBridge.ts` (lines 515–540)

Replace the `mode` block. The batch shim goes away. New surface:

```ts
export const mode = {
  listProviders: httpGet<IProvider[], void>('/api/providers'),
  createProvider: httpPost<IProvider, CreateProviderRequest>('/api/providers'),
  updateProvider: httpPut<IProvider, { id: string } & UpdateProviderRequest>(
    (p) => `/api/providers/${p.id}`,
  ),
  deleteProvider: httpDelete<void, { id: string }>(
    (p) => `/api/providers/${p.id}`,
  ),
  fetchModelList: httpPost<FetchModelsResponse, { id: string; try_fix?: boolean }>(
    (p) => `/api/providers/${p.id}/models`,
  ),
  detectProtocol: httpPost<ProtocolDetectionResponse, ProtocolDetectionRequest>(
    '/api/providers/detect-protocol',
  ),
};
```

Types `CreateProviderRequest` / `UpdateProviderRequest` / `FetchModelsResponse`
added to `src/common/types/providerApi.ts` (new file, ~80 lines, direct
mirror of the Rust request/response types).

### Consumer rewrites

For each site below, replace "load all providers + mutate array + save all" with
"call the CRUD endpoint that matches the user intent" and flip field names.

- `src/renderer/components/settings/SettingsModal/contents/ModelModalContent.tsx`
  - `useSWR('model.config', () => ipcBridge.mode.getModelConfig.invoke())`
    → `useSWR('providers', () => ipcBridge.mode.listProviders.invoke())`
  - `saveModelConfig(newData)` replaced by per-mutation calls:
    - add platform → `createProvider.invoke(payload)` then SWR `mutate()`
    - update platform/model → `updateProvider.invoke({id, ...patch})` then mutate
    - remove platform → `deleteProvider.invoke({id})` then mutate
    - toggle model enable / protocol / health → partial `updateProvider.invoke`
      sending only the changed fields (backend already supports partial updates
      via `UpdateProviderRequest`)
  - Optimistic update pattern: `mutate(nextArray, false)` before await, revalidate on settle.
- `src/renderer/components/agent/AcpModelSelector.tsx`,
  `src/renderer/hooks/agent/useModelProviderList.ts`,
  `src/renderer/pages/guid/components/GuidModelSelector.tsx`,
  `src/renderer/pages/guid/hooks/useGuidModelSelection.ts`,
  `src/renderer/pages/conversation/platforms/aionrs/AionrsModelSelector.tsx`,
  `src/renderer/pages/conversation/platforms/gemini/GeminiModelSelector.tsx`
  — these only read. Replace `getModelConfig.invoke()` with
  `listProviders.invoke()`; flip `.model` → `.models`.
- `src/renderer/pages/settings/components/{AddPlatformModal,EditModeModal,AddModelModal}.tsx`
  — submit handlers receive an `IProvider`; rewrite parent `onSubmit`
  callsites to call the matching CRUD action.
- `src/renderer/pages/conversation/utils/createConversationParams.ts:89,126`
  — reads `configService.get('model.config')`. Replace with a new
  `providersCache` (simple in-memory, populated by the render tree on
  load). See §"Process-side read path" below.
- `src/process/team/TeamSessionService.ts:76,139`,
  `src/process/team/mcp/modelListHandler.ts:22`,
  `src/process/services/cron/WorkerTaskManagerJobExecutor.ts:369`,
  `src/process/channels/actions/SystemActions.ts:58,110`
  — these are in the Electron main/worker process. They currently use
  `ProcessConfig.get('model.config')`. Route them through the existing
  `httpBridge` the same way `assistants.*` and `skills.*` already do.
  Add a `ProviderBridge.list()` helper in `src/process/utils/httpBridge.ts`
  (or equivalent). Delete the `ProcessConfig.get('model.config')` calls.

### Tests

- `tests/unit/**/ModelModalContent*.test.tsx` — rewrite mocks to return
  snake_case `IProvider[]` and stub the single-provider CRUD endpoints
  instead of the batch save.
- Any fixture that seeds `IProvider` in `tests/fixtures/` — flip.
- Process-side tests that stub `ProcessConfig.get('model.config')` —
  rewrite to stub the HTTP bridge helper.
- No new E2E scenarios required; verify the `/model-selection` flow in
  existing Playwright suites still passes.

## Process-side read path

The main process currently treats `model.config` as a locally cached
array via `ProcessConfig`. Post-migration, the main process calls the
backend's HTTP API through `httpBridge` (same bearer-token path used by
the assistant migration's `assistants.list`). No new caching layer;
each call fetches fresh. If that proves too chatty, add a 5 s in-memory
TTL cache behind `ProviderBridge.list()` — deferred until profiling
says it matters.

## Definition of Done

- [ ] `grep -rn "'model.config'\|\"model.config\"" src/` returns zero hits
- [ ] `grep -rn "\.modelEnabled\|\.modelHealth\|\.modelProtocols\|\.baseUrl\|\.apiKey\|\.bedrockConfig\|\.contextLimit" src/renderer src/process` returns zero hits (on IProvider access sites — other types unaffected)
- [ ] `grep -rn "\.model\b" src/renderer src/process` returns zero IProvider-related hits
- [ ] `bunx tsc --noEmit` clean
- [ ] `bun run lint --quiet` baseline unchanged
- [ ] `bun run test --run` baseline or better (no new failures vs pre-change run)
- [ ] Live smoke: launch backend locally, open Settings → Model, add a provider, restart app, provider persists (round-trip through `/api/providers`, no `model.config` in `client_preferences`)
- [ ] `curl http://127.0.0.1:<port>/api/settings/client | jq 'keys'` post-smoke has no `model.config` key

## Rollout

Frontend branch: `feat/model-sync-fe` (worktree
`/Users/zhoukai/Documents/worktrees/aionui-model-sync-fe`, based on
`origin/feat/backend-migration-coordinator`).

Depends on backend T1. See plan.
