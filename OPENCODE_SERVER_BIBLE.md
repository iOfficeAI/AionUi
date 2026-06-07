# OpenCode Server Bible — Comprehensive Architecture & API Audit

This document is the definitive guide to the OpenCode architecture, server internals, HTTP API surface, SDK design, and internal patterns, derived from an exhaustive audit of the `anomalyco/opencode` source code and Context7 documentation.

## 1. Architecture & Technology Stack

OpenCode is built on a client/server architecture. The server acts as the single source of truth for all clients (TUI, Web, Desktop, SDK, IDE extensions).

### 1.1 Core Technology Stack

- **Runtime:** Bun (primary), Node.js (secondary)
- **Framework:** Effect's `effect/unstable/http` (Hono-like, built on Effect)
- **API Definition:** Schema-first using `HttpApi` / `HttpApiBuilder` / `HttpApiEndpoint`
- **Dependency Injection & Error Handling:** Effect 4.0 (beta)
- **Schema Validation:** Effect Schema (`@standard-schema/spec`)
- **AI SDK:** Vercel AI SDK 6.x supporting 15+ provider adapters
- **Database:** Drizzle ORM + SQLite (Bun native or Node `better-sqlite3`)
- **MCP:** `@modelcontextprotocol/sdk` 1.27.1
- **PTY:** Custom fork of `@lydell/node-pty`
- **Real-time:** Server-Sent Events (SSE) and WebSockets
- **Service Discovery:** mDNS via `bonjour-service`

### 1.2 Monorepo Structure (Turborepo)

- `packages/opencode`: Core CLI and Server binary
- `packages/sdk/js`: `@opencode-ai/sdk` (TypeScript client)
- `packages/core`: Shared Effect-based domain logic
- `packages/server`: V2 API definitions
- `packages/app`: Web frontend (SolidJS)
- `packages/console`: Dashboard (SolidJS + SolidStart)
- `packages/desktop`: Electron wrapper
- `packages/plugin`: Plugin system definitions

---

## 2. Server Startup & Middleware Lifecycle

### 2.1 Boot Sequence

The server boots via `Server.listen(opts)`:

1. `startWithPortFallback()`: Tries port 4096, falls back to a random port.
2. `listenerLayer()`: Builds the Effect Layer with routes and middlewares.
3. NodeHttpServer wraps `createServer()` adding graceful shutdown capabilities (1-second socket close).
4. Tracks WebSockets via `WebSocketTracker`.
5. Advertises mDNS if enabled.

### 2.2 Middleware Pipeline

1. `errorLayer`: Catches defects, returns structured 500s.
2. `compressionLayer` / `corsVaryFix` / `cors`: Cross-Origin handling.
3. `fenceLayer`: Sync fence coordination.
4. `Database`: SQLite connection pool.
5. **40+ Effect service layers**: Domain logic dependency injection.
6. `InstanceLayer`: Context loading per directory.
7. `Observability`: OpenTelemetry tracing.

### 2.3 Workspace & Instance Routing

- **`WorkspaceRoutingMiddleware`**: Uses `?workspace=<id>` to decide whether to proxy a request to a remote cloud-hosted workspace or handle it locally.
- **`InstanceContextMiddleware`**: Retrieves or initializes an `InstanceRef` for the working directory. A single server can manage multiple concurrent workspace instances. Instances are cleanly disposed post-response via a `WeakMap<Request, MarkedInstance>`.

### 2.4 Authentication

Configured via `OPENCODE_SERVER_PASSWORD`. The server checks the `Authorization: Basic <b64>` header or the `?auth_token=` query param.
PTY WebSockets use a ticket-based system (`/pty/:id/connect-token` issues a short-lived token).

---

## 3. The HTTP API (V1 & V2)

The server merges 5 top-level Effect API groups: `RootHttpApi`, `EventApi`, `PtyConnectApi`, `InstanceHttpApi`, and the next-generation `V2Api`.

### 3.1 Global & Control Routes

- `GET /global/health`: Server version and health.
- `GET /global/event`: Global SSE stream.
- `GET /global/config` & `PATCH /global/config`: Manage global configuration.
- `POST /global/dispose`: Purge all instances.
- `POST /global/upgrade`: Self-update binary.

### 3.2 Session Lifecycle (`/session`)

- `GET /session`: Paginated list of sessions.
- `POST /session`: Create new session.
- `POST /session/:id/message`: Synchronous LLM generation. Payload contains typed parts (`text`, `file`).
- `POST /session/:id/prompt_async`: Async, fire-and-forget generation.
- `POST /session/:id/command`: Execute commands via agents.
- `POST /session/:id/shell`: Run bash execution via agents.
- `GET /session/:id/diff`: File patch diff extraction.
- `POST /session/:id/revert` & `/unrevert`: Session undo management.
- `POST /session/:id/fork`: Branch off a conversation message.
- `POST /session/:id/share`: Generate a public URL.

### 3.3 Provider & MCP Integrations

- `GET /provider`: List all LLM providers (15+ including OpenAI, Anthropic, OpenCode Zen/Go, etc.).
- `POST /provider/:id/oauth/authorize` & `callback`: Provider dynamic client registration OAuth flows.
- `POST /mcp`: Dynamically register an MCP server at runtime.
- `GET /mcp`: Status of loaded MCP resources.

### 3.4 File System & Workspace Search

- `GET /find`: Ripgrep text matching.
- `GET /find/file`: Fuzzy file finder (fff).
- `GET /find/symbol`: LSP workspace symbol requests.
- `GET /file/content`: Stream file buffer.
- `GET /vcs/diff`: Get structured Git patches.

### 3.5 Terminals (PTY)

- `POST /pty`: Spawn background shells.
- `GET /pty/:ptyID/connect`: Upgrade to a WebSocket binary stream.

### 3.6 V2 Architecture

V2 API (`/api/*`) leverages `@effect/schema` for rigorous runtime validation and error typing (e.g., `SessionNotFoundError`, `ServiceUnavailableError`), laying the foundation for future SDK stability.

---

## 4. The SDK (`@opencode-ai/sdk`)

The SDK is auto-generated via `@hey-api/openapi-ts` from the server's OpenAPI 3.1 spec (`/doc`), offering robust types for every route.

### 4.1 Initialization

```typescript
import { createOpencode } from '@opencode-ai/sdk';

// Spawns headless server process automatically
const { client, server } = await createOpencode({
  port: 4096,
  config: { model: 'anthropic/claude-3-5-sonnet-20241022' },
});
```

### 4.2 Key Features

- **Structured Output:** Provide a `format: { type: "json_schema", schema: {...} }` to force JSON adherence during `.prompt()` calls.
- **Context Injection:** Send a prompt with `noReply: true` to insert files or instructions into the context without triggering generation.
- **SSE Parsing:** `client.event.subscribe()` creates a type-safe async iterator over the domain events (e.g., `message.updated`, `file.edited`).
- **Directory Forcing:** Modifies requests to include `?directory=` or `x-opencode-directory` headers seamlessly.

---

## 5. Event Systems & Data Flow

Two parallel event systems coordinate the platform:

1. **EventV2 (Effect-based):** Typed schema events persisted to the Drizzle SQLite database, powering the cross-device sync protocol.
2. **GlobalBus (Node EventEmitter):** High-throughput, cross-instance messaging for memory synchronization.
   _Note: `EventV2Bridge` mirrors V2 events into the GlobalBus._

---

## 6. Tool & Agent Definitions

### 6.1 Tool Runtime

Tools are written using `tool()` blocks with Effect Schemas. Tool execution streams seamlessly back into the `LLM.stream()` cycle.
Built-in tools include: `bash`, `edit`, `write`, `read`, `grep`, `glob`, `lsp`, `apply_patch`, `skill`, `todowrite`, `webfetch`, `websearch` (via Exa), `question`.

### 6.2 Agent System

Agents have distinct access scopes, defined in JSON configs or Markdown frontmatter:

- **Build (Primary):** Full system access.
- **Plan (Primary):** `bash` and `edit` permissions set to `ask`.
- **Explore / Scout (Subagents):** Read-only analysis.
- **Compaction / Summary:** Hidden pipeline agents.

---

## 7. Configuration Precedence

Configurations merge in the following order (lowest to highest):

1. **Remote org defaults** (`.well-known/opencode`)
2. **Global prefs** (`~/.config/opencode/opencode.json`)
3. **Custom Env** (`OPENCODE_CONFIG`)
4. **Project settings** (`opencode.json`)
5. **Agent/Plugin Overrides** (`.opencode/`)
6. **Inline Overrides** (`OPENCODE_CONFIG_CONTENT` env var)
7. **Managed System Policies** (`/etc/opencode/` or `/Library/Application Support/opencode/`)
8. **MDM Policies** (`.mobileconfig`)

Variable substitutions like `{env:OPENAI_KEY}` and `{file:.opencode/prompt.txt}` are natively supported.

---

## 8. Extensibility: Plugins & Workflows

### Plugins

Export a single async initializer returning lifecycle hooks:

```typescript
export const MyPlugin = async () => ({
  "tool.execute.before": async (input) => { ... },
  event: async ({ event }) => { ... }
})
```

Includes rich hooks for compaction interventions (`experimental.session.compacting`).

### GitHub/GitLab Integration

- Fully automated CI/CD bot mode via `opencode github install`.
- Interprets `/opencode` commands in PRs and handles `pull_request` triggers using ephemeral sessions on Action runners.

---

_Generated via automated documentation intelligence on 2026-06-07._
