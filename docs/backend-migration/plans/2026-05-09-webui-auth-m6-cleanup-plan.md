# WebUI Auth M6-Cleanup Migration Plan

_Date: 2026-05-09_
_Status: Proposed_
_Repos touched: `AionUi` (desktop + web-host), `aionui-backend` (aionui-auth crate)_

## Prerequisites

**Read [2026-05-07-webui-decouple-electron-design.md](./2026-05-07-webui-decouple-electron-design.md) first.** It defines the M1-M9 decouple that this plan completes. In particular:

- The three WebUI launch paths (Desktop IPC + GUI toggle / `--webui` headless / `aionui-web` CLI) and which `backend: { kind }` each uses — see that doc's "三条 WebUI 启动路径" section (lines 97-119) and change item **E2** (lines 479-502).
- The `AppMetadata` / `BackendBinaryResolver` / `startWebHost` contracts (lines 231-320).
- The **UC-3 auth contract** (lines 369-395): the 5 auth functions `@aionui/web-host` was supposed to expose permanently. This plan **retires that contract** — understand why it existed before deleting it.

Phase 0.5 of this plan exists specifically because E2 was designed correctly but never implemented; the fix is small but the rationale lives in that older doc.

## Goal

Consolidate WebUI admin credentials onto a single source of truth — aionui-backend's SQLite `users` table (managed by the `aionui-auth` crate). Eliminate the split where `webui.config.json` holds the password hash but aionui-backend also has a `users` table that participates in separate flows.

This fixes the `/api/webui/start` 404 along the way, but the real purpose is architectural: finish the M6 decouple that ripped WebUI lifecycle out of Electron but left auth data duplicated.

## Non-goals

- No seamless session upgrade: browser users holding a legacy web-host session cookie will be logged out on upgrade and must log in once with their existing password.
- No changes to backend JWT / CSRF / rate-limit primitives. Reuse as-is.
- No unification of web-host rate limiting with backend rate limiting — web-host's pre-proxy limiter is simply deleted; backend already has its own.

## Architectural Target

```
Browser                                 Electron main                    aionui-backend
├──────────                             ├──────────                      ├──────────
│ POST /api/auth/login       ──proxy──>                                   │ POST /login
│ GET  /api/auth/user        ──proxy──>                                   │ GET  /api/auth/user
│ POST /api/auth/logout      ──proxy──>                                   │ POST /logout
                                                                          │
                                        │ Settings: changePw/changeUser/QR ──HTTP──> /api/webui/*
                                        │ Settings: start/stop/getStatus     IPC (Electron-only)
                                        │   └─ start may call /api/webui/reset-password on first use
                                        │
                                        │ Boot-time migration + CLI        ──HTTP──> /api/auth/internal/*
                                                                                       /api/webui/*
```

Single source of truth: `users` table (row id `system_default_user`). `webui.config.json` survives only to hold the non-sensitive UI preferences (`port`, `allowRemote`, `adminUsername` mirror).

## Startup Ordering & Runtime Coupling

Deleting `packages/web-host/src/auth/` and reverse-proxying `/api/auth/*` to backend introduces **no new startup-order dependencies**. All three WebUI launch paths already sequence backend before static-server today, and that sequencing is independent of whether auth runs locally or proxied.

| Path                      | Sequencing today                                                                                             | Sequencing after cleanup                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Desktop IPC + GUI toggle  | `index.ts:487 backendManager.start()` → user clicks → `startWebHost(useExistingBackend)` → static-server     | same; Phase 0.5 makes the `useExistingBackend` contract explicit |
| `--webui` headless        | `index.ts:487 backendManager.start()` → `startWebHost(useExistingBackend)` (after Phase 0.5) → static-server | same                                                             |
| `aionui-web` CLI (future) | `startBackend()` awaited inside `startWebHost`, then `startStaticServer()`                                   | same                                                             |

Why this is safe:

- The only code path that runs on auth requests is the static-server's route table. Before: intercept `/api/auth/{login,logout,user}` locally. After: let them fall through to the existing `/api/*` reverse-proxy block that was **already** proxying all other `/api/auth/*` (e.g. `/api/auth/status`, `/api/auth/refresh`).
- Static-server is only reachable once the browser loads the page, which is strictly after `startWebHost()` resolves, which is strictly after backend is healthy. No request can race backend startup.
- `web-host/auth/index.ts` password functions (`resetPassword`, `changePassword`, etc.) are only called from Electron main-process code paths, which we're migrating to HTTP against backend in Phases 1/4. Those main-process callers run **after** `backendManager.start()` returns, so they also have a healthy backend available.

Runtime coupling (not an ordering issue, but a new failure mode):

- **Backend crash window**: Today, if backend crashes, `/api/auth/login` still works because static-server handles it locally with bcrypt against `webui.config.json`. After cleanup, login requests return 502 until `BackendLifecycleManager` restarts the backend (typically 1-2s). This is acceptable — backend down means business APIs are also down, so logging in to a broken app is not useful. See Risks table.

## Key Facts Discovered During Planning

1. **`system_default_user` is seeded by migration `001_initial_schema.sql` with empty `password_hash`.** `IUserRepository::has_users()` filters `WHERE password_hash != ''`, so an empty hash counts as "no users" — the needs-setup signal is a first-class state the schema already models.
2. **Backend always runs with `--local`** when spawned by web-host's `BackendLifecycleManager` (`packages/web-host/src/backend-launcher.ts:136`). The new `/api/webui/*` routes are behind `ensure_local_mode`, so they reject anything but Electron / short-lived CLI spawns.
3. **Browser login today does NOT go through backend.** `packages/web-host/src/static-server.ts` intercepts `/api/auth/login` and validates against `webui.config.json` via web-host's own bcrypt. `aionui-auth::POST /login` is effectively dead for browser users — reachable only by curl against the backend port. This is the split we're closing.
4. **`/api/auth/*` paths that are NOT intercepted (`/api/auth/refresh`, `/api/auth/status`, etc.) already reverse-proxy to backend** via the fall-through block (`static-server.ts:253`). So deleting the three local handlers is sufficient — they'll reach backend automatically.
5. **`QrTokenStore::generate` was changed to also expose `expires_at_ms`** (used by `/api/webui/generate-qr-token`). This was done during planning to keep the new route's response shape honest.
6. **WebuiModalContent is gated by `isDesktop`** (`SettingsModal/index.tsx:205`). The WebUI tab is never shown in browser mode. So start/stop/getStatus being IPC-only is safe.
7. **Other `webui.getStatus.invoke()` callers (QuickActionButtons, ChannelModalContent) are not gated** but already tolerate failure. After migration they'll see errors in browser mode — same as today's 404 path. Not a new bug; unrelated to this plan.

## Phased Execution

The order matters. Each phase leaves the repo buildable and the app launchable; we don't merge half-phases.

### Phase 0 — Already merged

These landed during planning:

- `aionui-backend/crates/aionui-auth/src/routes.rs` — `/api/webui/{change-password,change-username,reset-password,generate-qr-token}` added as local-only routes.
- `aionui-backend/crates/aionui-auth/src/qr_token.rs` — `generate_with_expiry()`.
- `aionui-backend/crates/aionui-auth/src/password.rs` — `pub fn generate_password(len)`.
- `aionui-backend/crates/aionui-api-types/src/auth.rs` — 5 new request/response types.
- `AionUi/packages/desktop/src/process/utils/webuiConfig.ts` — refactored to expose `startDesktopWebUI / stopDesktopWebUI / getDesktopWebUIStatus`, module-level currentHandle.
- `AionUi/packages/desktop/src/process/bridge/webuiBridge.ts` — slimmed to `webui.start / webui.stop / webui.get-status` + `statusChanged` emit.
- `AionUi/packages/desktop/src/common/adapter/ipcBridge.ts` — webui module re-wired: start/stop/getStatus/statusChanged via IPC; credential ops via HTTP.

### Phase 0.5 — Fix backend double-spawn (pre-existing bug; M6 design item E2)

The 2026-05-07 decouple design explicitly specified that the desktop GUI toggle path should pass `useExistingBackend` (design doc lines 113, 328-330, 482-495). This was **never implemented**: `packages/desktop/src/process/utils/webuiConfig.ts:177` and `packages/desktop/src/index.ts:570` both pass `ownBackend`, which spawns a second backend on top of the one already running from `src/index.ts:487`'s `backendManager.start()`.

Actual scenarios today:

| Scenario                    | backend from `index.ts:487` | backend inside `startWebHost`             | Result                                         |
| --------------------------- | --------------------------- | ----------------------------------------- | ---------------------------------------------- |
| Desktop IPC only (no WebUI) | 1                           | —                                         | ✅ 1                                           |
| + Enable WebUI (GUI toggle) | 1                           | 1 (ownBackend)                            | ❌ 2 backends racing on same SQLite            |
| `--webui` headless          | 1                           | 1 (ownBackend)                            | ❌ 2 backends racing on same SQLite            |
| `--resetpass`               | 1                           | — (calls web-host.resetPassword directly) | 1 backend but data written only to config.json |

SQLite under two writers is undefined behavior. This must be fixed before we can claim "SQLite is the single source of truth" in Phase 1+.

**Changes**:

1. `packages/desktop/src/process/utils/webuiConfig.ts` — in `startDesktopWebUI`, pass `{ kind: 'useExistingBackend', port: globalThis.__backendPort }` instead of `ownBackend`. Error if `__backendPort` is undefined (means `backendManager.start()` either hasn't run or failed — `startDesktopWebUI` must not be called in that state).
2. `packages/desktop/src/index.ts:570` (`isWebUIMode` branch) — same switch. Background: the `backendManager.start()` call at line 487 already runs in every mode, including `--webui`, so there's already a backend we should reuse.

Tests:

- Boot Electron desktop, enable WebUI → `lsof -i :{dataPort}` should show only one `aionui-backend` process.
- Boot with `--webui` → same.
- Browser login after enabling WebUI → works through the single backend.

This fix applies regardless of the rest of this M6-cleanup plan; consider landing it as a small standalone commit even if later phases are reshuffled.

### Phase 1 — Migration & first-use password (enables later phases)

Purpose: before we rip out `webui.config.json` reads, make sure existing users' credentials land in SQLite.

#### 1a. `packages/desktop/src/process/utils/ensureAdminUser.ts` (new)

Called from `src/index.ts` after `backendManager.start()` resolves, before windows open.

```
async function ensureAdminUser(): Promise<void> {
  const status = await fetch('http://127.0.0.1:{port}/api/auth/status').then(r => r.json());
  if (!status.needs_setup) return;                         // SQLite has a real user

  const { config } = loadUserWebUIConfig();
  if (!config.passwordHash) return;                        // fresh install, no legacy hash

  await fetch('http://127.0.0.1:{port}/api/auth/internal/users/system/credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: config.adminUsername || 'admin',
      password_hash: config.passwordHash,
    }),
  });
  // Rewrite config.json without passwordHash/passwordUpdatedAt; next boot no-ops.
  saveUserWebUIConfig(stripPasswordFields(config));
}
```

Failure modes:

- Backend unreachable: log, don't exit, retry next boot.
- Already migrated on a different machine: `needs_setup=false` path handles it.
- Partial write (wrote SQLite but crashed before rewriting config.json): next boot calls `set_system_user_credentials` again with the same hash — idempotent at backend side (UPDATE … WHERE id='system_default_user'), then rewrites config.json.

#### 1b. First-use password generation (on "Enable WebUI" click)

Extend `webui.start` IPC handler in `webuiBridge.ts`:

```
ipcBridge.webui.start.provider(async (params) => {
  // Seed admin on first use if SQLite still has empty hash.
  if (await needsSetup()) {
    const { new_password } = await postLocal('/api/webui/reset-password', {});
    initialPasswordForThisHandle = new_password;
  }
  const handle = await startDesktopWebUI(...);
  handle.initialPassword = initialPasswordForThisHandle;
  return handle;
});
```

`getStatus` already returns `initialPassword`; Settings displays plaintext once, then the renderer's `canShowPlainPassword` flag hides it.

#### 1c. Integration test

New spec:

- Case A: fresh install → has_users=false, no config.json → click Enable WebUI → password shown → login works.
- Case B: upgrade path → has_users=false, config.json has hash → boot runs migration → config.json has no hash → browser login with existing password succeeds.
- Case C: re-boot after A → has_users=true → no re-migration; Enable WebUI uses existing password.

### Phase 2 — Switch browser login to backend

After Phase 1, SQLite is guaranteed to hold the password. Now retire the local handlers in web-host.

#### 2a. Delete 3 local handlers in `packages/web-host/src/static-server.ts`

- Lines ~170 (`POST /api/auth/login`): delete the entire block. Request falls through to the `/api/*` reverse proxy at line 253.
- Lines ~221 (`GET /api/auth/user`): delete.
- Lines ~236 (`POST /api/auth/logout`): delete.

Backend already provides all three. The proxy block forwards them verbatim.

#### 2b. Cookie alignment

Backend's `CookieConfig` signs a session cookie (name defined in `aionui-common::constants::COOKIE_MAX_AGE_DAYS` era). web-host's legacy cookie name was `SESSION_COOKIE.NAME` from `auth/session.ts`.

Verify: open backend cookie config, confirm name matches what the frontend login page expects. If mismatched, either:

- Rename backend cookie to match legacy name (one-line change in `CookieConfig`), OR
- Leave backend as is and let frontend pick up the new cookie (users log in once after upgrade — already accepted).

Recommendation: go with option B. Simpler, fewer cross-repo coupling points.

#### 2c. Delete `packages/web-host/src/auth/session.ts` + `rateLimiter.ts`

- `session.ts` is only used by the three handlers being deleted. Drop.
- `rateLimiter.ts` is only used by `/api/auth/login`. Drop. Backend's `auth_rate_limit_middleware` already rate-limits `/login`.

#### 2d. Trim `packages/web-host/src/auth/index.ts`

After Phase 2a the only remaining callers of this file's password functions are:

- `resetPasswordCLI.ts` (handled in Phase 4)
- `startWebHost` itself for first-run password (handled in Phase 3)
- Tests

So in Phase 2 keep this file around but stop re-exporting password functions from `packages/web-host/src/index.ts`. Phases 3 and 4 delete its callers. Phase 5 deletes the file.

### Phase 3 — Simplify `startWebHost`

`packages/web-host/src/index.ts`:

Remove the "first-run password generation" block:

```
  // DELETE:
  const config = await readConfig(opts.app);
  let initialPassword: string | undefined;
  if (!config.passwordHash) {
    const password = await resetAuthPassword({ app: opts.app });
    console.log(`[WebHost] Generated initial password: ${password}`);
    initialPassword = password;
    config.adminUsername = config.adminUsername || 'admin';
  }
```

Also remove `initialPassword` from:

- `WebHostHandle` (`packages/web-host/src/types.ts`)
- return value of `startWebHost`

Rationale: first-run password is now generated in Phase 1b (main process calls `/api/webui/reset-password` on Enable WebUI click). `startWebHost` no longer generates passwords.

Callers of `handle.initialPassword`:

- `packages/desktop/src/index.ts` (`--webui` headless mode): remove the `if (handle.initialPassword) console.log(...)` block. The initial password now lives in SQLite; first launch in headless mode means the operator had to run `--resetpass` first, or Enable WebUI was used in a prior desktop session.
- `packages/desktop/src/process/bridge/webuiBridge.ts`: already handled in Phase 1b — grabs `initialPassword` from reset-password response, not from handle.

### Phase 4 — `resetPasswordCLI` calls backend

`packages/desktop/src/process/utils/resetPasswordCLI.ts`:

```
export async function resetPasswordCLI(username: string): Promise<void> {
  // index.ts:487 already ran backendManager.start() for every mode including
  // --resetpass, so __backendPort is set. Reuse that backend instead of spawning
  // a second one.
  const port = (globalThis as any).__backendPort;
  if (!port) throw new Error('Backend not running');
  const res = await fetch(`http://127.0.0.1:${port}/api/webui/reset-password`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`reset-password failed: ${res.status}`);
  const { data } = await res.json();
  log.success('Password reset successfully.');
  log.highlight(data.new_password);
}
```

Notes:

- `username` arg becomes advisory only. `/api/webui/reset-password` operates on `get_primary_webui_user()`, which resolves to `system_default_user`. If we need per-username reset, that's a new API in aionui-auth; today's CLI didn't really support multi-user either.
- Drop the `@aionui/web-host` `resetPassword` import.
- Drop `writeConfig` side effects — SQLite is the truth now.
- No short-lived backend spawn needed: `index.ts:487` already starts one for every mode.

### Phase 5 — Delete web-host auth package

After Phases 2–4 no file outside of `packages/web-host/src/auth/` should import from `./auth/*` (for password/session concerns).

- Delete `packages/web-host/src/auth/index.ts`
- Delete `packages/web-host/src/auth/session.ts` (already in Phase 2)
- Delete `packages/web-host/src/auth/rateLimiter.ts` (already in Phase 2)
- Move `packages/web-host/src/auth/config.ts` → `packages/web-host/src/config.ts`
  - Rename nothing externally; update imports in `startWebHost` only.
  - Trim `WebUIConfig` type: drop `passwordHash` and `passwordUpdatedAt`. Keep `port`, `allowRemote`, `adminUsername`.
  - `readConfig` should tolerate legacy files (has extra fields) — ignore `passwordHash` on read.
  - `writeConfig` never writes `passwordHash`.
- Update `packages/web-host/src/index.ts` exports:
  - Drop `resetPassword, changePassword, verifyPassword, loadConfig, saveConfig, SESSION_COOKIE, RateLimiter, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS`.
  - Keep only: `startWebHost`, types, `startStaticServer`, `BackendLifecycleManager`, etc.

### Phase 6 — Frontend cleanup (renderer)

#### 6a. `WebuiModalContent.tsx`

Already partially done. Finish:

- Remove all `window.electronAPI?.webui*` branches. Only `webui.*.invoke()` remains.
- Adapt response shapes:
  - `webui.start.invoke()` returns `IBridgeResponse<IWebUIStartResult>` (wrapped). Extract `.data`.
  - `webui.getStatus.invoke()` returns `IWebUIStatus | null` via IPC.
  - `webui.changePassword.invoke()` returns undefined (backend `ApiResponse::message` has no data).
  - `webui.changeUsername.invoke()` returns `{ username }` (httpBridge unwraps `data`).
  - `webui.resetPassword.invoke()` returns `{ new_password }`.
  - `webui.generateQRToken.invoke()` returns `{ token, expires_at_ms }`. QR URL is now composed in the frontend:
    ```
    const baseUrl = status.allowRemote && status.networkUrl ? status.networkUrl : status.localUrl;
    const qrUrl = `${baseUrl}/qr-login?token=${qrData.token}`;
    ```
- `resetLoading` state + `resetPasswordResult.on(...)` subscription: already removed in planning session.
- Wire an actual "Reset Password" button action (today `handleResetPassword` just opens a form — leave as-is unless we want an explicit one-click reset).

#### 6b. Dead code removal

- `packages/desktop/src/preload/main.ts`: delete `webuiResetPassword / webuiGetStatus / webuiChangePassword / webuiChangeUsername / webuiGenerateQRToken` exports from `contextBridge.exposeInMainWorld('electronAPI', {...})`.
- `packages/desktop/src/common/types/electron.ts`: delete `WebUIResetPasswordResult / WebUIGetStatusResult / WebUIChangePasswordResult / WebUIChangeUsernameResult / WebUIGenerateQRTokenResult` types and the `webui*` fields on `ElectronBridgeAPI`.
- `packages/desktop/src/process/bridge/webuiQR.ts`: delete entire file. `generateQRLoginUrlDirect` moved to backend (Phase 0). `verifyQRTokenDirect` was already a TODO-stub (`M6-cleanup` comment in source).
- `packages/desktop/src/process/bridge/services/WebuiService.ts`: delete if only used by `webuiQR.ts` (check before delete).

### Phase 7 — Verification

- `cargo check --workspace` (backend)
- `cargo test -p aionui-auth` (should remain green)
- `bun run test` (AionUi)
- `bunx tsc --noEmit` (AionUi)
- `bun run lint:fix`
- Manual smoke matrix — see next section.

## Manual Smoke Matrix

Must pass before merge. Run each on a clean profile (fresh `userData`).

| #   | Scenario                                                                        | Expected                                                                                                                                   |
| --- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Fresh Electron install → Enable WebUI                                           | Password shown in Settings. Browser login with that password succeeds.                                                                     |
| 2   | Fresh → Enable → Change password in Settings                                    | Browser login with new password succeeds; old password rejected.                                                                           |
| 3   | Fresh → Enable → Change username                                                | Browser login uses new username.                                                                                                           |
| 4   | Fresh → Enable → Generate QR → Scan link                                        | Browser follows `/qr-login?token=...` and authenticates successfully.                                                                      |
| 5   | Fresh → restart Electron                                                        | Enable WebUI again → no new password generated; previous one still valid.                                                                  |
| 6   | Upgrade (pre-populated `webui.config.json` with legacy hash, empty users table) | First boot runs migration silently. Browser login with pre-upgrade password succeeds. `webui.config.json` has no `passwordHash` afterward. |
| 7   | CLI `AionUi --resetpass`                                                        | Logs a new plaintext password. Browser login with it succeeds.                                                                             |
| 8   | `AionUi --webui` headless mode                                                  | Starts, serves static files. Operator reads password from Settings on another launch, or ran --resetpass once.                             |
| 9   | Network tab in browser after login                                              | `/api/auth/login` returns 200 from backend (not web-host). JWT cookie set.                                                                 |

## Risks & Mitigations

| Risk                                                                                                   | Impact                                                                                            | Mitigation                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Migration writes SQLite but crashes before rewriting `config.json`                                     | Next boot retries, calls `set_system_user_credentials` with same hash — idempotent                | Tested in smoke case 6                                                                                                                                                                                                                                             |
| Backend unreachable during migration                                                                   | Users can't log in until backend comes up                                                         | Retry next boot; log warning; do not exit                                                                                                                                                                                                                          |
| QR URL composition wrong in frontend (forgot `allowRemote` branch)                                     | Scan-to-login doesn't work                                                                        | Smoke case 4 catches this                                                                                                                                                                                                                                          |
| Legacy web-host session cookie collides with new backend JWT cookie name                               | Browser unable to log in because old cookie shadows new                                           | Pick cookie name recommendation (B): accept one-time re-login; new cookie overwrites old on successful POST /login                                                                                                                                                 |
| `--webui` headless first boot with no prior desktop session                                            | No admin user, operator has no way in                                                             | Recommend: document that `--resetpass` must be run once before `--webui`; or add a "--bootstrap" flag to generate initial password and print. Defer to follow-up PR                                                                                                |
| `resetPasswordCLI` spawning a short-lived backend races with a running desktop backend (port conflict) | CLI fails to start                                                                                | Phase 4 reuses `index.ts:487`'s backend via `__backendPort` — no second spawn, no race                                                                                                                                                                             |
| Backend crash during auth (today auth is in-process so bcrypt survives)                                | Login returns 502 during the 1-2s `BackendLifecycleManager` restart window                        | Acceptable: backend down ⇒ business APIs down anyway; logging in to a broken app is not useful. Document the new behavior. No code-level mitigation.                                                                                                               |
| Phase 0.5 — `ownBackend` → `useExistingBackend` switch in `webuiConfig.ts:177` and `index.ts:570`      | Callers now strictly require `globalThis.__backendPort` to be set before `startDesktopWebUI` runs | `index.ts:487` already sets `__backendPort` unconditionally for all modes (desktop / --webui / --resetpass) before any caller can reach Phase 0.5 code; add a defensive `throw new Error('Backend not running')` guard in `startDesktopWebUI` / `resetPasswordCLI` |

## Open Questions

1. **Cookie name**: does backend's session cookie name match what the frontend login page expects? Verify before Phase 2 lands.
2. **`--webui` first-boot bootstrap**: today `startWebHost` generated the password. After this plan, headless mode needs either a separate bootstrap flag or documentation. Follow-up.
3. **Per-user reset in CLI**: current `--resetpass <username>` is advisory. If multi-user WebUI is on the roadmap we need a different CLI contract. Not in scope.

## File Touch List

### aionui-backend (already done)

- `crates/aionui-auth/src/routes.rs` (+135)
- `crates/aionui-auth/src/qr_token.rs` (+15)
- `crates/aionui-auth/src/password.rs` (+8)
- `crates/aionui-auth/src/lib.rs` (export)
- `crates/aionui-api-types/src/auth.rs` (+45)
- `crates/aionui-api-types/src/lib.rs` (re-export)

### AionUi (to do, in order)

Phase 1:

- `packages/desktop/src/process/utils/ensureAdminUser.ts` (new)
- `packages/desktop/src/process/utils/webuiConfig.ts` (add `saveUserWebUIConfig`)
- `packages/desktop/src/index.ts` (call `ensureAdminUser()` after `backendManager.start()`)
- `packages/desktop/src/process/bridge/webuiBridge.ts` (`webui.start` handler seeds if `needs_setup`)

Phase 2:

- `packages/web-host/src/static-server.ts` (delete 3 local handlers)

Phase 3:

- `packages/web-host/src/index.ts` (drop first-run password generation)
- `packages/web-host/src/types.ts` (drop `WebHostHandle.initialPassword`)
- `packages/desktop/src/index.ts` (`--webui` branch no longer reads `handle.initialPassword`)

Phase 4:

- `packages/desktop/src/process/utils/resetPasswordCLI.ts` (rewrite to spawn short-lived backend)

Phase 5:

- `packages/web-host/src/auth/index.ts` (delete)
- `packages/web-host/src/auth/session.ts` (delete)
- `packages/web-host/src/auth/rateLimiter.ts` (delete)
- `packages/web-host/src/auth/config.ts` → `packages/web-host/src/config.ts` (move, trim)
- `packages/web-host/src/index.ts` (trim exports)
- `packages/web-host/tests/*` (drop deleted module tests)

Phase 6:

- `packages/desktop/src/renderer/components/settings/SettingsModal/contents/WebuiModalContent.tsx` (finish simplification + QR URL composition)
- `packages/desktop/src/preload/main.ts` (delete 5 electronAPI exports)
- `packages/desktop/src/common/types/electron.ts` (delete 5 types + 5 API fields)
- `packages/desktop/src/process/bridge/webuiQR.ts` (delete)
- `packages/desktop/src/process/bridge/services/WebuiService.ts` (verify then delete)

Phase 7:

- Tests + smoke.

## Merge Strategy

Single PR, 7 commits (one per phase). Phase 0 commits are already on the branch.

Rollback plan: revert the PR. The old `/api/auth/*` interception in web-host and the `webui.config.json` password field both still work today; if anything breaks in production, going back to the pre-PR state restores the working (if split) auth flow.
