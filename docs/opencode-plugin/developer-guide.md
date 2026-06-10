# Chisl OpenCode Plugin — Developer Guide

> **Audience:** Chisl / AionUi contributors maintaining
> `@chisl/chisl-opencode-plugin` and the AionCore plugin webserver it
> dials into.
> **Plugin package root:** `AionUi/packages/opencode-plugin/`
> **AionCore webserver:** `AionCore/crates/aionui-ai-agent/src/manager/remote/plugin/`
> **Wire contract:** [protocol v1 — AionCore `PROTOCOL.md`](../../../AionCore/crates/aionui-ai-agent/src/manager/remote/PROTOCOL.md) (Chisl Plugin Channel section).
> **Pinned SDK:** `@opencode-ai/plugin@1.16.2` (matches `<chisl-root>/opencode-sdk-version.json`).
> **Last verified:** 2026-06-10.

## Architecture

The plugin is a small TypeScript package that exports a single
`Plugin` factory (the OpenCode `Plugin` type from
`@opencode-ai/plugin`). It runs in-process inside the remote
`opencode serve` process. AionCore's plugin webserver (`server.rs`)
hosts the four HTTP/SSE routes the plugin dials back to.

The control plane lives entirely in the plugin; the data plane
(file reads, writes, synchronous shell) is unchanged and continues to
flow through the existing `local_fs_mcp` MCP bridge.

```
   opencode serve (remote)                       AionCore (local)
   ┌───────────────────────┐    HTTPS + SSE    ┌──────────────────┐
   │  @chisl/              │ ──── hello ─────► │ POST /plugin/    │
   │  chisl-opencode-      │ ◄── 200 + ver ──  │       hello      │
   │  plugin               │                   │                  │
   │                       │ ──── GET events ► │ GET  /plugin/    │
   │  ┌─────────────────┐  │ ◄── SSE stream ── │       events     │
   │  │ Hooks:          │  │                   │                  │
   │  │  - event        │  │                   │ PluginRegistry   │
   │  │  - tool.before  │  │ ──── POST ──────► │ POST /plugin/    │
   │  │  - tool.after   │  │                   │       result     │
   │  │  - perm.ask     │  │                   │                  │
   │  │  - sys.trans    │  │                   │ Audit ring buf   │
   │  │  - chat.message │  │                   │ (500 entries)    │
   │  │  - run_shell_   │  │ ──── POST SSE ─► │ POST /tools/     │
   │  │    streaming    │  │ ◄── chunk/done ── │  run_shell_      │
   │  └─────────────────┘  │                   │  streaming       │
   └───────────────────────┘                   │ + ShellApprover  │
                                               └──────────────────┘
```

## `packages/opencode-plugin/src/` module map

| File              | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`        | Public entry point. Re-exports the `Plugin` factory as both `ChislPlugin` (named) and the default export, plus a handful of helpers (`AionCoreClient`, `ContextStore`, `formatSystemInjection`, `parseSseStream`, `connectEvents`, `nextBackoff`, `DEFAULT_BACKOFF`, `capPreview`, `TIMEOUTS`, `OUTPUT_PREVIEW_MAX`, `resolveConfig`, `buildHelloBody`, `detectServerVersion`, `buildHooks`, `createRunShellStreamingTool`, `DECLARED_HOOKS`, `PROTOCOL_VERSION`, `PLUGIN_VERSION`) and their type aliases.                                                                                                                                                                                                                                                                |
| `config.ts`       | Pure `resolveConfig(options, env?)` that picks the AionCore base URL + bearer token from plugin options first, then `AIONCORE_URL` / `AIONCORE_TOKEN` env vars. If either is missing, returns a `{ kind: 'disabled', reason }` so the host can decide to load no-op hooks. Also exports `buildHelloBody` (test-verifiable constructor for the hello payload) and the `PluginMode` discriminated union.                                                                                                                                                                                                                                                                                                                                                                     |
| `connection.ts`   | The AionCore HTTP + SSE client. `AionCoreClient` is intentionally small: `postJson<T>`, `hello`, `sendResult`, `openEventStream`, `openShellStream`. All errors are surfaced via `AionCoreHttpError` and swallowed at the boundary. `parseSseStream` handles the SSE wire format with a small state machine that survives lines split across `Uint8Array` chunks. `connectEvents` runs the reconnect loop with exponential full-jitter backoff (`DEFAULT_BACKOFF = { baseMs: 1000, capMs: 30000, jitter: true }`). `capPreview` truncates a string to `OUTPUT_PREVIEW_MAX = 2048` chars, suffixing a `[truncated N chars]` marker. `TIMEOUTS = { postJson: 10_000, permission: 3_000 }` ms.                                                                                |
| `context.ts`      | In-memory `ContextStore` keyed by `sessionID` (plus a global bucket). Strings are **appended** on `apply`, not replaced; an LRU cap (`maxSessions`, default 256) evicts the oldest session when full. `formatSystemInjection` joins stored strings with blank lines. Concurrency model: the OpenCode server invokes SSE dispatch and hook callbacks on the same event loop, so no locks are needed.                                                                                                                                                                                                                                                                                                                                                                        |
| `capabilities.ts` | `DECLARED_HOOKS` is the canonical hook list reported via `hello` (see Capability-detection contract below). `buildHooks({ client, store, opencodeVersion, project })` constructs the `Hooks` object the OpenCode runtime expects. `detectServerVersion(input)` probes a handful of best-effort SDK client methods (`client.app.get('version')`, `client.app.getVersion()`) and returns `undefined` on any failure — the version is purely diagnostic. `createPlugin(input, options?)` is the entry point and ties `resolveConfig`, the SSE background loop, the `ContextStore`, and the `Hooks` bag together; it annotates the returned `Hooks` with a `dispose()` method that aborts the SSE controller and clears the client reference held by the streaming shell tool. |
| `shell.ts`        | The `run_shell_streaming` custom tool. Exposes `createRunShellStreamingTool(getClient: () => AionCoreClient \| null)` (a factory) — the resulting `ToolDefinition` closes over a `getClient` thunk so the live client can be re-read on every call and dropped via `dispose()`. Calls `AionCoreClient.openShellStream` (the public method that owns URL + headers) to POST the `RunShellStreamingRequest` and consumes the SSE response, accumulating stdout/stderr into `ctx.metadata` (throttled to at most one call per 100 ms). The final `ToolResult` carries `{ title, output, metadata: { exitCode, isError, truncated, [streamError], [status], [disabled] } }`. Always returns a structured result — never throws — so a misconfigured host cannot crash.         |
| `types.ts`        | Wire-protocol types for protocol v1. `PROTOCOL_VERSION = 1`, `PLUGIN_VERSION = '0.1.0'`. `HelloRequest` / `HelloResponse`, `ContextUpdate`, `SseEvent`, the `ResultRequest` discriminated union (`ToolBeforePayload` \| `ToolAfterPayload` \| `EventPayload` \| `PermissionAskPayload`), `OkResponse` / `PermissionResponse` / `ResultResponse`, `RunShellStreamingRequest`, and the `RunShellStreamEvent` union (`chunk` \| `done` \| `error`).                                                                                                                                                                                                                                                                                                                           |

## Capability-detection contract

`DECLARED_HOOKS` (in `capabilities.ts:21`) is the single source of truth
for what the plugin tells AionCore it can do. It is reported verbatim
in the `hooks` field of the `POST /plugin/hello` body and is the only
place to add or remove a hook.

```ts
export const DECLARED_HOOKS: readonly string[] = [
  'event',
  'tool.execute.before',
  'tool.execute.after',
  'permission.ask',
  'chat.message',
  'experimental.chat.system.transform',
];
```

`FORWARDED_EVENT_TYPES` (in `capabilities.ts:30`) is the subset of
OpenCode event types the plugin forwards to AionCore as `kind: "event"`
result telemetry. Today: `file.watcher.updated`, `session.idle`,
`message.part.updated`. The plugin filters upstream so AionCore
doesn't have to re-implement the OpenCode event grammar.

### Runtime degrade latch

The plugin prefers `experimental.chat.system.transform` for context
injection (cleanest integration — strings go straight into the system
prompt). The `chat.message` synthetic-part fallback exists for older
OpenCode versions that don't fire the experimental hook.

The two **must not** double-inject. `buildHooks` declares a closure-
local `systemTransformFired` boolean. The first time the system hook
fires, the latch flips to `true`; the `chat.message` hook reads the
latch on every call and short-circuits if it's set. This means a
host that fires both hooks at least once (typical for a recent
OpenCode build) gets a single injection site, while a host that only
fires `chat.message` (older builds) still gets the context. The
latch is per-plugin-instance and resets only on plugin reload.

## Protocol v1 wire shapes

See [AionCore `PROTOCOL.md` — Chisl Plugin Channel (protocol v1)](../../../AionCore/crates/aionui-ai-agent/src/manager/remote/PROTOCOL.md).
The TypeScript types in `types.ts` are the source of truth on the
plugin side; `manager/remote/plugin/protocol.rs` is the source of
truth on the AionCore side. **Bumping either is a breaking change
unless both are updated and `PROTOCOL_VERSION` is bumped in lock-step.**
A mismatch today is logged on the AionCore side and accepted (best-
effort forward-compat); a future bump will switch this to a hard
reject.

## The never-crash-the-host rule

Every hook in `buildHooks` is wrapped in a `try { … } catch { /* swallow */ }`.
The `fireAndForget` helper in `capabilities.ts:96` runs
fire-and-forget work and `.catch(() => {})`s the rejection. The SSE
reconnect loop in `createPlugin` is launched with
`void connectEvents({…}).catch(() => {})`. The `run_shell_streaming`
tool always returns a structured `ToolResult` — never throws.

This is non-negotiable. The plugin runs inside the OpenCode server
process; a thrown error in a hook body can wedge the server or take
the user's session down. The control plane failing must degrade
silently to a "no AionCore attached" state, not a crash.

## Security notes

The plugin runs **in-process and unsandboxed** inside the
`opencode serve` process. That sounds alarming; the actual attack
surface is small because the plugin **executes nothing locally
destructive**:

- **No file I/O.** No reads, no writes. The plugin is a forwarder and
  a context store; all file operations go through the existing
  `local_fs_mcp` MCP bridge (the data plane), which has its own
  audit and approval.
- **No shell execution on the OpenCode side.** The
  `run_shell_streaming` tool's body is entirely an HTTP POST + SSE
  consumer; the shell runs on the AionCore side, behind the
  `ShellApprover` the user sees in the Approvals queue and audited
  in the per-agent ring buffer. The remote host never gets a code
  path that runs `child_process.spawn` or equivalent.
- **Bearer token grants access only to the plugin channel
  endpoints.** The token is per-workspace (per `remote_agent_id`
  row); it does not grant access to the rest of AionCore's REST
  surface. The token is stored plaintext in SQLite (see migration 010) because the webserver does a SQL-equality lookup; rotate it
  via the AionUi install card or `POST /api/remote-agents/{id}/plugin/rotate-token`
  if it leaks.
- **Production logs are quiet.** `info!` / `warn!` / `error!` lines
  never carry the token, the plugin's tool `args` / `output`, the
  shell command body, or the SSE event bodies pushed to the plugin.
  The redacted `summary` (≤ 2048 chars) and the shell command preview
  (≤ 80 chars) are the only payload-shaped strings that reach logs.

## Build & test

**Build** (from the package root):

```bash
cd AionUi/packages/opencode-plugin
bunx tsc
```

Output is `dist/`; the package's `package.json` points `main`,
`types`, and the conditional `exports` at `dist/`. `dist/` is the
only file path the `files` field ships.

**Test** (from the AionUi repo root):

```bash
bun run test
```

Unit tests for the plugin live in
`AionUi/tests/unit/opencode-plugin/`:

| File                   | Covers                                                                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `_helpers.ts`          | Shared `installFetchMock` + typed `FetchCall` / `FetchHandler` plumbing.                                                                      |
| `config.test.ts`       | `resolveConfig` precedence, disabled-mode reasons, `buildHelloBody` shape.                                                                    |
| `connection.test.ts`   | (`sse.test.ts`) `parseSseStream` chunk-boundary handling, dispatcher routing.                                                                 |
| `backoff.test.ts`      | `nextBackoff` math, full-jitter bounds, cap enforcement.                                                                                      |
| `context.test.ts`      | `ContextStore` apply / snapshot / eviction.                                                                                                   |
| `capabilities.test.ts` | `buildHooks` hook wiring, latch behaviour, `detectServerVersion` probe fallback.                                                              |
| `shell.test.ts`        | `run_shell_streaming` tool: success path, AionCore rejection, throttled metadata emission, factory-driven client injection (no global state). |
| `sse.test.ts`          | SSE parser (split chunks, multi-line data, comments, abort handling).                                                                         |

The plugin's `chisl-ai-plugin` companion tests live alongside the rest
of the AionUi test suite and run under the same `bun run test` /
`bun run test:coverage` invocations. The `tsconfig.json` in the
package root is independent of the renderer / desktop tsconfig — the
plugin compiles standalone against `@types/node@^24` and
`typescript@^5.8`.

## Version matrix policy

The plugin SDK pin is **`@opencode-ai/plugin@1.16.2`** and is shared
with the conformance surface in AionCore. The single source of truth
is `<chisl-root>/opencode-sdk-version.json`. The AionCore
`aionui-opencode-conformance` crate's `build.rs` reads that JSON at
build time; `AionUi/scripts/sync-opencode-types.js` reads it before
regenerating `opencodeProviderTypes.ts`. Both refuse to run with a
drifted pin.

**Bumping the SDK is a multi-repo change.** When you bump
`opencode-sdk-version.json::version`:

1. `<chisl-root>/opencode-sdk-version.json::version` → new version.
2. `AionUi/package.json` devDependencies.`"@opencode-ai/sdk"` → new
   version; `bun install`.
3. `AionUi/packages/opencode-plugin/package.json` dependencies.`"@opencode-ai/plugin"`
   → new version; `bun install` in the package.
4. AionCore: `cargo test -p aionui-opencode-conformance` — the pin
   tests will fail until steps 1-3 agree.
5. AionUi: `bun run types:sync-opencode` and
   `bun run types:sync-opencode:check`.
6. **Re-verify every hook in `DECLARED_HOOKS` against the new SDK**
   (live `opencode serve` capture + a unit-test pass). Hook names
   have changed between OpenCode releases (the
   `experimental.chat.system.transform` rename is one such
   break). If a hook disappeared, the conformance suite will catch
   the protocol drift; if a hook was renamed, the plugin will throw
   on load and the test suite will surface it. **Do not skip step 6
   on a version bump.**
7. Update the "Last verified" line at the top of this guide and in
   AionCore `PROTOCOL.md`'s plugin-channel section.
8. Add a `CHANGELOG.md` entry at the chisl root under today's date
   with the repo name and a plain-English description of the bump.
