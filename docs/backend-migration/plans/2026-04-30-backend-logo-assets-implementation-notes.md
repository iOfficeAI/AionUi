# Backend Logo Assets — Implementation Notes

Companion to `2026-04-30-backend-logo-assets-design.md`. Records how the
implementation landed, including the places it deliberately diverged from
the spec. The spec records _what we decided_; this file records _what we
actually shipped_.

- **Spec**: `2026-04-30-backend-logo-assets-design.md`
- **Status**: Implemented on `aionui-backend@main` and
  `AionUi@feat/backend-migration` (uncommitted as of this note).

## Deviations / extensions from the spec

### 1. Scope expanded to provider logos

The spec focused on agent logos. The implementation also migrated
**provider logos** (OpenAI / Anthropic / Bedrock / DeepSeek / … used in
settings platform pickers):

- `modelPlatforms.ts` now builds every `logo` via
  `buildLogoAssetUrl('ai-cloud/…')` / `buildLogoAssetUrl('ai-major/…')`.
- `EditModeModal.tsx`'s duplicated `PROVIDER_CONFIGS` array was deleted
  outright; it now derives provider entries from `MODEL_PLATFORMS`.
  Eliminates a DRY violation that logo imports had been hiding.
- `AgentSetupCard.tsx` lost its local `AGENT_LOGOS` map (11 entries) and
  calls `getAgentLogo(result.backend)` directly.

### 2. `resolveBackendAssetUrl` helper

Introduced in `src/renderer/utils/platform.ts`. The renderer runs from
`file://` inside Electron, so a backend-relative path like
`/api/assets/logos/...` must be prefixed with
`http://127.0.0.1:${backendPort}`. The helper:

- returns absolute URLs / data URIs unchanged,
- in Electron, prepends the backend origin (via `getBaseUrl()`) to any
  path starting with `/`,
- in browser (web UI), leaves `/api/...` paths alone — the same-origin
  proxy handles them.

`resolveExtensionAssetUrl` was collapsed to a thin wrapper around this
helper (both flows had identical needs). Used by `agentLogo.ts`,
`modelPlatforms.ts`, `TeamAgentIdentity.tsx`, `TeamChatEmptyState.tsx`,
and `agentSelectUtils.tsx`.

### 3. Backend path-traversal defense

Not in the spec but present in `aionui-assets/src/service.rs`:
`normalize_logo_path` rejects `..`, absolute roots, and Windows-style
drive prefixes. The route returns **403 Forbidden** on rejection (spec
only mentioned 404). Covered by `get_logo_asset_rejects_traversal` test.

### 4. Dark-mode swap happens on the consumption side too

Spec mentioned the swap lives in `getAgentLogo`. In practice
`resolveAgentLogo` also applies it, so a backend-served `opts.icon` URL
that ends in `opencode-light.svg` gets rewritten to the dark variant
when the renderer is in dark mode. Implemented via a shared
`normalizeLogoUrl` → `applyThemeVariant` helper in `agentLogo.ts`.

### 5. Team icon plumbing

Spec specified the backend field; the frontend plumbing ended up
touching four layers:

- `crates/aionui-api-types/src/team.rs`: `TeamAgentResponse.icon`.
- `crates/aionui-team/src/service.rs`: `TeamSessionService` gained an
  `agent_metadata_repo` dependency and a `build_team_response` /
  `build_agent_response` pair that hydrates `icon` from
  `agent_metadata` keyed on `backend`.
- `src/common/adapter/teamMapper.ts`: `fromBackendAgent` reads
  `r.icon`.
- `src/common/types/teamTypes.ts`: `TeamAgent.icon?: string`.
- Consumers (`TeamAgentIdentity.tsx`, `TeamChatEmptyState.tsx`,
  `TeamChatView.tsx`, `TeamTabs.tsx`, `TeamPage.tsx`) pass `icon`
  through and prefer it over the string-fallback `getAgentLogo(backend)`.

### 6. `AgentOptionLabel` in-line URL detection

`agentSelectUtils.tsx:AgentOptionLabel` has to cope with the `icon`
field carrying three shapes (preset emoji, custom avatar key, or a
backend asset URL). It now branches on a regex — URL-ish strings go
through `resolveBackendAssetUrl`, everything else falls back to the
existing emoji / avatar-map paths.

## Files actually changed

Backend (`aionui-backend@main`):

- New crate: `crates/aionui-assets/` (Cargo.toml, src/{lib,routes,service,state}.rs).
- New migration: `crates/aionui-db/migrations/008_agent_metadata_icon_backfill.sql`.
- Router wiring: `crates/aionui-app/src/lib.rs`, `state_builders.rs`, `Cargo.toml`.
- New E2E: `crates/aionui-app/tests/assets_e2e.rs`.
- Team response: `crates/aionui-api-types/src/team.rs` (`icon` field +
  serde tests).
- Team hydration: `crates/aionui-team/src/{service,session,types}.rs`,
  `src/mcp/server.rs`, related test files.
- DB repo: `crates/aionui-db/src/repository/sqlite_agent_metadata.rs`.

Frontend (`AionUi@feat/backend-migration`):

- `src/renderer/utils/model/agentLogo.ts` — rewritten.
- `src/renderer/utils/model/modelPlatforms.ts` — provider logos migrated.
- `src/renderer/utils/platform.ts` — `resolveBackendAssetUrl` added.
- `src/renderer/components/agent/AgentSetupCard.tsx` — uses
  `getAgentLogo`.
- `src/renderer/pages/settings/components/EditModeModal.tsx` —
  `PROVIDER_CONFIGS` removed, derived from `MODEL_PLATFORMS`.
- `src/renderer/pages/settings/AgentSettings/AgentCard.tsx` — passes
  `icon` through `resolveAgentLogo`.
- `src/renderer/pages/team/components/*` — threaded `icon` through
  identity/empty-state/view/tabs.
- `src/common/types/teamTypes.ts` + `src/common/adapter/teamMapper.ts` —
  `icon?: string` on `TeamAgent`.
- Deleted: `src/renderer/assets/logos/` (40+ files, keeping only
  `brand/app.png`).
- Tests: `tests/unit/agentLogo.test.ts`,
  `tests/unit/EditModeModal.dom.test.tsx`,
  `tests/unit/platform/resolveExtensionAssetUrl.test.ts`,
  `tests/unit/renderer/team/TeamAgentIdentity.dom.test.tsx`.

## What remains

- Verify locally that the full Electron build loads logos end-to-end
  (renderer hits backend port; both `/api/agents` and
  `/api/assets/logos/...` succeed).
- Confirm `bun run test` passes in the renderer workspace.
- Commit & PR per the migration sequence in the spec (each step is still
  a separate commit boundary, even though the code is co-located in the
  working tree).
- Kiro still has `icon = NULL` by design (no asset shipped).
