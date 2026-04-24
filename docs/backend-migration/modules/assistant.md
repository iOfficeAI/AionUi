# Assistant Module — Backend Migration Verification Log

> **2026-04-24 update** — wire contract renamed to snake_case across the
> assistant surface by the assistant-snake-case-realignment pilot.
> Original endpoint paths unchanged. Request/response **field names**
> changed: `assistantId` → `assistant_id`, `nameI18n` → `name_i18n`,
> `sortOrder` → `sort_order`, `presetAgentType` → `preset_agent_type`,
> etc. The DELETE endpoints' URL-path segment stayed `{id}` agnostic but
> the TypeScript client signature field name was also flipped for
> consistency. See
> [`handoffs/coordinator-assistant-snake-case-2026-04-24.md`](../handoffs/coordinator-assistant-snake-case-2026-04-24.md)
> for full scope + 6 followups.
>
> Sections below describe the 2026-04-23 verification run and still
> reflect the endpoint shape accurately — only field-name casing changed.

Branch: `feat/backend-migration-assistant-verify`
Date: 2026-04-23
Agent: frontend-dev (verification track)

## Scope

Verification only — the 7 Assistant HTTP endpoints were already implemented
during the Skill-Library pilot. This log records what was re-validated.

## Endpoints verified

All 7 endpoints exercised against `~/.cargo/bin/aionui-backend --local`
on port 25811 with an ephemeral data dir at `/tmp/aionui-verify-2/data`
(revised-A.3 run). See the "A.3 — Headless endpoint verification"
section below for the full probe transcript with exact commands.

| #   | Method | Path                                        | Status | Notes                                                                      |
| --- | ------ | ------------------------------------------- | ------ | -------------------------------------------------------------------------- |
| 1   | GET    | `/api/extensions/assistants`                | 200    | Empty fresh DB → `{"success":true,"data":[]}`                              |
| 2   | POST   | `/api/skills/assistant-rule/read`           | 200    | Returns `""` for unknown `assistantId`; returns stored content after write |
| 3   | POST   | `/api/skills/assistant-rule/write`          | 200    | `{"success":true,"data":true}`                                             |
| 4   | DELETE | `/api/skills/assistant-rule/{assistantId}`  | 200    | Path-param carries id; post-delete read returns `""`                       |
| 5   | POST   | `/api/skills/assistant-skill/read`          | 200    | Same shape as rule/read                                                    |
| 6   | POST   | `/api/skills/assistant-skill/write`         | 200    | Same shape as rule/write                                                   |
| 7   | DELETE | `/api/skills/assistant-skill/{assistantId}` | 200    | Path-param carries id; post-delete read returns `""`                       |

Input-validation path exercised: POST `assistant-rule/read` with missing
`assistantId` → HTTP 400 `BAD_REQUEST` with a descriptive error body.

Round-trip sanity: write `"round-trip content"` for `assistantId=rt-1` →
read returns the exact string. Write/read/delete/read cycle on
`del-test` / `del-sk` all pass.

## Frontend wiring (already in place, not newly added)

Renderer calls go through the IPC bridge adapter, which maps to HTTP:

`src/common/adapter/ipcBridge.ts:303-316` —

- `readAssistantRule` → `POST /api/skills/assistant-rule/read`
- `writeAssistantRule` → `POST /api/skills/assistant-rule/write`
- `deleteAssistantRule`→ `DELETE /api/skills/assistant-rule/{assistantId}`
- `readAssistantSkill` → `POST /api/skills/assistant-skill/read`
- `writeAssistantSkill`→ `POST /api/skills/assistant-skill/write`
- `deleteAssistantSkill`→`DELETE /api/skills/assistant-skill/{assistantId}`

Note the DELETE shape: `assistantId` rides the URL path, not the body.
The first probe round using body-carried id failed with 404
`Skill not found: assistant-rule` — this is expected and correct
because the handler routes on the URL segment. Retest via path-param
produced 200 across both rule and skill deletes.

`GET /api/extensions/assistants` is consumed via
`ipcBridge.extensions.getAssistants.invoke()` (callers:
`useAssistantList`, `presetAssistantResources`, etc.).

## Static checks

- `bun run lint` → 0 errors, 1827 warnings (pre-existing; no new warnings
  introduced). 1466 files scanned.
- `bunx tsc --noEmit` → clean (no output, exit 0).

## Unit tests

`bun run test --run` on the assistant-scoped files:

- `tests/unit/assistantHooks.dom.test.ts`
- `tests/unit/assistantUtils.test.ts`
- `tests/unit/assistantPresets.i18n.test.ts`

Initial run: **4 failures / 46 passes** in `assistantHooks.dom.test.ts`.
Root cause: the renderer hooks now consume auto-unwrapped IPC returns
(`detectAndCountExternalSkills.invoke()` and `getAvailableAgents.invoke()`
resolve to the raw array), but the test still supplied the legacy
`{success, data}` envelope. The hook read `externalSources.find` on a
plain object and threw `externalSources.find is not a function`.

Fix: align the 6 mock sites (file-top defaults + 4 `mockResolvedValue`
blocks) to return raw arrays. Commit `af5477360` —
`test(assistant): align hook mocks with auto-unwrapped ipcBridge returns`.

Re-run: **50 passed / 0 failed / 3 files**.

## A.3 — Headless endpoint verification (revised spec)

A.3 was redefined by team-lead (`option 1 approved`) as a pure HTTP-probe
sequence. UI rendering verification is explicitly out of scope for
frontend-dev and is covered by Task B (e2e-tester Playwright suite
against real Electron).

> A.3 UI rendering was covered via Task B (e2e-tester Playwright suite
> against real Electron), not via manual frontend-dev spot-check. This
> matches the Skill-Library pilot pattern documented in
> `docs/backend-migration/handoffs/coordinator-skill-library-2026-04-23.md`
> §Lessons learned.

Backend launch (same pattern as Phase D trace from e2e-tester-2):

```
~/.cargo/bin/aionui-backend --local --port 25811 --data-dir /tmp/aionui-verify-2/data
```

### Probe transcript

All 11 sub-probes returned HTTP 200. No 4xx/5xx encountered — no blocker.

**Probe 1 — list assistants (fresh data-dir)**

```
curl -s http://127.0.0.1:25811/api/extensions/assistants
→ {"success":true,"data":[]}   HTTP 200
```

**Probe 2 — read rule for `builtin-office` on fresh data-dir**

```
curl -s -X POST http://127.0.0.1:25811/api/skills/assistant-rule/read \
  -H 'Content-Type: application/json' \
  -d '{"assistantId":"builtin-office","locale":"en"}'
→ {"success":true,"data":""}   HTTP 200
```

**Probe 3 — write rule for `test-verify`**

```
curl -s -X POST http://127.0.0.1:25811/api/skills/assistant-rule/write \
  -H 'Content-Type: application/json' \
  -d '{"assistantId":"test-verify","content":"# test","locale":"en"}'
→ {"success":true,"data":true}   HTTP 200
```

**Probe 4 — read `test-verify` back (persistence check)**

```
curl -s -X POST http://127.0.0.1:25811/api/skills/assistant-rule/read \
  -H 'Content-Type: application/json' \
  -d '{"assistantId":"test-verify","locale":"en"}'
→ {"success":true,"data":"# test"}   HTTP 200   ✅ content persisted
```

**Probe 5 — delete `test-verify` rule (path-param)**

```
curl -s -X DELETE http://127.0.0.1:25811/api/skills/assistant-rule/test-verify
→ {"success":true,"data":true}   HTTP 200
```

**Probe 5b — verify delete (post-delete read returns empty)**

```
curl -s -X POST http://127.0.0.1:25811/api/skills/assistant-rule/read \
  -H 'Content-Type: application/json' \
  -d '{"assistantId":"test-verify","locale":"en"}'
→ {"success":true,"data":""}   HTTP 200   ✅ delete persisted
```

**Probes 6a–6e — same sequence on `/api/skills/assistant-skill`**

```
6a read fresh     → {"success":true,"data":""}           HTTP 200
6b write '# skill' → {"success":true,"data":true}         HTTP 200
6c read back      → {"success":true,"data":"# skill"}    HTTP 200   ✅
6d DELETE path    → {"success":true,"data":true}         HTTP 200
6e read after del → {"success":true,"data":""}           HTTP 200   ✅
```

### Verification checklist (per revised-A.3 spec)

| Item                                               | Required | Actual               | Result |
| -------------------------------------------------- | -------- | -------------------- | ------ |
| (1) `GET /api/extensions/assistants` → 200 + array | yes      | `data:[]`            | ✅     |
| (2) rule/read fresh → 200, empty string            | yes      | `data:""`            | ✅     |
| (3) rule/write → 200, `{success:true,data:true}`   | yes      | exact match          | ✅     |
| (4) rule/read same id → 200, content matches       | yes      | `data:"# test"`      | ✅     |
| (5) rule DELETE → 200, `{success:true,data:true}`  | yes      | exact match          | ✅     |
| (6) skill/read+write+DELETE pattern                | yes      | all 5 sub-probes 200 | ✅     |

### Earlier-run finding — DELETE URL shape

An earlier exploratory probe sent DELETE with `assistantId` in the JSON
body; the server returned 404 `Skill not found: assistant-rule`. Correct
shape is path-param: `/api/skills/assistant-rule/{assistantId}` (matches
`src/common/adapter/ipcBridge.ts:307-316`). Revised-spec probes 5 and 6d
used the correct shape and both passed.

## Artifacts

- Revised-A.3 probe log: `/tmp/aionui-verify-2/probe-log.txt` (ephemeral).
- Revised-A.3 backend log: `/tmp/aionui-verify-2/backend.log` (ephemeral).
- Exploratory probe (older run): `/tmp/aionui-verify/probe.txt` (ephemeral).
- Backend binary timestamp: same as Skill pilot (Apr 22 23:22).
- Test fix commit: `af5477360`.
- Docs commit: `cf7d29a36`.

## Risks / follow-ups

1. **Stale test mocks elsewhere** — the same `{success, data}` → raw
   auto-unwrap migration likely affects other hook tests that call
   into `ipcBridge.fs.*` or `ipcBridge.acpConversation.*`. Recommend
   grep for `mockResolvedValue({ success: true,` in the test tree.
2. **DELETE URL shape** — the body-carried `assistantId` was a natural
   first guess and returns a confusing 404 message. If any legacy
   caller ever used the body form it would silently fail; a brief audit
   of callers of `deleteAssistantRule` / `deleteAssistantSkill` is
   recommended (none found in the current tree).
3. **List shape** — `GET /api/extensions/assistants` returned `data: []`
   on the fresh DB. Exercising with actual preset/extension assistants
   requires a populated data dir; left for the e2e run.

---

## User Data Migration — 2026-04-23

Scope: migrate user-authored assistants from Electron `ConfigStorage.get('assistants')` to backend SQLite. Adds `GET /api/assistants`, CRUD, state, import, avatar endpoints. Establishes single-source-of-truth invariant for the `assistants` key.

**Feature branches (no PRs raised per user instruction):**

| Branch | Repo | Final SHA |
|--------|------|-----------|
| `feat/backend-migration-assistant-user-data` | AionUi | `f3207451e` |
| `feat/assistant-user-data` | aionui-backend | `0a970ee` |

### Endpoints added

| Method | Path | Behavior |
|--------|------|----------|
| GET    | `/api/assistants` | Merged catalog: builtin (embedded) + user (SQLite) + extension |
| POST   | `/api/assistants` | Create user-authored |
| PUT    | `/api/assistants/{id}` | Update user (403 on builtin/extension) |
| DELETE | `/api/assistants/{id}` | Delete user + cascade fs (rule md, skill md, avatar) |
| PATCH  | `/api/assistants/{id}/state` | Upsert `enabled` / `sort_order` / `last_used_at` into `assistant_overrides` |
| POST   | `/api/assistants/import` | **Insert-only** bulk import (Electron migration entry) |
| GET    | `/api/assistants/{id}/avatar` | Serve avatar bytes for builtin + user |

### Endpoints modified (rule-md + skill-md source dispatch)

- `POST /api/skills/assistant-rule/{read,write,delete}` — now dispatches via `AssistantClassifier`; built-in/extension writes return 400; user path unchanged
- `POST /api/skills/assistant-skill/{read,write,delete}` — same dispatch pattern

### Migration flag

`migration.electronConfigImported` in `aionui-config.txt`:
- Defaults `undefined` (legacy userData)
- Set to `true` only when the whole migration (user-row import + disabled-builtin overrides) succeeds
- Insert-only backend import makes retries idempotent
- `AIONUI_SKIP_ELECTRON_MIGRATION=1` bypasses for E2E

### Invariant established

After migration, `grep -rn "ConfigStorage.*'assistants'" src/ --exclude __tests__` must return zero matches. Any future code reintroducing `ConfigStorage.get('assistants')` or `ConfigStorage.set('assistants', ...)` should be rejected in review.

### Built-in assistants

- Shipped with backend binary via `include_dir` crate (700KB source → +2.8MB binary size)
- Location at compile time: `aionui-backend/crates/aionui-app/assets/builtin-assistants/`
- 20 built-ins ship with this pilot (see `preset-id-whitelist.json`)
- Editing a built-in = edit the md file in source + rebuild backend. No DB seed, no version migration.

### Tests

| Suite | Count | Location |
|-------|-------|----------|
| Rust inline unit (aionui-assistant) | 33 | `crates/aionui-assistant/src/**/*.rs` |
| Rust HTTP integration | 44 | `crates/aionui-app/tests/assistants_e2e.rs` |
| Rust dispatch (aionui-extension) | 10 | `crates/aionui-extension/tests/assistant_dispatch_test.rs` |
| Frontend Vitest (new)              | 37 | `tests/unit/assistants*.test.ts` + `tests/unit/migrateAssistants.test.ts` |
| Playwright E2E                     | 10 | `tests/e2e/features/assistants-user-data/` |

### Lessons (brief)

Full accounts in `docs/backend-migration/notes/team-operations-playbook.md`. Highlights:

- Migration plans must include a real-user-data dry-run task before E2E — plan fixtures missed two user-facing bugs (main-process port resolution H4, disabled-builtin state loss H3).
- When embedded assets replace sibling-file assumptions, packaging-pipeline drift risk goes away entirely. Prefer `include_dir` over "binary + sibling assets/" for product data.
- Name collisions between new concept and legacy concept (here `assistants` vs `acp.customAgents`) need an explicit rename pass at contract-boundary touch-up time (H5).
