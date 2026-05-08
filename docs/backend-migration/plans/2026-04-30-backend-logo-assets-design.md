# Backend-Served Agent Logo Assets — Design

- **Status**: Draft, awaiting review
- **Author**: zk
- **Date**: 2026-04-30
- **Scope**: Frontend–backend separation for agent/provider/tool logo assets

## Goal

Move every logo asset currently bundled in `AionUi/src/renderer/assets/logos/`
out of the frontend bundle and serve it from `aionui-backend`. The frontend
must no longer own or ship these binary resources.

Only the AionUi product brand asset (`brand/app.png`) stays in the frontend.
Every agent / provider / tool logo — including `brand/aion.svg` (the `aionrs`
agent logo, distinct from the AionUi product brand) — moves to the backend.

## Non-Goals

- Serving user-uploaded images (user avatars, attachments, etc.).
- White-labeling (letting end users replace built-in logos at runtime).
- CDN / object-storage delivery. Assets are embedded in the backend binary.
- Non-logo static resources (illustrations, marketing images).
- Reworking the extension icon path — extensions already carry `icon` via
  their manifest and serve it through `/api/extensions/{name}/assets/{path}`.
- Reworking remote agents — `RemoteAgentResponse.avatar` already exists on
  its own channel and is unaffected.
- Migrating the custom-agent (user-defined CLI) icon story — custom agents
  keep their frontend robot-icon fallback.
- Consuming `agent_metadata.sort_order` on the frontend. Out of scope here.

## Background

### Current state (frontend)

`src/renderer/utils/model/agentLogo.ts` statically imports 22 logo files and
exposes `getAgentLogo(agent)` / `resolveAgentLogo(opts)` / `hasAgentLogo(agent)`.
The renderer bundles these assets at build time. Additional logos under
`src/renderer/assets/logos/{ai-china,ai-cloud,ai-major,brand,tools}/`
(40+ files total) are imported directly by various components.

### Current state (backend)

Since the earlier (now-obsolete) draft of this spec was written, the backend
has changed significantly. The new design must align with what ships today:

- **`agent_metadata` table** (`aionui-db/migrations/006_agent_metadata.sql`)
  is the single source of truth for every agent. Columns include
  `icon TEXT` (currently `NULL` for every seeded row). Migration `007` added
  `sort_order`.
- **`AgentMetadata` struct** (`aionui-api-types/src/agent_discovery.rs:95`)
  is the unified DB-row / API-response shape. It already serializes
  `icon: Option<String>` (line 98). The old `AgentInfo` and `DetectedAgent`
  types are gone.
- **`/api/agents`** returns `Vec<AgentMetadata>` directly — no adapter.
- **`AcpBackend` enum is gone.** ACP vendor identity is the string `backend`
  column on `agent_metadata` (e.g. `"claude"`, `"gemini"`).
- **Extensions already carry icons** via manifest → resolved at discovery
  time to `/api/extensions/{extensionName}/assets/{path}`. Extension agents
  are _not_ written back into the `agent_metadata.icon` column.
- **Remote agents** have their own `RemoteAgentResponse.avatar` field on
  the `/api/remote-agents` endpoints, independent of `agent_metadata`.
- **Team agents** use `TeamAgentResponse` (`aionui-api-types/src/team.rs:97`)
  which only carries `backend: String` and has no icon field today.

### Frontend consumer categories

A full call-site survey puts every logo render into one of three buckets:

- **A. Full `AgentMetadata` object available**
  `AgentCard.tsx`, `AgentHubModal.tsx`, `AgentPillBar.tsx`,
  `agentSelectUtils.tsx`, `GuidPage.tsx` (agent selector).
- **B. Only a string identifier**
  `AgentBadge.tsx`, `MessageText.tsx`, `McpAgentStatusDisplay.tsx`,
  `TaskDetailPage.tsx`, `CreateTaskDialog.tsx`, `ConversationSearchPopover.tsx`,
  `GuidPage.tsx:587` (static preset list).
- **C. Team agents** — `TeamAgentIdentity.tsx`, `TeamChatEmptyState.tsx`,
  `TeamAgent*` renderers. These have a `TeamAgentResponse` today, which
  currently falls into category B because the only identity it exposes is
  `backend`.

### Why move logos to the backend

The frontend should not know where logo files live or how to map an
identifier to a binary resource. Centralizing the asset source of truth in
the backend:

- Shrinks the renderer bundle.
- Makes the `agent_metadata` row the authority for "what an agent is _and_
  what it looks like" — one row, one truth.
- Matches the ongoing backend-migration direction.

## Design

### Hybrid resolution strategy (Option B, re-shaped)

Two complementary mechanisms that resolve to the same backend endpoint:

1. **DB-backed `icon` field (primary).** A migration backfills
   `agent_metadata.icon` for every builtin / internal seed row with a URL
   path like `/api/assets/logos/ai-major/claude.svg`. The frontend reads
   `AgentMetadata.icon` directly. This is the _only_ new data flow for
   agents surfaced via `/api/agents`.
2. **Local mapping table (secondary).** For render sites that only have a
   string identifier (chat history, MCP status display, `TaskDetailPage`,
   etc.), the frontend keeps a small `AGENT_LOGO_PATH_MAP` and builds the
   same URL with `buildAssetUrl(path)`.

The mapping table is the deliberate cost of Option B: adding a new agent
requires updating two places (seed `icon` + frontend table). Same endpoint
and same cache behavior in both paths.

### Backend: new `aionui-assets` crate

**Layer**: Capability (same tier as `aionui-auth` / `aionui-realtime`).

**Directory layout**:

```
crates/aionui-assets/
├── Cargo.toml
├── assets/
│   └── logos/
│       ├── ai-major/        # claude, gemini, openai, anthropic, mistral, deepseek, xai
│       ├── ai-china/        # qwen, kimi, zhipu, baidu, tencent, stepfun, volcengine, lingyiwanwu, minimax
│       ├── ai-cloud/        # openrouter, siliconflow, ppio, bedrock, novita, infiniai, ctyun, modelscope, newapi, poe
│       ├── brand/           # aion.svg (aionrs agent), auggie, droid, hermes
│       └── tools/
│           ├── coding/      # codex, cursor, qoder, snow, opencode-{light,dark}, codebuddy
│           └── *.svg        # github, goose, nanobot, openclaw, pdf-to-ppt
└── src/
    ├── lib.rs               # rust-embed + content-type + ETag helpers
    └── handler.rs           # axum handler: GET /api/assets/logos/{*path}
```

**Asset storage**: `rust-embed`.

- Debug (`cargo run`): reads from disk relative to `CARGO_MANIFEST_DIR`.
  Editing a logo does **not** require a rebuild.
- Release (`cargo build --release`): files embedded in the binary. Single
  binary, zero external asset dependencies.

**HTTP endpoint**: `GET /api/assets/logos/{*path}`

- No authentication (public static resource).
- `Content-Type` inferred from extension (`.svg` → `image/svg+xml`,
  `.png` → `image/png`).
- `Cache-Control: public, max-age=31536000, immutable` + `ETag` (hash of
  embedded bytes). `304` on matching `If-None-Match`.
- `404` for unknown paths.

Wired into `aionui-app`'s router as a capability-layer service. No auth
middleware, no CSRF — deliberately a plain static file handler.

### Backend: backfill `agent_metadata.icon` via migration

Every seeded row in `006_agent_metadata.sql` currently has `icon = NULL`.
Add a new migration `008_agent_metadata_icon_backfill.sql` that runs
`UPDATE agent_metadata SET icon = ? WHERE id = ?` for each deterministic
id. `006` stays untouched (migrations are append-only).

Target values (builtin + internal rows only; extension / custom rows keep
their existing mechanisms):

| `id`       | `name` / vendor   | `icon` (new value)                                  |
| ---------- | ----------------- | --------------------------------------------------- |
| `2d23ff1c` | Claude            | `/api/assets/logos/ai-major/claude.svg`             |
| `8e1acf31` | Codex             | `/api/assets/logos/tools/coding/codex.svg`          |
| `cc126dd5` | Gemini            | `/api/assets/logos/ai-major/gemini.svg`             |
| `26a946ed` | Qwen              | `/api/assets/logos/ai-china/qwen.svg`               |
| `8b20fd41` | CodeBuddy         | `/api/assets/logos/tools/coding/codebuddy.svg`      |
| `da386544` | Droid             | `/api/assets/logos/brand/droid.svg`                 |
| `600c6601` | Goose             | `/api/assets/logos/tools/goose.svg`                 |
| `eb895030` | Auggie            | `/api/assets/logos/brand/auggie.svg`                |
| `e241c49c` | Kimi              | `/api/assets/logos/ai-china/kimi.svg`               |
| `53861a53` | OpenCode          | `/api/assets/logos/tools/coding/opencode-light.svg` |
| `3cd9d436` | Copilot           | `/api/assets/logos/tools/github.svg`                |
| `1e4afc51` | Qoder             | `/api/assets/logos/tools/coding/qoder.png`          |
| `65d0f5b2` | Vibe              | `/api/assets/logos/ai-major/mistral.svg`            |
| `a0dfb1ec` | Cursor            | `/api/assets/logos/tools/coding/cursor.png`         |
| `e044000d` | Kiro              | _(stay NULL — no asset exists today)_               |
| `55f3ed1c` | Hermes            | `/api/assets/logos/brand/hermes.svg`                |
| `346b0041` | Snow              | `/api/assets/logos/tools/coding/snow.png`           |
| `fb1083a5` | Nanobot           | `/api/assets/logos/tools/nanobot.svg`               |
| `f9f61666` | OpenClaw Gateway  | `/api/assets/logos/tools/openclaw.svg`              |
| `632f31d2` | Aion CLI (aionrs) | `/api/assets/logos/brand/aion.svg`                  |

Re-running the migration is idempotent because each statement is keyed on
the stable id.

### Backend: add `icon` to `TeamAgentResponse`

Today `TeamAgentResponse` (`aionui-api-types/src/team.rs:97`) only has
`backend: String` and no icon. Add:

```rust
#[serde(skip_serializing_if = "Option::is_none")]
pub icon: Option<String>,
```

Populate it when the team service constructs the response: look up the
team agent's underlying `agent_metadata` row (keyed by `backend` for
builtin rows, by whatever id the team already stores for extension/custom
rows) and copy over the `icon` value.

Where the underlying row cannot be resolved (legacy / deleted agents),
leave `icon = None`. Frontend falls back to its local mapping table.

This is the only new _field_ this design introduces anywhere in the
backend. Extension agents and remote agents already carry their icons on
their own response types — they are untouched.

### Frontend: rewrite `agentLogo.ts`

Remove every static logo `import` (including `AionLogo`). Replace
`AGENT_LOGO_MAP` with `AGENT_LOGO_PATH_MAP` whose values are relative
paths under `/api/assets/logos/`:

```ts
const AGENT_LOGO_PATH_MAP: Record<string, string> = {
  aionrs: 'brand/aion.svg',
  claude: 'ai-major/claude.svg',
  gemini: 'ai-major/gemini.svg',
  qwen: 'ai-china/qwen.svg',
  kimi: 'ai-china/kimi.svg',
  codex: 'tools/coding/codex.svg',
  codebuddy: 'tools/coding/codebuddy.svg',
  droid: 'brand/droid.svg',
  goose: 'tools/goose.svg',
  hermes: 'brand/hermes.svg',
  snow: 'tools/coding/snow.png',
  auggie: 'brand/auggie.svg',
  opencode: 'tools/coding/opencode-light.svg',
  'opencode-dark': 'tools/coding/opencode-dark.svg',
  copilot: 'tools/github.svg',
  openclaw: 'tools/openclaw.svg',
  'openclaw-gateway': 'tools/openclaw.svg',
  vibe: 'ai-major/mistral.svg',
  nanobot: 'tools/nanobot.svg',
  remote: 'tools/openclaw.svg',
  qoder: 'tools/coding/qoder.png',
  cursor: 'tools/coding/cursor.png',
};

export function getAgentLogo(agent: string | undefined | null): string | null {
  if (!agent) return null;
  const key = agent.toLowerCase();
  if (key === 'opencode' && isDarkTheme()) {
    return buildAssetUrl(AGENT_LOGO_PATH_MAP['opencode-dark']);
  }
  const path = AGENT_LOGO_PATH_MAP[key];
  return path ? buildAssetUrl(path) : null;
}

function buildAssetUrl(path: string): string {
  return `${getBackendBaseUrl()}/api/assets/logos/${path}`;
}
```

`getBackendBaseUrl()` reuses the accessor already used by the rest of the
frontend HTTP client — no new config surface.

`resolveAgentLogo` priority becomes:

1. `opts.icon` — **now the DB-backed URL** from `AgentMetadata.icon` or
   `TeamAgentResponse.icon`. This is the primary channel.
2. Extension adapter id → `getAgentLogo(adapterId)`.
3. `opts.backend` → `getAgentLogo(opts.backend)`.
4. `null`.

### Dark-mode variant for opencode

`agent_metadata.icon` stores the light variant (`opencode-light.svg`).
Dark-mode swap stays client-side, applied in both `getAgentLogo` (string
path) and `resolveAgentLogo` (object path): if the incoming URL ends with
`opencode-light.svg` and `isDarkTheme()` is true, rewrite the suffix to
`opencode-dark.svg` before rendering. Centralize this in one helper so
both call paths stay consistent.

### Frontend: consumer wiring

- **Category A** (full `AgentMetadata`): pass `agent.icon` through to
  `resolveAgentLogo({ icon: agent.icon, backend: agent.backend, ... })`.
  Logo comes from the backend-populated field.
- **Category B** (string only): continue calling `getAgentLogo(name)`;
  the function now returns a backend URL instead of a bundled asset URL.
- **Category C** (team agents): `TeamAgentResponse` now carries `icon`;
  wire it into `TeamAgentIdentity.tsx`, `TeamChatEmptyState.tsx`, and any
  other team renderer. Fall back to `getAgentLogo(backend)` when `icon`
  is missing.

### Frontend: type alignment

- `AgentMetadata.icon?: string` in `agentTypes.ts` — already present.
- `TeamAgentResponse` TypeScript type: add `icon?: string` to match the
  backend change. If types are generated from an OpenAPI / shared source,
  regenerate.

### Frontend asset cleanup

After steps 1–4 are verified, delete `src/renderer/assets/logos/` except
`brand/app.png`. Remove bundler config that special-cased these paths
(if any).

## Data Flow

1. Renderer calls `GET /api/agents`.
2. Backend reads `agent_metadata` rows; each builtin / internal row now
   carries `icon` populated by the backfill migration.
3. Renderer maps each agent to UI and passes `agent.icon` to
   `resolveAgentLogo`.
4. Browser fetches `GET /api/assets/logos/{...}`; backend serves embedded
   bytes with long-lived cache headers. Subsequent renders hit the cache.
5. Team agents: `GET /api/teams/...` returns `TeamAgentResponse` objects
   carrying `icon` (looked up from `agent_metadata`). Same rendering
   flow.
6. String-only call sites: `getAgentLogo(name)` builds the URL locally
   via `AGENT_LOGO_PATH_MAP`. Same cache.

## Error Handling

- Backend: unknown asset path → 404. Logged, does not page.
- Frontend: `<img>` load failure → browser default broken-image icon.
  Components that already handle the null-logo case keep their existing
  fallback UI.
- Agent row with `icon = NULL` (e.g. Kiro, legacy custom rows) →
  `resolveAgentLogo` returns `null`; caller renders existing fallback.

## Testing

**Backend unit tests** (`aionui-assets`):

- Known asset path → 200 + correct `Content-Type` + non-empty body.
- Unknown path → 404.
- `ETag` present; `If-None-Match` match → 304.

**Backend migration tests**:

- After applying `008`, every expected seed row has a well-formed `icon`
  of shape `^/api/assets/logos/.+\.(svg|png)$` (except Kiro, stays NULL).
- Migration is idempotent on re-run.

**Backend integration**:

- `cargo run` (debug, rust-embed disk mode): `curl` returns each
  referenced logo.
- Release build (`cargo build --release`): binary run without an external
  `assets/` directory — all assets still served (proves embed).
- `/api/agents` response: every builtin/internal `icon` resolves to a
  live URL.
- `/api/teams/...`: `TeamAgentResponse.icon` is populated when the
  underlying `agent_metadata` row has one.

**Frontend unit tests** (`agentLogo.spec.ts`, Vitest):

- `getAgentLogo('claude')` → `${base}/api/assets/logos/ai-major/claude.svg`.
- `getAgentLogo('unknown')` → `null`.
- `resolveAgentLogo` priority: `icon` > extension id > backend.
- Dark-theme swap works from both entry points: `getAgentLogo('opencode')`
  and `resolveAgentLogo({ icon: '.../opencode-light.svg' })` both return
  the dark variant when dark mode is active.

**Manual verification**:

- GuidPage agent selector: every agent icon visible.
- AgentHubModal: extension agents still resolve icons via the existing
  `/api/extensions/.../assets/...` path (regression check — this design
  does not touch extensions).
- A team chat: every team agent renders its icon (new `icon` field in
  `TeamAgentResponse`).
- Chat history: `AgentBadge` renders for every historical message.
- Bundle size: renderer bundle shrinks by roughly the total size of the
  deleted logo assets.

## Migration Sequence

Each step is an independent commit / PR, independently verifiable.

1. **Create `aionui-assets` crate.** Copy logos from the frontend into
   `crates/aionui-assets/assets/logos/` (do not delete frontend copies
   yet). Implement `rust-embed`, handler, ETag + Cache-Control. Wire into
   `aionui-app` router. Ship with tests.
2. **Backfill `agent_metadata.icon`.** Add migration `008` with `UPDATE`
   statements keyed on the ids listed above. Include migration test.
3. **Add `icon` to `TeamAgentResponse`.** Update the struct, populate in
   the team service by looking up the underlying `agent_metadata` row.
   Add serde tests and a service-level test covering a team with a
   builtin agent (expects populated `icon`).
4. **Rewrite frontend `agentLogo.ts`.** Remove static imports, introduce
   `AGENT_LOGO_PATH_MAP` and `buildAssetUrl`. Update `resolveAgentLogo`
   priority. Add Vitest coverage.
5. **Thread `icon` through consumers.** Category A sites use
   `agent.icon` via `resolveAgentLogo`. Team renderers consume the new
   `TeamAgentResponse.icon`. Category B sites inherit the new backend
   URLs automatically from the rewritten `getAgentLogo`.
6. **Delete frontend assets.** Remove `src/renderer/assets/logos/` except
   `brand/app.png`. Verify `bunx tsc --noEmit`, lint, `bun run test`, and
   a release build all succeed.

Rollback: steps 1–3 are additive (backend only). If steps 4–5 cause
issues, revert them and the frontend's pre-migration bundled assets still
work until step 6 runs.

## Open Questions

- **Kiro icon**: the `agent_metadata` seed has a Kiro row but no Kiro
  asset ships in the frontend today. Leave `icon = NULL` until an asset
  is provided.
- **Frontend backend-base-URL accessor**: confirm the existing accessor
  used by the HTTP client so `buildAssetUrl` reuses it (cosmetic —
  does not affect the design).
- **Team service lookup path**: confirm the cleanest way for the team
  service to fetch an `agent_metadata` row when building the response
  (existing repository trait vs. via the agent registry cache). Picked at
  implementation time — does not affect the spec.
