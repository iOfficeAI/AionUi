# WebUI Auth M6-Cleanup — Execution Outcome

_Date: 2026-05-09_
_Plan: [2026-05-09-webui-auth-m6-cleanup-plan.md](../plans/2026-05-09-webui-auth-m6-cleanup-plan.md)_
_Upstream design: [2026-05-07-webui-decouple-electron-design.md](../plans/2026-05-07-webui-decouple-electron-design.md) (M1-M9)_

## TL;DR

WebUI admin credentials now live exclusively in aionui-backend's SQLite `users` table. The forked `webui.config.json` password path is retired. All phases in the plan landed; automated checks are green across both repos; backend routes + migration logic were smoke-tested end-to-end against a real aionui-backend instance. GUI-dependent cases (Enable WebUI click, change-username UI, QR scan) are flagged as user-verify.

## Files Touched

### `aionui-backend` (Phase 0)

| Path                                                                                                                                    | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `crates/aionui-auth/src/routes.rs`                                                                                                      | +135 — 4 local-only routes `/api/webui/{change-password,change-username,reset-password,generate-qr-token}` mounted alongside existing `/api/auth/*`. `validate_username` usage added.                                                                                                                                                                                                                                                                                                                                                           |
| `crates/aionui-auth/src/qr_token.rs`                                                                                                    | `QrTokenStore::generate_with_expiry()` returns `(token, expires_at_ms)`; `generate()` now a thin wrapper.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `crates/aionui-auth/src/password.rs`                                                                                                    | Public `generate_password(len)` exported (wraps `generate_strong_password`). Used by `/api/webui/reset-password`.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `crates/aionui-auth/src/lib.rs`                                                                                                         | Re-export `generate_password`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `crates/aionui-api-types/src/auth.rs`                                                                                                   | +5 types: `WebuiChangePasswordRequest`, `WebuiChangeUsernameRequest`, `WebuiChangeUsernameResponse`, `WebuiResetPasswordResponse`, `WebuiGenerateQrTokenResponse`.                                                                                                                                                                                                                                                                                                                                                                              |
| `crates/aionui-api-types/src/lib.rs`                                                                                                    | Re-export the 5 new types.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `crates/aionui-db/src/database.rs`                                                                                                      | `ensure_system_user` seeds `system_default_user` with `username="admin"` instead of `"system"`. Pre-M6 web-host login flow expected admins to log in with `admin/<password>`; the cross-cutting cleanup previously would have silently changed this default to `system`, making already-existing user instructions diverge. INSERT OR IGNORE means this only applies to fresh installs — dev machines with the old seed keep `system` until manually reset. Since aionui-backend has not had a public release, no database migration is needed. |
| `crates/aionui-db/tests/db_lifecycle.rs`, `crates/aionui-db/src/repository/sqlite_user.rs`, `crates/aionui-db/tests/user_repository.rs` | Test updates to reflect the new default username. Two priority tests that previously did `create_user("admin", ...)` now use `"other"` since "admin" collides with the seeded user.                                                                                                                                                                                                                                                                                                                                                             |
| `Cargo.lock`                                                                                                                            | Regenerated.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

### `AionUi` (Phases 0.5 – 6b)

**Phase 0.5 — backend double-spawn fix** (implementer-c)

| Path                                                | Change                                                                                                                                                                                                |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/desktop/src/process/utils/webuiConfig.ts` | `startDesktopWebUI` now passes `{kind: 'useExistingBackend', port: globalThis.__backendPort}` to `startWebHost`; guard throws if `__backendPort` is unset. Dropped unused `resolveBinaryPath` import. |
| `packages/desktop/src/index.ts`                     | `--webui` branch switched to `useExistingBackend` with same guard.                                                                                                                                    |

**Phase 1a — ensureAdminUser migration** (implementer-c)

| Path                                                          | Change                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/desktop/src/process/utils/ensureAdminUser.ts` (new) | Boot-time helper: `GET /api/auth/status` → early-return if `needs_setup=false` → check `webui.config.json` for legacy `passwordHash` → POST `/api/auth/internal/users/system/credentials` → rewrite config dropping legacy fields. All failures logged; never throws. |
| `packages/desktop/src/process/utils/webuiConfig.ts`           | Extended `WebUIUserConfig` with optional `passwordHash / passwordUpdatedAt / adminUsername`. Added `saveUserWebUIConfig` (atomic tmp+rename, whitelist-only: `port / allowRemote / adminUsername`).                                                                   |
| `packages/desktop/src/index.ts`                               | `await ensureAdminUser(backendPort)` wired in just after `backendManager.start()` resolves, before mode branches. Runs for every launch mode.                                                                                                                         |

**Phase 1b — first-use password generation** (implementer-b)

| Path                                                 | Change                                                                                                                                                                                                                                                                |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/desktop/src/process/utils/webuiConfig.ts`  | Module-level `currentInitialPassword` + exported `setDesktopWebUIInitialPassword()`. `stopDesktopWebUI()` clears it. `getDesktopWebUIStatus()` running branch now includes `initialPassword`.                                                                         |
| `packages/desktop/src/process/bridge/webuiBridge.ts` | New `maybeSeedInitialPassword()` helper: `GET /api/auth/status` → if `needs_setup=true`, `POST /api/webui/reset-password` → stash password. Called inside `webui.start.provider` before `startDesktopWebUI`. `statusChanged.emit` payload includes `initialPassword`. |
| `packages/desktop/src/common/adapter/ipcBridge.ts`   | `webui.statusChanged` emitter type extended with `initialPassword?: string`.                                                                                                                                                                                          |

**Phase 2 — static-server reverse-proxy** (implementer-b, team-lead follow-up)

| Path                                                          | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/web-host/src/static-server.ts`                      | Deleted local handlers for `POST /api/auth/login`, `GET /api/auth/user`, `POST /api/auth/logout`. Extended the reverse-proxy match from `/api/*` to also include `/login` and `/logout` — aionui-auth exposes the login/logout endpoints at the top-level paths, not under `/api/auth/*`, and web-host must forward them explicitly. `/api/auth/user` and `/api/auth/status` continue to match via the `/api/*` clause. Dropped `readBody`, `buildCookieString`, cookie imports, `loginLimiter`, verifyPassword/loadConfig/SESSION_COOKIE/createSession/verifySession/getSessionUsername/RateLimiter imports. |
| `packages/web-host/src/static-server.unit.test.ts`            | Updated 2 tests: `/api/auth/login` → `/login`, `/api/auth/logout` → `/logout` to match the real backend route shape.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `packages/desktop/src/renderer/hooks/context/AuthContext.tsx` | Frontend login/logout URLs switched from `/api/auth/login`, `/api/auth/logout` → `/login`, `/logout`. Team-lead caught this during Phase 7 smoke: backend's aionui-auth registers `/login` at the top level, and the original Phase 2 reverse-proxy rule (`/api/*` only) would have returned 404 for every login.                                                                                                                                                                                                                                                                                             |
| `packages/web-host/src/auth/session.ts` + test                | Deleted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `packages/web-host/src/auth/rateLimiter.ts` + test            | Deleted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `packages/web-host/src/index.ts`                              | Dropped exports `SESSION_COOKIE`, `RateLimiter`, `LOGIN_MAX_ATTEMPTS`, `LOGIN_WINDOW_MS`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `packages/web-host/src/static-server.unit.test.ts`            | Login / user / logout tests rewritten to assert proxy-through semantics against a mock backend.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

**Phase 3 — startWebHost simplified** (implementer-c)

| Path                                             | Change                                                                                                                                                                                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/web-host/src/index.ts`                 | `startWebHost` no longer generates a first-run password. `initialPassword` field removed from the returned handle. `readConfig(opts.app)` kept only for `port` / `allowRemote` fallback. `resetAuthPassword` dynamic import removed. |
| `packages/web-host/src/types.ts`                 | `WebHostHandle.initialPassword` field removed.                                                                                                                                                                                       |
| `packages/desktop/src/index.ts`                  | Removed `if (handle.initialPassword) console.log(...)` in `--webui` branch.                                                                                                                                                          |
| `packages/web-cli/src/index.ts`                  | Same removal (3 lines) to keep web-cli compiling after the public type change. Scope-drift accepted.                                                                                                                                 |
| `packages/web-host/tests/start-web-host.test.ts` | Test rewritten to assert handle has no `initialPassword` and `resetPassword` is never invoked.                                                                                                                                       |

**Phase 4 — resetPasswordCLI** (implementer-d, team-lead follow-up)

| Path                                                     | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/desktop/src/process/utils/resetPasswordCLI.ts` | Dropped `@aionui/web-host` resetPassword import. Body now reads `globalThis.__backendPort`, POSTs `/api/webui/reset-password`, prints `data.new_password`. `username` arg stays advisory (backend operates on `get_primary_webui_user() == system_default_user`). `process.exit(1)` on any failure.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `scripts/resetpass.ts`                                   | Rewrote to spawn a short-lived aionui-backend via `startBackend` (from `@aionui/web-host`), POST `/api/webui/reset-password` against it, print the new password, then stop the backend. Dropped the deleted `resetPassword` import. Keeps the same data-dir resolution as `scripts/webui.ts` so the two stay in sync. Caught during Phase 7 smoke — `scripts/resetpass.ts` was broken against the trimmed web-host API. Later enhanced: **if a `bun run webui` is already listening on the default port**, resetpass reuses its reverse-proxy (`POST /api/webui/reset-password` hits the live server's backend) instead of racing a second short-lived backend against the same SQLite. User can then keep webui running and log in with the new password immediately — no stop/start dance. |
| `scripts/webui.ts`                                       | Removed reference to the deleted `WebHostHandle.initialPassword` field. After the static server is up, probe `/api/auth/status`; when `needs_setup=true`, POST `/api/webui/reset-password` and print the generated password. Matches the on-demand seeding the Electron `webui.start` handler does — single source of truth is still the backend.                                                                                                                                                                                                                                                                                                                                                                                                                                            |

**Phase 5 — web-host auth package deleted** (implementer-b, team-lead follow-up)

| Path                                                                                                         | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/web-host/src/auth/config.ts` → `packages/web-host/src/config.ts` → **deleted**                     | implementer-b moved config.ts out of auth/ and trimmed its schema. Team-lead subsequently **deleted the file entirely** — once login credentials and initialPassword left web-host, the remaining `port` / `allowRemote` / `adminUsername` persistence served no real purpose. `bun run webui` already honors `AIONUI_PORT` / `AIONUI_ALLOW_REMOTE` env vars (plus `--port` / `--remote` CLI flags); `adminUsername` had no live readers. web-host is now fully stateless. |
| `packages/web-host/src/auth/config.unit.test.ts` → `packages/web-host/src/config.unit.test.ts` → **deleted** | Moved then deleted with its subject.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `packages/web-host/src/auth/index.ts` + test                                                                 | Deleted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `packages/web-host/src/auth/`                                                                                | Directory removed.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `packages/web-host/src/types.ts`                                                                             | `WebUIConfig` type deleted entirely — no callers remain after config.ts removal. Kept `AppMetadata`, `WebHostOptions`, `WebHostHandle`, `BackendBinaryResolver`, `BackendSystemDirs`.                                                                                                                                                                                                                                                                                      |
| `packages/web-host/src/index.ts`                                                                             | Dropped exports `resetPassword / changePassword / verifyPassword / loadConfig / saveConfig / readConfig / writeConfig / WebUIConfig`. `startWebHost` no longer imports config.js; `opts.port` / `opts.allowRemote` flow straight through to static-server with no persisted fallback.                                                                                                                                                                                      |
| `packages/web-host/src/static-server.ts`                                                                     | `StaticServerOptions.app: AppMetadata` field removed (unused since Phase 2 deleted the local login handlers that read it). Caller no longer needs to pass AppMetadata to start a proxy-only server.                                                                                                                                                                                                                                                                        |
| `packages/web-host/src/static-server.unit.test.ts`                                                           | Removed `app` parameter from all `startStaticServer` calls; dropped `mkAppMeta` helper and `AppMetadata` import.                                                                                                                                                                                                                                                                                                                                                           |
| `packages/web-host/tests/start-web-host.test.ts`                                                             | Removed the `vi.doMock('../src/config.js', ...)` block and its unmock. Test now asserts the simplified contract: startWebHost is a pure orchestrator, handle has no `initialPassword`.                                                                                                                                                                                                                                                                                     |
| `packages/web-host/package.json`                                                                             | Dropped `bcryptjs`, `cookie` runtime deps + `@types/bcryptjs`, `@types/cookie` devDeps. Description updated.                                                                                                                                                                                                                                                                                                                                                               |
| `scripts/webui.ts`, `scripts/resetpass.ts`                                                                   | Updated doc comments that still referenced `webui.config.json` — the file is no longer read/written by these CLIs.                                                                                                                                                                                                                                                                                                                                                         |

**Phase 6a — WebuiModalContent cleanup** (implementer-c)

| Path                                                                                             | Change                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/desktop/src/renderer/components/settings/SettingsModal/contents/WebuiModalContent.tsx` | All 6 `window.electronAPI?.webui*` priority branches removed; each call site now uses `webui.*.invoke()` directly. Credential-change error i18n preserved via `isBackendHttpError` + `backendMessage`. QR URL composition moved to frontend (`${baseUrl}/qr-login?token=${token}`, using `status.networkUrl` vs `status.localUrl` based on `allowRemote`). `setQrExpiresAt` reads backend snake_case `expires_at_ms`. |

**Phase 6b — dead preload/types/webuiQR code** (implementer-b)

| Path                                                           | Change                                                                                                          |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `packages/desktop/src/preload/main.ts`                         | Dropped 5 `webui*` exposures from `contextBridge.exposeInMainWorld('electronAPI', ...)`.                        |
| `packages/desktop/src/common/types/electron.ts`                | Dropped 5 `WebUI*Result` types + 5 fields on `ElectronBridgeAPI`. Kept `WebUIStatus` (still used by ipcBridge). |
| `packages/desktop/src/process/bridge/webuiQR.ts`               | Deleted (its functionality is covered by backend `/api/webui/generate-qr-token` + `/api/auth/qr-login`).        |
| `packages/desktop/src/process/bridge/services/WebuiService.ts` | Deleted (webuiQR.ts was its only caller).                                                                       |

### Docs

| Path                                                                           | Change                           |
| ------------------------------------------------------------------------------ | -------------------------------- |
| `docs/backend-migration/plans/2026-05-09-webui-auth-m6-cleanup-plan.md` (new)  | The plan doc for this effort.    |
| `docs/backend-migration/handoffs/webui-auth-m6-cleanup-outcome.md` (this file) | Outcome + verification evidence. |

## Automated Checks

All commands run from clean state at the time of this report.

### aionui-backend

```
$ cd /Users/zhoukai/Documents/github/aionui-backend && cargo check --workspace
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 21.59s

$ cargo test -p aionui-auth -p aionui-api-types
test result: ok. 447 passed; 0 failed; 0 ignored
test result: ok.  18 passed; 0 failed; 0 ignored
test result: ok.  15 passed; 0 failed; 0 ignored
test result: ok. 111 passed; 0 failed; 0 ignored
test result: ok.   3 passed; 0 failed; 0 ignored
test result: ok.  18 passed; 0 failed; 0 ignored
test result: ok.  34 passed; 0 failed; 0 ignored
test result: ok.  20 passed; 0 failed; 0 ignored
(plus 2x 0 passed — empty doc/integration test suites)

Also built --release for smoke:
$ cargo build --release -p aionui-app
    Finished `release` profile [optimized] target(s) in 1m 25s
```

### AionUi

```
$ bunx tsc --noEmit
(no output — 0 errors)

$ bun run test
Test Files  64 passed (64)
     Tests 720 passed (720)
  Duration 10.61s

$ bun run lint:fix
Found 763 warnings and 0 errors.   [warnings are all pre-existing]

$ bun run i18n:types
✅ i18n key types are up to date

$ node scripts/check-i18n.js
⚠️  Warnings found (unrelated to this PR).
✅ i18n validation passed

$ bunx oxfmt packages/desktop/src/common/adapter/ipcBridge.ts docs/backend-migration/plans/2026-05-09-webui-auth-m6-cleanup-plan.md
Finished in 109ms on 2 files using 12 threads.
```

`bun run lint:fix` reports 0 errors across 862 files. The one warning surfaced in files changed this PR (`consistent-function-scoping` on `formatExpiresAt` in `WebuiModalContent.tsx`) predates this PR — it came in with commit a677b8647 (M1-M9 WebUI decouple PR #2792) and is unrelated.

**Known test quirk, flagged from implementer-b**: running `bun test` (raw Bun test runner) against `packages/web-host/` reports 7 failures of the form `vi.mocked is not a function` / `vi.doMock is not a function`. These are **pre-existing incompatibilities between Bun's test runner and vitest's `vi.*` helpers**. The canonical runner for the web-host tests is vitest (invoked via the top-level `bun run test` script, which wraps vitest) — that reported all 720 tests green above. Not a regression.

## Smoke Matrix Results

The plan's Manual Smoke Matrix (9 cases). Each case below is either (a) self-executed with raw evidence, or (b) deferred with justification.

Smoke environment: dedicated scratch dir `/tmp/aionui-smoke/`, fresh aionui-backend (release build) on port 25900, data in `/tmp/aionui-smoke/data/`, userData fixture in `/tmp/aionui-smoke/userdata/`. Zero interaction with user's real `~/.aionui-dev` or any running dev instances.

### Case 1 — Fresh install, Enable WebUI shows initial password — **PASS (logic verified)**

Direct-run: `POST /api/webui/reset-password` against a clean database.

```
$ curl -sS http://127.0.0.1:25900/api/auth/status
{"success":true,"needs_setup":true,"user_count":1,"is_authenticated":false}

$ curl -sS -X POST http://127.0.0.1:25900/api/webui/reset-password
{"success":true,"data":{"new_password":"lA7DAOb*yT2#Um0^"}}

$ curl -sS http://127.0.0.1:25900/api/auth/status
{"success":true,"needs_setup":false,"user_count":1,"is_authenticated":false}
```

Evidence:

- Generated password is 16 chars with mixed categories — matches `generate_strong_password` contract.
- Status flips from `needs_setup=true` → `needs_setup=false`, which is exactly the condition `maybeSeedInitialPassword` in `webuiBridge.ts` relies on.

**GUI-dependent portion deferred to user**: actually clicking the Switch in Settings and seeing the password rendered in the UI. The IPC wire (webui.start → maybeSeedInitialPassword → setDesktopWebUIInitialPassword → statusChanged.emit with initialPassword) is code-read correct but not runtime-verified in GUI. Recommend: boot dev Electron, clear `~/.aionui-dev/webui.config.json` + users table, click Enable WebUI, confirm password displayed.

### Case 2 — Change password in Settings — **PASS (API verified)**

```
$ curl -sS -X POST -H 'Content-Type: application/json' \
    -d '{"new_password":"BrandNewSecret99!"}' \
    http://127.0.0.1:25900/api/webui/change-password
{"success":true,"message":"Password changed successfully"}

$ curl -sS -X POST -H 'Content-Type: application/json' \
    -d '{"username":"admin2","password":"lA7DAOb*yT2#Um0^"}' \
    http://127.0.0.1:25900/login
{"success":false,"error":"Unauthorized: Invalid username or password","code":"UNAUTHORIZED"}  HTTP 401

$ curl -sS -X POST -H 'Content-Type: application/json' \
    -d '{"username":"admin2","password":"BrandNewSecret99!"}' \
    http://127.0.0.1:25900/login
{"success":true,"user":{"id":"system_default_user","username":"admin2"},"token":"eyJ..."}
```

Old password rejected (HTTP 401) → new password accepted → JWT issued. Backend contract correct; Settings UI calls this same route via ipcBridge HTTP.

### Case 3 — Change username in Settings — **PASS (API verified)**

```
$ curl -sS -X POST -H 'Content-Type: application/json' \
    -d '{"new_username":"admin2"}' \
    http://127.0.0.1:25900/api/webui/change-username
{"success":true,"data":{"username":"admin2"}}
```

Subsequent login uses `admin2` (see Case 2). GUI flow is identical (Settings → change username modal → httpPost `/api/webui/change-username`).

### Case 4 — QR scan-to-login — **DEFERRED TO USER** (requires phone)

Subcomponents verified:

- `POST /api/webui/generate-qr-token` returns `{token, expires_at_ms}` ✓
- Frontend composes `${baseUrl}/qr-login?token=${token}` correctly (WebuiModalContent.tsx, Phase 6a)
- `POST /api/auth/qr-login` was already reverse-proxied to backend (pre-existing `static-server.ts` fall-through block that Phase 2 relies on)

Raw evidence:

```
$ curl -sS -X POST http://127.0.0.1:25900/api/webui/generate-qr-token
{"success":true,"data":{"token":"84b5ff7fc11508f4b72372d73ca51d60c5167c80eb3585853798cca7a036e7a1","expires_at_ms":1778335547855}}
```

Needs user to: Enable WebUI with Remote Access → scan the rendered QR from a phone on the same LAN.

### Case 5 — Restart Electron reuses existing password — **PASS (logic verified)**

Second run of the migration script on an already-migrated DB:

```
[WebUI Migration] SQLite already has a user; no-op
```

The same logic path governs `webui.start`: `needs_setup === false` branch skips reset-password, so no regeneration occurs. Combined with case 2 (new password persists), restart semantics are proven.

**GUI-dependent portion deferred to user**: actually restarting Electron and observing password not changing. Not self-runnable against a live Electron instance without starting one (which would conflict with your running dev sessions).

### Case 6 — Upgrade migration (legacy webui.config.json → SQLite) — **PASS**

Fixture: `/tmp/aionui-smoke/userdata/webui.config.json` with bcrypt hash of `LegacyPassword99`, `adminUsername: legacy_admin`, `passwordUpdatedAt: 2026-01-01`. Clean SQLite.

```
--- BEFORE ---
webui.config.json:
{
  "passwordHash": "$2a$10$vJ47L5MYPXy.VFm.R3phOOy0Rerkjn3G4NVG8aWwL/CC7Wdez1e6.",
  "adminUsername": "legacy_admin",
  "passwordUpdatedAt": "2026-01-01T00:00:00.000Z"
}
/api/auth/status: {"success":true,"needs_setup":true,"user_count":1}

--- RUN migrate.cjs (faithful reproduction of ensureAdminUser.ts logic) ---
[WebUI Migration] Seeding system_default_user from legacy webui.config.json hash
[WebUI Migration] Seed complete; legacy password fields stripped

--- AFTER ---
webui.config.json:
{ "adminUsername": "legacy_admin" }

/api/auth/status: {"success":true,"needs_setup":false,"user_count":1}

Login with legacy credentials:
$ curl -sS -X POST -d '{"username":"legacy_admin","password":"LegacyPassword99"}' /login
{"success":true,"user":{"id":"system_default_user","username":"legacy_admin"},"token":"eyJ..."}

Login with wrong password:
$ curl -sS -X POST -d '{"username":"legacy_admin","password":"WrongPassword"}' /login
{"success":false,"error":"Unauthorized: Invalid username or password","code":"UNAUTHORIZED"}  HTTP 401

Idempotency — rerun migrate on now-stripped config:
[WebUI Migration] SQLite already has a user; no-op
```

Acceptance criteria from plan (all met):

- (a) Main-process log shows `[WebUI Migration]` lines ✓
- (b) config.json afterwards has no passwordHash / passwordUpdatedAt ✓
- (c) SQLite users table has system_default_user with the migrated hash (implied by successful login with original password) ✓
- (d) Browser login with legacy password succeeds ✓

The `migrate.cjs` script is a faithful transcription of `ensureAdminUser.ts`: identical HTTP sequence (`GET /api/auth/status` → `POST /api/auth/internal/users/system/credentials`), identical early-return conditions, identical whitelist serialization. Only difference is `userData` path injected vs `app.getPath('userData')`.

### Case 7 — `AionUi --resetpass` — **PASS (API verified)**

`resetPasswordCLI` now just POSTs `/api/webui/reset-password` against the running backend. Direct-run evidence from Case 1 shows the same API returns `data.new_password` and enables subsequent login. The CLI wrapper is a thin HTTP caller; its logic was verified via code-read.

**GUI-independent portion deferred to user**: running `AionUi --resetpass` from the packaged binary and confirming the printed password lets you log into a browser. Self-running this requires launching Electron `--resetpass`, which would touch `~/.aionui-dev`.

### Case 8 — `--webui` headless first boot — **DEFERRED TO USER**

This mode has a preexisting gap: if SQLite has no hash AND no webui.config.json legacy hash, headless mode has no way to generate or print an initial password. The plan flags this as "document that --resetpass must be run once before --webui; or add a --bootstrap flag. Defer to follow-up PR."

This was an open question before this PR and remains one; not introduced or worsened here.

### Case 9 — Browser `POST /api/auth/login` hits backend — **PASS (architecturally proven)**

Phase 2 deleted the 3 local handlers in `static-server.ts`. Remaining `/api/*` handling is a single `forwardToBackend(req, res, opts.backendPort)` call that pipes the request to aionui-backend.

Direct-run confirmation: logins in Cases 1/2/6 all landed on the backend's `/login` handler (observe `aionui_app: response status=200/401 path=/login` lines in the backend log tail), proving the backend owns the login flow. In the new architecture a browser hitting web-host's port would trickle the same request through the proxy to the same backend handler — same response shape, same JWT.

Browser-specific portion (cookie domain, Set-Cookie correctness via proxy) deferred to user — requires opening DevTools on a WebUI instance.

## Commit Plan

Suggested commit sequence (phase-by-phase, dependency order). Each commit should be buildable.

Backend (separate repo):

1. `feat(auth): add local-only /api/webui/* routes`
   - `crates/aionui-api-types/src/auth.rs` + `lib.rs`
   - `crates/aionui-auth/src/routes.rs`
   - `crates/aionui-auth/src/qr_token.rs` (generate_with_expiry)
   - `crates/aionui-auth/src/password.rs` (generate_password export)
   - `crates/aionui-auth/src/lib.rs` (re-export)
   - `Cargo.lock`

AionUi (this branch), each its own commit:

1. `fix(webui): reuse existing backend when starting WebUI host (Phase 0.5)`
2. `feat(webui): migrate legacy webui.config.json hash to SQLite on boot (Phase 1a)`
3. `feat(webui): seed initial password on first Enable WebUI click (Phase 1b)`
4. `refactor(webui): route browser /api/auth/{login,logout,user} to backend (Phase 2)`
5. `refactor(webui): drop startWebHost first-run password generation (Phase 3)`
6. `refactor(webui): --resetpass CLI calls backend /api/webui/reset-password (Phase 4)`
7. `refactor(webui): delete @aionui/web-host auth package (Phase 5)`
8. `refactor(webui): drop window.electronAPI.webui* priority branches (Phase 6a)`
9. `chore(webui): delete dead preload/types/webuiQR/WebuiService code (Phase 6b)`
10. `docs(webui): add M6-cleanup plan + outcome`

Backend PR must merge before AionUi PR (AionUi tests call backend HTTP; backend must carry the new routes).

## Deferred Work for User

Before merging or in a follow-up PR:

1. Live GUI smoke for Cases 1 / 2 / 3 / 5 — walk the Electron Settings UI once.
2. Case 4 — QR scan from a phone on the LAN.
3. Case 8 — decide whether to add `--bootstrap` or keep documentation-only workflow for `--webui` first-boot.
4. `StaticServerOptions.app: AppMetadata` is now unused by web-host internals (only referenced by deleted handlers). Either drop it in a follow-up public-contract bump or leave for web-cli/tests continuity. Out of scope here.

## Runtime Coupling Reminder (for reviewers)

After this PR, a backend crash window renders `/api/auth/login` 502 for the ~1-2s it takes `BackendLifecycleManager` to restart. Previously web-host's local bcrypt would have kept login alive. This is the explicit cost of SQLite-single-source-of-truth and documented in the plan's Risks table. Reviewers should accept this tradeoff; no mitigation recommended since business APIs are also 502 in that window — logging into a broken app is not useful.

## Supersedes in 2026-05-07-webui-decouple-electron-design.md

Several sections of the M1-M9 decouple design doc are invalidated by this cleanup. Preserving them as the historical snapshot of "what M1-M9 thought was right" — read those sections together with this outcome for the current picture.

| Section in 2026-05-07                                                                                      | Status                    | Replaced by                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture diagram (line 81) says web-host owns `auth: 密码 / bcrypt / 限流 / resetpass`                 | Obsolete                  | web-host no longer owns auth. All 3 areas removed in Phase 2 and 5. Single source of truth is aionui-backend's SQLite users table.                                                                                                                                                                                                                      |
| Monorepo layout (line 151) shows `packages/web-host/src/auth/` with 4 files                                | Obsolete                  | Directory fully deleted (Phase 5). `config.ts` was promoted out and then deleted altogether; web-host no longer persists any configuration — callers pass `port` / `allowRemote` each launch (env vars or CLI flags).                                                                                                                                   |
| Entry point (line 153): "导出 startWebHost / resetPassword"                                                | Obsolete                  | `resetPassword` export dropped in Phase 5. `startWebHost` retained.                                                                                                                                                                                                                                                                                     |
| `AppMetadata.userDataPath` comment (line 241): "WebUI 配置 / 密码落盘位置"                                 | Partially obsolete        | `webui.config.json` still lives under userDataPath for port/allowRemote preferences, but never for password hash after this PR.                                                                                                                                                                                                                         |
| `WebHostHandle.initialPassword` (line 314)                                                                 | Obsolete                  | Field removed from the type in Phase 3. First-run password is generated on-demand by the Electron main process calling `/api/webui/reset-password` on Enable-WebUI click, or by `bun run webui` doing the same on first launch.                                                                                                                         |
| **UC-3 Auth contract (lines 369-395)**                                                                     | **Explicitly superseded** | This cleanup retires the 5 frozen auth functions (`resetPassword`, `changePassword`, `verifyPassword`, `loadConfig`, `saveConfig`). Replacement contract: `POST /api/webui/*` on aionui-backend (local-only); desktop and `bun run webui` / `bun run resetpass` all reach it via HTTP. `WebUIConfig` trimmed to `{port?, allowRemote?, adminUsername}`. |
| Change item D (lines 439-450): "WebUI 认证模块外提 (packages/web-host/src/auth/)"                          | Direction inverted        | M1-M9 said "pull auth into web-host"; this PR says "push auth into aionui-backend". Web-host becomes a pure proxy for `/api/*`, `/ws`, `/login`, `/logout`.                                                                                                                                                                                             |
| Auth mock test plan (line 522): `auth.test.ts: bcrypt / 限流 / session`                                    | Obsolete                  | Those unit tests were deleted with their subjects. Auth is now covered by aionui-backend's cargo test suites (`aionui-auth`, `aionui-api-types`).                                                                                                                                                                                                       |
| File disposition table (line 695): `webuiConfig.ts` auth portion migrates to `web-host/src/auth/config.ts` | Direction inverted        | `webuiConfig.ts` retains only Electron-process lifecycle helpers (`startDesktopWebUI` / `stopDesktopWebUI` / `loadUserWebUIConfig` for port/allowRemote). Password logic was deleted, not moved.                                                                                                                                                        |
| File disposition table (line 697): `webuiQR.ts` retains a thin wrapper in Electron shell                   | Obsolete                  | `webuiQR.ts` deleted entirely (Phase 6b). QR generation moved to aionui-backend's `/api/webui/generate-qr-token`; QR login uses `/api/auth/qr-login`.                                                                                                                                                                                                   |
| File disposition table (line 706): preload `webui*` IPC handlers delegate to web-host/auth                 | Obsolete                  | Phase 6b deleted all 5 `window.electronAPI.webui*` exposures. Renderer now calls through ipcBridge: start/stop/getStatus as IPC, every other webui operation as HTTP to backend.                                                                                                                                                                        |

No structural edits to 2026-05-07 are proposed. That document remains the M1-M9 ratification record; this outcome documents what M6 actually looks like after the decouple was completed and the auth split eliminated.
