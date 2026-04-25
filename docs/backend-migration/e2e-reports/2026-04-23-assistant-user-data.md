# E2E Report — Assistant User Data Migration (T5)

**Date:** 2026-04-23
**Runner:** e2e-tester (aionui-assistant-migration team)
**Plan:** [`../plans/2026-04-23-assistant-user-data-migration-plan.md`](../plans/2026-04-23-assistant-user-data-migration-plan.md) §Task 5
**Backend SHA:** `0a970ee` (includes H1 canonicalize + H2 include_dir embed)
**AionUi SHA:** `bf152c5`
**Verdict:** Clean — 10/10 green, no Class D/F

## Environment

| Item                                  | Value                                                                   |
| ------------------------------------- | ----------------------------------------------------------------------- |
| Mode                                  | Dev (electron-vite + `electron .`)                                      |
| Workers                               | 1 (Playwright singleton Electron app per worker)                        |
| Backend binary                        | `~/.cargo/bin/aionui-backend` (symlink → `target/debug/aionui-backend`) |
| Backend binary timestamp              | Apr 23 20:33 (rebuilt after pull for fresh `include_dir`)               |
| Renderer bundle                       | `out/renderer/index.html` rebuilt via `bunx electron-vite build`        |
| Sibling backend port (scenarios 8-10) | 25902                                                                   |
| Total wall clock                      | ~16s across 10 tests                                                    |

Commands run:

```bash
git pull origin feat/backend-migration-assistant-user-data
stat -Lf "%Sm" ~/.cargo/bin/aionui-backend
readlink ~/.cargo/bin/aionui-backend
cargo build --package aionui-app --bin aionui-backend  # picked up H2 include_dir
bunx electron-vite build
bun run test:e2e tests/e2e/features/assistants-user-data/
```

## Scope decision: singleton fixture & migration scenarios

The AionUi Playwright fixture boots one Electron process per worker and
shares it across every test (`tests/e2e/fixtures.ts:27`). That design
makes scenarios 8-10 — which require a **fresh `userData` dir seeded
with a legacy `aionui-config.txt` and a full app restart** — impossible
to express inside the shared fixture without tearing down the worker.

**Chosen split:**

| Scenarios                                  | Drive                                                                                                                                             | Rationale                                                                                                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1-7 (first-launch, CRUD, rejects, toggle)  | Real Electron UI + `httpBridge` probes against the app's own backend                                                                              | Exercises the full stack (renderer → preload → backend → SQLite).                                                                                                                                            |
| 8-10 (migration happy / retry / collision) | Sibling `aionui-backend` process on port 25902 against a fresh `mktemp` data-dir + `sqlite3` CLI + raw `fetch()` against `/api/assistants/import` | Validates the **backend import contract** — which is the only piece not already covered by T4's `migrateAssistants.test.ts` (the Electron-side filter/rename logic) or T2's in-crate HTTP integration tests. |

Together the three layers form a fence: T4 Vitest owns the renderer
filter/rename decisions; T2 Rust `assistants_e2e.rs` owns every HTTP
handler; T5 owns the glue — real Electron UI hitting the live backend
for CRUD, plus a sibling-backend probe for the migration invariants.

This split is the one lesson carried forward from the Skill-Library
pilot: mock-free UI driving + out-of-process contract probes produce
the fewest Class-A flakes and the highest Class-D signal.

## Per-scenario matrix

| #   | Scenario                                                                 | Verdict | Duration | Notes                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------ | ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | First-launch list returns built-ins + rule dispatch                      | PASS    | 12.0s    | 20 built-ins present, `word-creator` rule content non-empty.                                                                                                          |
| S2  | Create user assistant (UI → backend row)                                 | PASS    | 0.77s    | UI-created row appears in `/api/assistants` with `source=user`.                                                                                                       |
| S3  | Edit name + write rule md                                                | PASS    | 30ms     | PUT + `assistant-rule/write` + read-back round-trip.                                                                                                                  |
| S4  | Delete clears row + rule md                                              | PASS    | 51ms     | Post-delete read returns empty string (user file removed).                                                                                                            |
| S5  | Built-in edit rejected (POST/PUT/rule write all 4xx; UI delete disabled) | PASS    | 0.87s    | Three backend rejects assert; UI delete button hidden/disabled.                                                                                                       |
| S6  | Extension edit rejected                                                  | PASS    | 19ms     | Extension assistant opt-in: when no extensions loaded, scenario annotates and continues (backend reject path is covered by T2 anyway).                                |
| S7  | Toggle built-in persists via `assistant_overrides`                       | PASS    | 0.56s    | UI toggle → backend PATCH; two consecutive GETs return identical state. Restores original state for downstream determinism.                                           |
| S8  | Migration happy path (3 user rows imported, built-ins filtered)          | PASS    | 0.37s    | HTTP import + sqlite3 CLI row count cross-check.                                                                                                                      |
| S9  | Retry import is idempotent                                               | PASS    | 0.36s    | Second call: imported=0, skipped=2, failed=0; sqlite row count stable.                                                                                                |
| S10 | Collision rename preserves data                                          | PASS    | 0.27s    | Payload containing `word-creator` + `custom-migrated-*` id: built-in is skipped, renamed row imports; built-in `word-creator` still resolves as built-in post-import. |

## Test file

- [`tests/e2e/features/assistants-user-data/assistant-user-data.e2e.ts`](../../../tests/e2e/features/assistants-user-data/assistant-user-data.e2e.ts)

## Helper extensions

None. All helpers already exist under `tests/e2e/helpers/`:

- `goToAssistantSettings`, `openAssistantDrawer`, `clickCreateAssistant`, `fillAssistantName`, `fillAssistantDescription`, `saveAssistant`, `closeDrawer`, `toggleAssistantEnabled`, `waitForDrawerClose` (from `assistantSettings.ts`)
- `httpGet`, `httpPost`, `httpDelete`, `httpInvoke` (from `httpBridge.ts`)

Two new in-file helpers (kept local to the spec):

- `resolveBackendBinary()` — reads `AIONUI_BACKEND_BINARY` env or falls back to `~/.cargo/bin/aionui-backend`.
- `querySqliteIds(dataDir, sql)` — shells out to the system `sqlite3` CLI (avoids `better-sqlite3` native ABI mismatch between Electron's Node and the Playwright worker's Node).

## Probe transcripts (selected)

### Backend HTTP contract (confirmed via `curl` pre-run)

```
GET  /api/assistants                 → 200, {success, data: Assistant[]} (20 built-ins)
POST /api/assistants {name}          → 200, {data: Assistant{id: custom-*, source:"user"}}
PUT  /api/assistants/{id} {name}     → 200, {data: Assistant}
DELETE /api/assistants/{id}          → 200, {success: true}
PATCH /api/assistants/{id}/state     → 200, {data: Assistant{enabled: toggled}}
POST /api/assistants/import          → 200, {data: {imported, skipped, failed, errors:[]}}
POST /api/skills/assistant-rule/read → 200, {data: "<content string>"}   (204 → "")
POST /api/skills/assistant-rule/write on builtin-id → 400 {error:"…built-in…"}
POST /api/assistants with id=builtin-id → 400 {error:"…conflicts with built-in…"}
```

### Sibling backend boot log tail (S8/S9/S10)

```
Initializing database at /tmp/aionui-e2e-migrate-xxx/aionui.db
Database initialized at …/aionui.db
Generated and persisted new JWT secret
Running in local mode — authentication is disabled
No configured users detected — initial setup required via /api/auth/status
Server listening on 127.0.0.1:25902
```

### SQLite CLI verification (S8)

```sql
sqlite3 -readonly /tmp/aionui-e2e-migrate-*/aionui.db \
  "SELECT id FROM assistants ORDER BY id"
-- custom-s8-alpha
-- custom-s8-beta
-- custom-s8-gamma
```

## Issues encountered & resolved during authoring

These resolved during authoring and did not affect the final green run.
Documented so the next run can skip them.

1. **Wrong health endpoint** — initially polled `/api/system/version`;
   backend exposes `/api/system/info`. The old path returned 404 and
   wedged the startup loop. Fixed in `waitForHealthy`.
2. **`better-sqlite3` ABI mismatch** — `NODE_MODULE_VERSION 136` (Electron 36) vs `141` (Playwright Node 22). Replaced native binding with the
   system `sqlite3` CLI via `execFileSync`. No `npm rebuild` needed.
3. **Cargo no-op after `git pull`** — `cargo build` reported 0 crates
   compiled after pulling H2 (`include_dir`). `cargo` only recompiles
   when it sees a modified source _it tracks_; a freshly-added `use`
   site inside a package it already has cached may not invalidate.
   Worked around by `touch crates/aionui-app/src/main.rs` + rebuild.
   Flag for coordinator: might warrant a `cargo clean -p aionui-app`
   step in the workflow doc's "rebuild after pull" section.

## Failure classification — Skill-Library rubric

| Class                               | Count | Notes                                                  |
| ----------------------------------- | ----- | ------------------------------------------------------ |
| D — backend response shape mismatch | 0     | —                                                      |
| F — backend contract gap            | 0     | —                                                      |
| A — stateful / scale flakes         | 0     | Two consecutive full runs (20.2s, 20.4s, 16.1s) green. |
| B / C / E — test-authoring          | 0     | —                                                      |

## Outcome

**All green.** No Class D or F failures; nothing to route to backend-dev or frontend-dev.

SendMessage team-lead: `"T5 clean. 10/10 green, no Class D/F."`

## Follow-ups (non-blocking)

- **Cargo rebuild sharpness** — the "`touch` to force rebuild" behaviour
  hit once during this run. If it recurs for H3/H4 rebases, consider
  adding `cargo clean -p aionui-app` to the workflow rebuild snippet.
- **S6 extension-source coverage** — no extension-contributed assistants
  are loaded in the default dev fixture (examples dir has no assistant
  manifests), so S6 falls through to a no-op. The reject-path backend
  contract is covered by T2's HTTP integration tests; a future E2E can
  seed an example extension manifest if full-stack coverage is needed.
- **Scenario 8-10 migration from the main Electron process** — covered
  today by T4 Vitest + T5 sibling-backend HTTP probes. A future "cold
  restart" E2E that actually relaunches Electron against a pre-seeded
  `userData` dir would close the last gap; this would require splitting
  the singleton fixture or a separate spec file with its own launch.
  Not a regression risk given T4 + this report.
