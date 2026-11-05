# Architecture Overview

AionUi turns command-line AI agents into a desktop chat application. This document
explains how the pieces fit together, so you know which layer a change belongs in
before you start writing code.

## The three runtimes

AionUi is not a single program. Three runtimes cooperate at all times:

| Runtime          | What it is                                 | Where it lives                           |
| ---------------- | ------------------------------------------ | ---------------------------------------- |
| **Renderer**     | React UI running in a Chromium window      | `packages/desktop/src/renderer/`         |
| **Main process** | Electron/Node.js — windows, OS integration | `packages/desktop/src/process/`          |
| **aioncore**     | Standalone backend binary, HTTP server     | shipped in `resources/bundled-aioncore/` |

The first two are TypeScript in this repository. The third is built from a separate
repository and bundled into the installer, which is why you will not find it in a fresh
clone. The main process launches it on startup (`process/startup/backendStartup.ts`) and resolves
via `process/backend/binaryResolver.ts`.

**Never mix runtime APIs.** The renderer has no Node.js access; the main process has no
DOM. The compiler will not always catch a violation, but the app will break at runtime.

## How the renderer talks to everything else

There are exactly two channels, and picking the right one matters:

```
┌────────────────────────────────────────────┐
│  Renderer (React, no Node.js APIs)         │
└───────────┬────────────────────┬───────────┘
            │                    │
   IPC bridge│        HTTP       │
   (preload) │   (httpBridge)    │
            ▼                    ▼
┌───────────────────────┐  ┌──────────────────────────┐
│ Main process          │  │ aioncore (HTTP, 127.0.0.1)│
│ windows, dialogs,     │  │ conversations, agents,    │
│ tray, notifications,  │  │ models, skills, MCP,      │
│ auto-update, theme    │  │ scheduled tasks, database │
└───────────┬───────────┘  └──────────────────────────┘
            │ spawns & supervises       ▲
            └───────────────────────────┘
```

### 1. IPC bridge — desktop capabilities

Anything that needs the operating system goes through `contextBridge` in
`packages/desktop/src/preload/`, handled by a bridge module in
`packages/desktop/src/process/bridge/`:

- `windowControlsBridge` — window chrome and controls
- `dialogBridge` — native file/message dialogs
- `notificationBridge` — system notifications
- `themeBridge` — OS theme following
- `updateBridge` — auto-update flow
- `webuiBridge` — starting/stopping the WebUI server
- `systemSettingsBridge`, `feedbackBridge`, `applicationBridge`

Adding a desktop capability means adding a bridge module here — not reaching for
Node.js from the renderer.

### 2. HTTP to aioncore — product data

Conversations, agents, assistants, model providers, skills, MCP servers, scheduled
tasks and their persistence all live in aioncore, reached over plain HTTP through
`packages/desktop/src/common/adapter/httpBridge.ts`. In the desktop app that resolves to
`http://127.0.0.1:<backend port>`; in the WebUI it becomes a same-origin relative path,
which is why the one code path serves both shells. The main process is not in that path
at all — no IPC hop, no proxying.

(`renderer/api/client.ts` is a small standalone client factory, not this path. Use
`httpBridge` unless you have a reason not to.)

This is why most feature work does **not** touch the Electron main process at all.

## Shared code

`packages/desktop/src/common/` is the only place both runtimes may import from. It holds
cross-process types, config, theme tokens, platform adapters and the model-provider API
clients (`common/api/` — the rotating Anthropic/Gemini/OpenAI clients and protocol
converters).

Code here must not assume either a DOM or a Node.js environment. When shared code does
need a platform capability, call `getPlatformServices()` from `@/common/platform` — that
indirection is what keeps the same module working under Electron and under plain Node in
the WebUI. Do **not** import `common/electronSafe.ts`: it is marked `@internal` and only
three specific modules are allowed to touch it.

## Beyond the desktop app

The repository is a monorepo. Besides `packages/desktop`:

| Package                   | Purpose                                                                   |
| ------------------------- | ------------------------------------------------------------------------- |
| `packages/web-host`       | Serves the WebUI and reverse-proxies to aioncore — no Electron dependency |
| `packages/web-cli`        | Standalone web runtime launcher, for running AionUi without a desktop     |
| `packages/shared-scripts` | Build scripts shared across packages                                      |

The same renderer code therefore runs in two shells: an Electron window, and a browser
served by `web-host`. A renderer change that silently assumes Electron is present will
break the WebUI — route it through the platform adapters in `common/platform/`.

## Where a change belongs

| You are adding…                                   | Put it in                                      |
| ------------------------------------------------- | ---------------------------------------------- |
| UI, a page, a component, a hook                   | `packages/desktop/src/renderer/`               |
| A native/OS capability the UI needs               | a new bridge in `process/bridge/` + `preload/` |
| Conversation, agent, model or persistence logic   | aioncore (separate repository), not here       |
| A type or helper both runtimes need               | `packages/desktop/src/common/`                 |
| Window lifecycle, tray, updater, startup sequence | `packages/desktop/src/process/`                |

For the detailed rules on file naming, directory size limits and module layout, see
[`../contributing/file-structure.md`](../contributing/file-structure.md).

## Further reading

- [`../contributing/development.md`](../contributing/development.md) — set up a dev environment
- [`../../AGENTS.md`](../../AGENTS.md) — code conventions, lint/format/test commands, commit format
- [`../guides/`](../guides) — deployment, WebUI and debugging guides
