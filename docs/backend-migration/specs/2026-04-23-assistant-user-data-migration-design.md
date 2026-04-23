# Assistant User Data Migration — Design Spec

**Date:** 2026-04-23
**Scope:** Migrate user-authored assistant definitions (currently stored in
`ConfigStorage.get('assistants')` inside Electron's `aionui-config.txt`) to the
Rust backend as the single source of truth.

**Companion spec (backend-side API contract + data model):**
[`aionui-backend/docs/backend-migration/specs/2026-04-23-assistant-user-data-migration-design.md`](../../../../aionui-backend/docs/backend-migration/specs/2026-04-23-assistant-user-data-migration-design.md)

**Out of scope (deferred):**

- `ConfigStorage.get('acp.customAgents')` migration (custom ACP engine configs)
- Migration of other legacy keys (`mcp.config`, `gemini.config`, `theme`, ...)
  — these remain on the current dual-write path until their own spec cycles.
- Built-in skill migration — reuses the built-in-asset scaffolding introduced
  here in a follow-up spec.

---

## 1. Context & Problem

Assistants in AionUi today flow through three sources:

| Source                   | Where it lives today                                            |
| ------------------------ | --------------------------------------------------------------- |
| Built-in presets         | Hard-coded in `src/common/config/presets/assistantPresets.ts`   |
| User-authored presets    | `ConfigStorage.get('assistants')` → `aionui-config.txt`         |
| Extension-contributed    | Resolved by backend from `contributes.assistants[]`             |

The backend already serves **only** extension-contributed assistants via
`GET /api/extensions/assistants`. Built-ins and user-authored presets never
reach the backend. The frontend merges all three on every `useAssistantList`
load.

Consequences:

- User data is trapped in a local Electron file; no sync, no multi-client,
  no backend-side validation.
- Built-in assistant definitions are duplicated between the frontend TypeScript
  array and the intent of the backend extension registry.
- Every frontend consumer of "assistants" runs merge logic
  (`useAssistantList`, `usePresetAssistantInfo`, `useCustomAgentsLoader`,
  `SkillRuleGenerator`, etc.) and is tied to the shape of `AcpBackendConfig`
  — a type whose original purpose was "ACP backend engine definition,"
  not "assistant persona."

## 2. Goals

1. **Backend owns all assistant sources** — merge built-in + user + extension
   inside the backend and return a single flat list.
2. **Single authoritative source per key** — no double-writing of `assistants`
   to Electron's `aionui-config.txt` after migration completes. This prevents
   the drift pattern that `mcp.config` currently exhibits (where backend API
   exists but the frontend still writes the config file).
3. **Preserve existing user data** — legacy `ConfigStorage.get('assistants')`
   entries must be imported on first launch; zero data loss for users who
   already have custom assistants.
4. **Clean type boundaries** — introduce a dedicated `Assistant` type; stop
   overloading `AcpBackendConfig`.

## 3. Non-Goals

- Migrating extension-contributed assistants' storage — already correct.
- Changing the rule-md file storage (`~/.aionui/assistant-rules/`) — the
  existing `/api/skills/assistant-rule/*` endpoints stay, only their internal
  dispatch gains a source-aware branch.
- Implementing built-in-skill migration in this spec. (Follow-up.)

## 4. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│  GET /api/assistants                                │
│  AssistantService::list()                           │
│       │                                              │
│       ├─ builtin: BuiltinAssistantRegistry          │
│       │  ← assets/builtin-assistants/assistants.json │
│       │    (loaded once at backend startup, in-mem) │
│       │                                              │
│       ├─ user:    IAssistantRepository              │
│       │  ← SQLite `assistants` table                │
│       │                                              │
│       ├─ extension: ExtensionRegistry               │
│       │  ← aionui-extension (existing)              │
│       │                                              │
│       └─ merge + LEFT JOIN assistant_overrides      │
│          → AssistantResponse[]                      │
└─────────────────────────────────────────────────────┘
```

**Key boundaries:**

- Backend has no dependency on Electron storage format; it treats
  `assets/builtin-assistants/` as product data shipped with the binary.
- Merge logic lives in `AssistantService::list()` and nowhere else.
- Frontend makes **one call** (`GET /api/assistants`) and gets the final
  sorted, merged, status-applied list.

**New crate:** `aionui-assistant` — modeled after `aionui-system` (strongly
typed service + SQLite repository + route module).

## 5. Data Model

### 5.1 `AssistantResponse` (the wire type)

```typescript
export type AssistantSource = 'builtin' | 'user' | 'extension';

export type Assistant = {
  id: string;
  source: AssistantSource;
  name: string;
  nameI18n: Record<string, string>;
  description?: string;
  descriptionI18n: Record<string, string>;
  avatar?: string;                    // emoji | full URL | aion-asset:// URL
  enabled: boolean;                    // from overrides; extension is always true
  sortOrder: number;                   // from overrides; extension is always 0
  presetAgentType: string;             // 'gemini' | 'claude' | extension adapter id
  enabledSkills: string[];
  customSkillNames: string[];
  disabledBuiltinSkills: string[];
  context?: string;                    // inline rule content (extension-only)
  contextI18n: Record<string, string>;
  prompts: string[];
  promptsI18n: Record<string, string[]>;
  models: string[];
  lastUsedAt?: number;
};
```

The frontend derives "can edit?" / "can delete?" from `source === 'user'`.
There is **no** `isBuiltin` / `is_editable` / `isPreset` — redundant signals.

### 5.2 SQLite tables

```sql
-- User-authored assistants only. Built-in and extension assistants never
-- appear in this table.
CREATE TABLE assistants (
    id                        TEXT PRIMARY KEY,
    name                      TEXT NOT NULL,
    description               TEXT,
    avatar                    TEXT,                        -- relative path or emoji
    preset_agent_type         TEXT NOT NULL DEFAULT 'gemini',
    enabled_skills            TEXT,                        -- JSON: string[]
    custom_skill_names        TEXT,                        -- JSON: string[]
    disabled_builtin_skills   TEXT,                        -- JSON: string[]
    prompts                   TEXT,                        -- JSON: string[]
    models                    TEXT,                        -- JSON: string[]
    name_i18n                 TEXT,                        -- JSON
    description_i18n          TEXT,                        -- JSON
    prompts_i18n              TEXT,                        -- JSON
    created_at                INTEGER NOT NULL,
    updated_at                INTEGER NOT NULL
);

CREATE INDEX idx_assistants_updated_at ON assistants (updated_at DESC);

-- Per-assistant state that the user controls. Works for both user-authored
-- and built-in rows. Extension assistants are always read-only and never
-- get a row here.
CREATE TABLE assistant_overrides (
    assistant_id   TEXT PRIMARY KEY,
    enabled        INTEGER NOT NULL DEFAULT 1,
    sort_order     INTEGER NOT NULL DEFAULT 0,
    last_used_at   INTEGER,
    updated_at     INTEGER NOT NULL
);
```

No foreign keys on `assistant_overrides.assistant_id` — it may point to a
built-in (resolved in memory), user (in `assistants`), or be a zombie
(assistant was deleted). Zombie rows get cleaned up opportunistically during
`list()`.

### 5.3 Built-in manifest — `assets/builtin-assistants/assistants.json`

```json
{
  "version": "1.0.0",
  "assistants": [
    {
      "id": "builtin-office",
      "name": "Office Assistant",
      "nameI18n": { "zh-CN": "办公助手", "en-US": "Office Assistant" },
      "description": "...",
      "avatar": "assets/avatar-office.svg",
      "presetAgentType": "gemini",
      "enabledSkills": ["git-workflow"],
      "ruleFile": "rules/office.{locale}.md",
      "prompts": ["..."],
      "promptsI18n": { "zh-CN": [...], "en-US": [...] }
    }
  ]
}
```

- Field shape matches `AssistantResponse` so frontend can treat built-ins and
  users uniformly.
- `ruleFile` is a relative path with `{locale}` placeholder resolved at read
  time.
- Deliberately not reusing the `aionui-extension` scaffolding — this is
  product data, not a bundled extension. Future built-in resources (skills,
  themes) follow the same pattern with their own `assets/builtin-<type>/`
  directories.

## 6. API Contract (Summary)

See the backend-side spec for request/response bodies and error codes.

| Method | Path                                      | Purpose                                        |
| ------ | ----------------------------------------- | ---------------------------------------------- |
| GET    | `/api/assistants`                         | List all (built-in + user + extension, merged) |
| POST   | `/api/assistants`                         | Create user-authored assistant                 |
| PUT    | `/api/assistants/{id}`                    | Update user-authored assistant definition      |
| DELETE | `/api/assistants/{id}`                    | Delete user-authored assistant + cascade fs    |
| PATCH  | `/api/assistants/{id}/state`              | Update `enabled` / `sortOrder` overrides       |
| POST   | `/api/assistants/import`                  | Batch insert-only (Electron migration entry point; skip on id collision) |
| GET    | `/api/assistants/{id}/avatar`             | Serve avatar file (built-in / user)            |
| POST   | `/api/assistants/{id}/avatar`             | Upload avatar (user only)                      |
| POST   | `/api/skills/assistant-rule/read`         | Source-dispatched rule md read                 |
| POST   | `/api/skills/assistant-rule/write`        | User-only rule md write (400 for built-in/ext) |
| DELETE | `/api/skills/assistant-rule/{assistantId}`| User-only rule md delete                       |
| POST   | `/api/skills/assistant-skill/read`        | Source-dispatched skill md read                |
| POST   | `/api/skills/assistant-skill/write`       | User-only skill md write (400 for built-in/ext)|
| DELETE | `/api/skills/assistant-skill/{assistantId}`| User-only skill md delete                     |
| GET    | `/api/extensions/assistants`              | Existing — stays unchanged                     |

## 7. Frontend Refactor Scope

Grep identified **14 files** that touch `ConfigStorage.*assistants` or
`ASSISTANT_PRESETS`. Plus 3 new/renamed files.

### 7.1 Type layer

| File | Action |
| --- | --- |
| `src/common/config/storage.ts` | Remove `assistants?: AcpBackendConfig[]` from `IConfigStorageRefer`. Keep `migration.electronConfigImported` flag (used by migration). |
| `src/common/types/assistantTypes.ts` | **New** — defines `Assistant`, `AssistantSource`, `CreateAssistantRequest`, `UpdateAssistantRequest`, `SetAssistantStateRequest`, `ImportAssistantsRequest`, `ImportAssistantsResult`, `ImportError`. All shapes must mirror the Rust serde types defined in `aionui-api-types` — changes on either side require a same-PR update on the other. |
| `src/renderer/pages/settings/AssistantSettings/types.ts` | Replace `AssistantListItem = AcpBackendConfig & {...}` with `import type { Assistant } from '@/common/types/assistantTypes'`. |
| `src/renderer/pages/settings/AssistantSettings/assistantUtils.ts` | Drop `normalizeExtensionAssistants`, `isExtensionAssistant`, `getAssistantSource`. Simplify `sortAssistants` (backend returns sorted). Keep `isEmoji`, `resolveAvatarImageSrc`. |

### 7.2 IPC bridge additions

`src/common/adapter/ipcBridge.ts` — new module:

```typescript
export const assistants = {
  list: httpGet<Assistant[], void>('/api/assistants'),
  create: httpPost<Assistant, CreateAssistantRequest>('/api/assistants'),
  update: httpPut<Assistant, UpdateAssistantRequest>(
    (p) => `/api/assistants/${p.id}`,
  ),
  delete: httpDelete<void, { id: string }>(
    (p) => `/api/assistants/${p.id}`,
  ),
  setState: httpPatch<Assistant, SetAssistantStateRequest>(
    (p) => `/api/assistants/${p.id}/state`,
  ),
  import: httpPost<ImportAssistantsResult, ImportAssistantsRequest>(
    '/api/assistants/import',
  ),
};
```

### 7.3 Hook rewrites

| File | Change |
| --- | --- |
| `renderer/hooks/assistant/useAssistantList.ts` | Single `ipcBridge.assistants.list.invoke()`; drop merge logic. |
| `renderer/hooks/assistant/useAssistantEditor.ts` | 4 call sites (create/update/delete/toggle) → backend API. Rule md writes keep calling existing `ipcBridge.fs.writeAssistantRule`. |
| `renderer/hooks/agent/usePresetAssistantInfo.ts` | Replace `ConfigStorage.get('assistants')`; leave `acp.customAgents` alone. |
| `renderer/pages/conversation/hooks/useConversationAgents.ts` | Same. |
| `renderer/pages/guid/hooks/useCustomAgentsLoader.ts` | Replace first arm of `Promise.all`. |
| `renderer/pages/guid/hooks/usePresetAssistantResolver.ts` | Same. |

### 7.4 UI component changes

- `renderer/pages/settings/AgentSettings/PresetManagement.tsx` — 3 call sites.
- `renderer/pages/conversation/components/SkillRuleGenerator.tsx` — 2 call
  sites. Rename internal `customAgents` variable → `assistants` for clarity.

### 7.5 Deletions

| File | Reason |
| --- | --- |
| `src/common/config/presets/assistantPresets.ts` | Built-in list moves to backend `assets/builtin-assistants/assistants.json`. |
| `src/common/utils/presetAssistantResources.ts` | Its merge logic is now in the backend. Delete or reduce to trivial pass-through. |

### 7.6 Main-process changes

- `src/process/utils/initStorage.ts` — add migration hook (see §8).
- `src/process/team/mcp/team/TeamMcpServer.ts` — replace `ASSISTANT_PRESETS`
  import with an at-startup `ipcBridge.assistants.list` fetch + cache.
- `src/process/team/prompts/teamGuideAssistant.ts` — same pattern.

**Init-order consequence.** Today `ASSISTANT_PRESETS` is a synchronous module
constant. Moving to an async fetch means any consumer that currently relies
on "assistants exist at import time" must be restructured. This is part of
`T3a`'s Definition of Done, not deferred: frontend-dev must audit all
`ASSISTANT_PRESETS` import sites and ensure each consumer waits for the
backend `list()` resolution before first use. Specific sites to verify:
`TeamMcpServer` init path, `teamGuideAssistant` prompt builder, any
`presetAssistantResources.ts` callers, and any renderer hooks that read
presets at module load rather than inside `useEffect`.

## 8. Migration Strategy

### 8.1 Path Y — one-shot Electron → backend import

Runs in Electron main process, **after** `BackendLifecycleManager.start()`
reports success:

```ts
async function migrateAssistantsToBackend() {
  const imported = await configFile.get('migration.electronConfigImported');
  if (imported) return;

  const legacy = (await configFile.get('assistants')) || [];
  // Legacy rows are `AcpBackendConfig` shape (see
  // `src/common/types/acpTypes.ts`). The in-memory `_source` flag that the
  // frontend merge code adds at runtime is NOT persisted to the config file,
  // so we must not filter on it here — stored rows never carry it.
  //
  // Classification from stored legacy data:
  //   - Built-in preset row: `id` has the `builtin-` prefix OR matches an
  //     entry in the (frozen) preset id whitelist.
  //   - Extension row: not persisted to `aionui-config.txt` at all (the
  //     frontend merged them at render time only). Nothing to filter.
  //   - User-authored row: everything else.
  const BUILTIN_ID_PREFIX = 'builtin-';
  const PRESET_ID_WHITELIST = new Set([
    // Frozen snapshot of current `assistantPresets.ts` ids at migration time.
    // Keep this list in sync with the final presets.ts content before the
    // file is deleted.
  ]);
  const isLegacyBuiltin = (a) =>
    typeof a.id === 'string' &&
    (a.id.startsWith(BUILTIN_ID_PREFIX) || PRESET_ID_WHITELIST.has(a.id));

  const userAssistants = legacy.filter((a) => !isLegacyBuiltin(a));

  if (userAssistants.length === 0) {
    await configFile.set('migration.electronConfigImported', true);
    return;
  }

  try {
    const result = await ipcBridge.assistants.import.invoke({
      assistants: userAssistants.map(toBackendShape),
    });
    // Import is insert-only on the backend (see backend spec §6.3). Retries
    // are therefore idempotent and never overwrite user edits made after a
    // partial migration.
    if (result.failed === 0) {
      await configFile.set('migration.electronConfigImported', true);
      console.log(`[AionUi] Migrated ${result.imported} assistants to backend`);
    } else {
      console.error(`[AionUi] Assistant migration partial (${result.failed} failed)`);
      // Flag stays false → retry next launch. Because import is insert-only,
      // already-imported rows will be skipped (not clobbered) on retry.
    }
  } catch (error) {
    console.error('[AionUi] Assistant migration failed:', error);
    // Flag stays false → retry next launch.
  }
}
```

`toBackendShape` strips CLI-related fields (`cliCommand`, `defaultCliPath`,
`acpArgs`, `env`, ...), drops `isPreset` (redundant in new type), and fills
`presetAgentType` with `'gemini'` if missing.

**Id collision handling.** A user could have authored an assistant with an id
that accidentally matches a built-in slug (e.g. created `"builtin-foo"` when
no such built-in existed, then a later backend version added one). The
backend's import endpoint rejects colliding ids by default. To avoid silent
data loss, `toBackendShape` detects collisions against the PRESET_ID_WHITELIST
and renames the offender to `custom-migrated-{unix_ms}-{short_hex}` before
submitting. The original id is preserved in a migration note so the user can
see why their assistant's id changed.

### 8.2 Single-source-of-truth invariant

**This spec introduces a hard rule:** once migration completes, the frontend
must not read or write `ConfigStorage.get/set('assistants')`. The legacy
`assistants` field in `aionui-config.txt` is kept as a migration fallback
only — never read during normal operation.

Code review gate: any new `ConfigStorage.get('assistants')` or
`ConfigStorage.set('assistants', ...)` call added after this PR lands must be
rejected.

### 8.3 Failure & rollback

| Scenario | Behavior |
| --- | --- |
| Backend down at migration time | Flag not set; retries next launch. |
| `POST /api/assistants/import` partial success | Flag not set; retries next launch. Imports are insert-only so retries skip already-imported rows without clobbering any post-migration user edits. |
| Backend DB corruption | User resets flag manually; re-migration runs from legacy file. |
| User downgrades to old AionUi | Old AionUi reads `aionui-config.txt` directly; short-term data divergence is accepted (downgrade is an explicit user action, not guaranteed lossless). |

### 8.4 Dev/E2E overrides

- `AIONUI_BUILTIN_ASSISTANTS_PATH=...` — relocate built-in assets dir.
- `AIONUI_SKIP_ELECTRON_MIGRATION=1` — skip the main-process migration hook.
  When set, E2E tests seed fixtures via `POST /api/assistants/import`
  directly. Auth: E2E test harness obtains a JWT via the same `--local`
  bootstrap flow used in existing Skill-Library pilot tests; the import
  endpoint is CSRF-exempt only when the request carries a valid E2E test
  token (same harness pattern as other existing E2E endpoints). The flag
  itself is a frontend-only concept — backend does not need a paired flag.

## 9. Test Strategy

### 9.1 Team split

| Role | Coverage |
| --- | --- |
| backend-dev | Rust unit tests in `aionui-assistant` + HTTP integration in `aionui-app/tests/assistants_e2e.rs` |
| backend-tester | Probe HTTP endpoints + verify DB side effects (no UI) |
| frontend-dev | Vitest on hooks + bridge; inline migration test |
| frontend-tester | Vitest assistantsBridge + migration; `bun run lint --quiet`; `bunx tsc --noEmit` |
| e2e-tester | Playwright against real Electron on the verification branch |
| coordinator | Smoke-link E2E, cross-repo PR coordination |

### 9.2 Frontend test matrix

| File | Scope |
| --- | --- |
| `tests/unit/assistantsBridge.test.ts` (new) | 5 bridge methods HTTP-mocked |
| `tests/unit/assistantHooks.dom.test.ts` (update) | `useAssistantList`, `useAssistantEditor` against the new bridge |
| `tests/unit/assistantUtils.test.ts` (prune) | Remove `isExtensionAssistant` / `getAssistantSource` tests; keep `isEmoji` |
| `tests/unit/initStorage.migrate.test.ts` (new) | Migration hook; flag set/not-set; idempotency |

Gates: `bun run test --run` green; `bunx tsc --noEmit` clean;
`bun run lint --quiet` no new warnings.

### 9.3 E2E scenarios (`tests/e2e/features/assistants/`)

Nine scenarios (first-launch empty, create/edit/delete user, reject edits on
built-in/extension, toggle built-in `enabled`, migration success, migration
retry, ChatLayout integration). See §6 of the backend spec for the detailed
list.

### 9.4 Regression suites to re-run

- Skill-Library pilot E2E — rule-md dispatch implementation changed.
- Assistant-verification pilot (`modules/assistant.md`) — 7 endpoints whose
  behavior must be preserved.
- Conversation creation flows — `useConversationAgents` /
  `usePresetAssistantInfo` touched.
- Guid page — `useCustomAgentsLoader` / `usePresetAssistantResolver` touched.

## 10. Team Execution Plan

Team mode (coordinator + teammates, **not** subagent dispatch). Each
teammate runs on their own branch and communicates via the coordinator.

### 10.1 Branches

| Branch | Repo | Base | Owner |
| --- | --- | --- | --- |
| `feat/backend-migration-coordinator` | AionUi | (reuse from earlier pilots) | coordinator |
| `feat/backend-migration-assistant-user-data` | AionUi | current `feat/backend-migration` tip | frontend-dev + frontend-tester + e2e-tester |
| `feat/assistant-user-data` | aionui-backend | `main` | backend-dev + backend-tester |

### 10.2 Task dependency graph

```
T0 (coordinator setup) →
  T1a (backend-dev: crate scaffolding + migration + shared HTTP contract types)
  T1b (backend-dev: service + routes + tests)  ──┐
  T3a (frontend-dev: TS types + bridge + hooks) ─┤  (parallel with T1b,
  T3b (frontend-dev: main-process migration hook)┤   both only need T1a's
                                                 ┘   contract types)
T1b → T2a (backend-tester: HTTP probe suite)
T3a → T4  (frontend-tester: Vitest + type + lint)
T2a + T4 + T3b → T5 (e2e-tester: Playwright)
T5 → T6 (coordinator closure + merge)
```

**Parallelization rule.** `T3a/T3b` only need the *contract* (types + route
table produced in T1a), not the Rust implementation. They can proceed on
the frontend branch while `T1b` runs on the backend branch. `T2a` and `T4`
test their respective sides independently and run in parallel. Only `T5`
(Playwright) requires both wired.

Critical path: `T0 → T1a → T1b → T2a → T5 → T6` (≈ 5 serial tasks).

### 10.3 Hand-off discipline

Each teammate writes a hand-off document at the end of their task:

- `handoffs/backend-dev-assistant-user-data-2026-XX-XX.md`
- `handoffs/backend-tester-assistant-user-data-2026-XX-XX.md`
- `handoffs/frontend-dev-assistant-user-data-2026-XX-XX.md`
- `handoffs/frontend-tester-assistant-user-data-2026-XX-XX.md`
- `handoffs/e2e-tester-assistant-user-data-2026-XX-XX.md`
- `handoffs/coordinator-assistant-user-data-2026-XX-XX.md`

Each includes: what was done, exact commit SHAs, what the next role needs to
know, open risks.

### 10.4 Definition of Done

- [ ] All 17 frontend files refactored (14 existing + 3 new/renamed as
      listed in §7);
      `grep -rn "ConfigStorage.*'assistants'"` across `src/` (production,
      excluding `__tests__` and `*.test.ts`) returns zero matches.
- [ ] Backend `aionui-assistant` crate merged; `cargo test --workspace` green;
      `cargo clippy -- -D warnings` clean.
- [ ] Backend HTTP suite (`aionui-app/tests/assistants_e2e.rs`) green.
- [ ] Frontend Vitest green; `bunx tsc --noEmit` clean; `bun run lint` clean.
- [ ] E2E nine scenarios green or classified as pre-existing (Class B/C/E).
- [ ] Migration verified end-to-end: seeded legacy file →
      `migration.electronConfigImported=true` after launch; DB contains rows.
- [ ] `src/common/config/presets/assistantPresets.ts` deleted.
- [ ] Backend `assets/builtin-assistants/` populated and shipped with
      `cargo build`.
- [ ] Both spec docs reviewed and linked from module records.

## 11. Open Risks

1. **Backend cold start timing** — migration runs only after backend is ready.
   If `BackendLifecycleManager.waitForHealth` times out, migration is
   deferred. Mitigation: the flag mechanism handles retries; first-launch
   users may see an empty list briefly before retry succeeds.
2. **Main-process `ASSISTANT_PRESETS` consumers** — `TeamMcpServer` and
   `teamGuideAssistant` currently synchronously import the preset list.
   Moving to async fetch may require restructuring their init order. Owner:
   frontend-dev during T3a.
3. **Rule-md dispatch perf** — `/api/skills/assistant-rule/read` now has a
   branch for `source` lookup. Must not measurably slow the hot path.
   Benchmark included in §9.
4. **Avatar URL resolution** — built-in/user avatars served by backend at
   `GET /api/assistants/{id}/avatar` use absolute URLs that depend on the
   backend port (which is dynamic per Electron lifecycle). The frontend's
   existing `resolveAvatarImageSrc` handles absolute URLs natively, but the
   URL must be re-resolved on every backend restart. Mitigation: the
   `ipcBridge.assistants.*` module constructs avatar URLs at request time
   from the current backend port, and UI components derive avatar URLs from
   a fresh `list()` response rather than caching URL strings in React state.
   If the backend restarts under a different port, the next `list()` call
   issues fresh URLs. In practice React re-fetches `list()` on window focus
   and on WebSocket reconnect, so stale URLs do not persist past a single
   interaction.
5. **Built-in asset bundling** — `cargo build` must reliably place
   `assets/builtin-assistants/` next to the binary. Verify on macOS / Linux /
   Windows before the verification pilot closes.
