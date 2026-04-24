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

**Most snake_case flips are already done on this branch** — `base_url`,
`api_key`, `context_limit`, `model_protocols`, `model_enabled`,
`model_health`, `bedrock_config` are already snake_case in
`IProvider`. The remaining wire-contract flips are:

- **`model: string[]` → `models: string[]`** (plural)
- **`model_health[x].lastCheck` → `model_health[x].last_check`**
  (camelCase on nested field)

Everything else described below as "flip to snake_case" is a no-op for
those fields — don't waste time searching for `.baseUrl` etc., they
don't exist in current tree.

Full target shape:

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

Replace the `mode` block. The batch shim goes away. Two separate
fetch-models entries — anonymous pre-create vs by-id refresh. New surface:

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
  // Anonymous pre-create: user fills AddPlatformModal, clicks "Fetch Models"
  // before the provider row exists. Credentials in body, no id.
  fetchModelList: httpPost<FetchModelsResponse, {
    platform: string;
    base_url: string;
    api_key: string;
    bedrock_config?: BedrockConfig;
    try_fix?: boolean;
  }>('/api/providers/fetch-models'),
  // By-id refresh: provider already persisted, refresh its model list.
  fetchModelsForProvider: httpPost<FetchModelsResponse, { id: string; try_fix?: boolean }>(
    (p) => `/api/providers/${p.id}/models`,
  ),
  detectProtocol: httpPost<ProtocolDetectionResponse, ProtocolDetectionRequest>(
    '/api/providers/detect-protocol',
  ),
};
```

Backend endpoint `POST /api/providers/fetch-models` added in T1b. See
backend spec §5.

Types `CreateProviderRequest` / `UpdateProviderRequest` / `FetchModelsResponse`
added to `src/common/types/providerApi.ts` (new file, ~80 lines, direct
mirror of the Rust request/response types).

### Consumer rewrites

Two kinds of rewrite, don't conflate them:

- **Data-source rewrite** (only for sites that *write* or *load from
  config*): replace `getModelConfig` / `saveModelConfig` with the new
  single-provider CRUD.
- **Field rename** (for every site that touches `.model` array or
  `.model_health[x].lastCheck`): `.model` → `.models`, `.lastCheck` →
  `.last_check`. This is mechanical, affects way more files than the
  data-source rewrite. Plan accordingly.

#### Data-source rewrites (renderer — load/save)

- `src/renderer/components/settings/SettingsModal/contents/ModelModalContent.tsx`
  - `useSWR('model.config', () => ipcBridge.mode.getModelConfig.invoke())`
    → `useSWR('providers', () => ipcBridge.mode.listProviders.invoke())`
  - `saveModelConfig(newData)` replaced by per-mutation calls:
    - add platform → `createProvider.invoke(payload)` then SWR `mutate()`
    - update platform/model → `updateProvider.invoke({id, ...patch})` then mutate
    - remove platform → `deleteProvider.invoke({id})` then mutate
    - toggle model enable / protocol / health → partial `updateProvider.invoke`
      sending only the changed fields (backend supports partial updates via
      `UpdateProviderRequest`)
  - Optimistic update pattern: `mutate(nextArray, false)` before await, revalidate on settle.
- Readers (swap `getModelConfig.invoke()` for `listProviders.invoke()`):
  - `src/renderer/components/agent/AcpModelSelector.tsx`
  - `src/renderer/hooks/agent/useModelProviderList.ts`
  - `src/renderer/hooks/agent/useConfigModelListWithImage.ts`
  - `src/renderer/pages/guid/components/GuidModelSelector.tsx`
  - `src/renderer/pages/guid/hooks/useGuidModelSelection.ts`
  - `src/renderer/pages/conversation/platforms/aionrs/AionrsModelSelector.tsx`
  - `src/renderer/pages/conversation/platforms/gemini/GeminiModelSelector.tsx`
  - `src/renderer/pages/conversation/utils/createConversationParams.ts:89,126`
    (currently reads `configService.get('model.config')`)
- Submit-handlers that receive a full `IProvider` — parent `onSubmit`
  callsites call the right CRUD action:
  - `src/renderer/pages/settings/components/AddPlatformModal.tsx`
  - `src/renderer/pages/settings/components/AddModelModal.tsx`
  - `src/renderer/pages/settings/components/EditModeModal.tsx`

#### Data-source rewrites (process / main)

These sites currently use `ProcessConfig.get('model.config')` (Electron
main + worker). Route through `httpBridge` same way `assistants.*` and
`skills.*` already do. Add a `ProviderBridge.list()` helper in
`src/process/utils/httpBridge.ts`.

- `src/process/team/TeamSessionService.ts:76,139`
- `src/process/team/mcp/modelListHandler.ts:22`
- `src/process/services/cron/WorkerTaskManagerJobExecutor.ts:369`
- `src/process/channels/actions/SystemActions.ts:58,110` (+ the
  fabricated-IProvider literals at :119,151,161,180 need `.model` →
  `.models` rename too)

#### Field-rename-only sites (renderer)

No logic change, just `.model` → `.models` and `.lastCheck` →
`.last_check` on `IProvider` access. Full list from recon:

- `src/renderer/utils/model/modelCapabilities.ts:95`
- `src/renderer/components/settings/SettingsModal/contents/channels/ChannelModalContent.tsx:102`
- `src/renderer/components/settings/SettingsModal/contents/ToolsModalContent.tsx:538,542`
- `src/renderer/pages/guid/utils/modelUtils.ts:24,31`

#### Field-rename-only sites (common / process)

- `src/common/utils/teamModelUtils.ts:79,81,96,99`
- `src/process/team/TeamSessionService.ts:99,107,113,115,116,129,131,132,147,150`
- `src/process/channels/actions/SystemActions.ts:119,151,161,180`
  (overlaps with data-source rewrites — do both in one pass)

#### Test-file rewrites

All need `.model` → `.models` and `.lastCheck` → `.last_check` in IProvider fixtures, plus any that stub `ipcBridge.mode.getModelConfig / saveModelConfig` need to be rewritten to stub the new CRUD surface:

- `tests/unit/guidAgentSelection.dom.test.ts`
- `tests/unit/teamModelUtils.test.ts`
- `tests/unit/createConversationParams.test.ts`
- `tests/unit/EditModeModal.dom.test.tsx`
- `tests/unit/ChannelModelSelectionRestore.dom.test.tsx`
- `tests/unit/process/teamSessionService.test.ts`
- `tests/unit/process/initStorage.jsonFileBuilder.test.ts`
- `tests/unit/modelModalContentHelpers.test.ts`
- `tests/unit/channels/weixinSystemActions.test.ts`
- `tests/unit/common/toolsModalContent.dom.test.tsx`
- `tests/unit/AcpModelSelector.dom.test.tsx`
- `tests/unit/GuidModelSelector.dom.test.tsx`
- `tests/unit/modelFallback.test.ts`
- `tests/unit/guidAgentHooks.dom.test.ts`
- `tests/unit/geminiHooks.dom.test.ts`

### Tests

See the §"Test-file rewrites" list above for every Vitest file that
needs fixture / mock adjustments.

No new E2E scenarios required for T2 (frontend-dev). Test coverage
(new Vitest for the CRUD bridge + regression probe for `model.config`
no longer leaking to `/api/settings/client`) is T2.5's scope — see
plan §"Task 2.5 — Frontend testing".

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
