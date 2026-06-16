# Follow-up: provider `api_key` plaintext-at-rest is AionCore-owned (Rust), not a TS fix

Status: OPEN P0 (tracked, not yet fixed). Owner: AionCore (Rust backend) repo —
NOT this TS desktop repo.

## Why this note exists

The keychain P0 image-gen lane (branch `houston/keychain-p0-imggen`) removed the
one TS-fixable, local-file plaintext leak: a legacy
`tools.imageGenerationModel.api_key` that an older desktop build wrote into the
plaintext config file (`command-eve-config.txt`) and re-materialized on startup.
That value is now wrapped behind the OS keychain (`keychain:v1:` ref via Electron
`safeStorage`) or dropped fail-closed when no keychain backend exists.

That fix does **not** cover the remaining, larger plaintext-at-rest surface: the
**provider** `api_key`. This note records why it was deliberately left untouched
and what must happen next, so the surface is tracked rather than forgotten.

## The surface that remains

`IProvider.api_key` (every configured model provider — OpenAI, Anthropic,
Bedrock secrets, etc.) is **owned and persisted by the Rust AionCore backend**,
not by this TypeScript repo.

Evidence (this repo):

- `packages/desktop/src/common/adapter/ipcBridge.ts` — the provider endpoints
  (`createProvider`, `updateProvider`, `listProviders`) are pure HTTP wrappers to
  `/api/providers`; the TS side never persists the key, it only forwards it.
- `packages/desktop/src/common/types/provider/providerApi.ts` — `CreateProviderRequest`
  / `IProvider` mirror the Rust-side types; the TS layer is a typed transport,
  not the store.
- `packages/desktop/src/common/config/configMigration.ts` (`migrateProviders`)
  — reads any legacy `model.config` and **POSTs** each `api_key` to the backend
  via `ipcBridge.mode.createProvider`; it does not (and must not) keep them.
- The modern image-gen env path —
  `packages/desktop/src/common/config/imageGenerationMcpEnv.ts` (`buildEnv`,
  line ~67: `[IMAGE_GEN_ENV_KEYS.apiKey]: provider.api_key`) and
  `packages/desktop/src/process/utils/runBackendMigrations.ts`
  (`ensureBootstrapMcpServersInDb`) — sources `AIONUI_IMG_API_KEY` from
  `provider.api_key`, i.e. from the Rust-owned record, and writes the resulting
  env into the **backend DB** (`mcpService.updateServer` / `batchImportServers`)
  and mirrors `mcp.config` to the backend via `PUT /api/settings/client`
  (`syncBuiltinMcpConfig`).

## Why this must NOT be "fixed" on the TS side

Encrypting `IProvider.api_key` in the TypeScript layer would **brick every
provider**: the backend would receive and store a `keychain:v1:` ref it cannot
decrypt (the Electron `safeStorage` keychain is process-/OS-scoped to the
desktop renderer/main process, and the ciphertext is not portable to the Rust
process). The backend would then hand that ref — not the real key — to every
upstream model call and to any child process it spawns, including the image-gen
MCP child (`imageGenServer.ts:24` reads `process.env.AIONUI_IMG_API_KEY`).

For the same reason, the local `mcp.config` / backend-mirror env value for the
image-gen child is left **functional plaintext-in-transit** (in memory / backend
DB), and only the *local file* duplicate of the key was removed in this lane.
The backend-DB-at-rest copy and the backend mirror via `PUT /api/settings/client`
are part of the same AionCore-owned surface described here.

## What the correct fix looks like (AionCore / Rust repo)

The provider secret must be moved behind an OS keyring **in the Rust backend**,
where the key is actually persisted and consumed:

1. Use a Rust OS-keyring crate (e.g. `keyring`, which fronts macOS Keychain,
   Windows Credential Manager, and Secret Service / libsecret on Linux) to store
   each provider `api_key` under a stable account key (e.g.
   `command-eve/provider/<provider_id>`).
2. Persist only a **reference** (provider id + keyring account) in the backend
   DB / settings, never the raw key.
3. Decrypt the key **in the Rust process, in memory, at the point of use**
   (upstream model HTTP call, and when composing the spawned MCP child env), so
   the child still receives the real `AIONUI_IMG_API_KEY` at spawn.
4. **Fail closed**, matching the TS keychain seam: if the keyring is
   unavailable, surface a reason code and refuse to write plaintext to the DB —
   do not silently fall back to plaintext at rest.
5. One-time migration: on startup, re-key any existing plaintext provider
   `api_key` rows into the keyring, never logging the value.

This mirrors the TS-side `packages/desktop/src/common/config/keychain.ts`
contract (`keychain:v1:` opaque ref, fail-closed, no plaintext fallback) so the
two layers behave consistently from the user's point of view.

## Scope boundary (what this TS lane already did vs. what remains)

- DONE (this repo, branch `houston/keychain-p0-imggen`): local-file plaintext
  `tools.imageGenerationModel.api_key` and any plaintext
  `AIONUI_IMG_API_KEY` in the locally-persisted `mcp.config` are removed /
  wrapped behind the keychain, fail-closed, with legacy migration.
  See `packages/desktop/src/common/config/imageGenApiKeyAtRest.ts` and
  `packages/desktop/src/process/utils/initStorage.ts`.
- OPEN (AionCore / Rust): provider `api_key` plaintext-at-rest in the backend
  store, plus the backend-DB / `PUT /api/settings/client` mirror of the image
  env. Must be fixed with an OS-keyring in Rust as above. Do **not** attempt on
  the TS side.
