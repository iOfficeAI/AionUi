# WebServer Standalone Mode Design

**Date:** 2026-03-20
**Status:** Draft
**Scope:** Extract WebServer from Electron main process so it can run as an independent Node.js service

---

## Background

AionUI is an Electron desktop app. The WebServer (`src/webserver/`) is currently started by the Electron main process via `webuiBridge` IPC. This means the WebUI (browser-based UI) can only be used when the Electron desktop app is running.

**Goal:** Allow the WebServer to run standalone — without Electron — so it can be:

1. Deployed to a Linux server / VPS for remote access
2. Started locally for development without launching the full Electron app

---

## Current Architecture

```
Electron App (src/index.ts)
  └─ adapter/main.ts          ← bridge adapter using ipcMain / BrowserWindow
       └─ initBridge.ts       ← registers all bridge handlers
            └─ webuiBridge    ← starts WebServer via IPC
                 └─ webserver/index.ts
```

**Key Electron dependencies that block standalone mode:**

| File                                              | Electron API used                                   |
| ------------------------------------------------- | --------------------------------------------------- |
| `src/adapter/main.ts`                             | `ipcMain`, `BrowserWindow`                          |
| `src/process/bridge/dialogBridge.ts`              | `dialog.showOpenDialog`                             |
| `src/process/bridge/shellBridge.ts`               | `shell.openExternal`                                |
| `src/process/bridge/windowControlsBridge.ts`      | `BrowserWindow` min/max/close                       |
| `src/process/bridge/updateBridge.ts`              | `autoUpdater`                                       |
| `src/process/bridge/notificationBridge.ts`        | `Notification`, `setMainWindow`                     |
| `src/process/bridge/webuiBridge.ts`               | `ipcMain.handle` direct calls                       |
| `src/process/bridge/fsBridge.ts`                  | `app.getPath('userData')` — skills config path      |
| `src/process/bridge/applicationBridge.ts`         | `app.relaunch()`, `app.exit()`, `app.getPath()`     |
| `src/process/services/cron/CronService.ts`        | `powerSaveBlocker`                                  |
| `src/process/services/mcpServices/McpProtocol.ts` | `app.getPath()`                                     |
| `src/webserver/index.ts`                          | static import of `webuiBridge` → pulls in `ipcMain` |
| `src/process/initStorage.ts`                      | top-level `import { app } from 'electron'`          |

**Already pure Node.js (no changes needed):**

- `src/webserver/` — Express + ws
- `src/process/database/` — better-sqlite3
- `src/worker/` — child_process.fork
- All remaining bridge files (conversation, task, mcp, cron, etc.)

---

## Chosen Approach: New Standalone Adapter (Approach A)

Add a new `src/adapter/standalone.ts` that uses Node.js `EventEmitter` as the bridge transport, replacing `ipcMain`. This mirrors the existing pattern:

| File                                | Environment           | Transport                   |
| ----------------------------------- | --------------------- | --------------------------- |
| `src/adapter/browser.ts`            | Browser (renderer)    | WebSocket or Electron IPC   |
| `src/adapter/main.ts`               | Electron main process | `ipcMain` + `BrowserWindow` |
| `src/adapter/standalone.ts` _(new)_ | Node.js server        | `EventEmitter`              |

The frontend `src/adapter/browser.ts` requires **zero changes** — it already detects the absence of `window.electronAPI` and uses WebSocket automatically.

---

## Architecture After Change

```
[Browser]
  browser.ts (WebSocket path, unchanged)
       │ ws://
       ▼
[Node.js Server]
  src/server.ts                 ← new standalone entry point
       │
       ├─ adapter/standalone.ts ← bridge adapter (EventEmitter)
       │       │
       │       └─ adapter/registry.ts ← shared broadcaster state
       │
       ├─ initBridgeStandalone.ts ← bridge init without Electron bridges
       │
       └─ webserver/index.ts (startWebServerWithInstance)
```

---

## File Changes

### New Files (5)

#### `src/adapter/registry.ts`

Shared module containing the WebSocket broadcaster registry and bridge emitter reference. Extracted from `main.ts` so both `main.ts` and `standalone.ts` can share it without pulling in Electron.

```typescript
// Shared state — no Electron imports
type WebSocketBroadcastFn = (name: string, data: unknown) => void;
const webSocketBroadcasters: WebSocketBroadcastFn[] = [];
let bridgeEmitter: { emit: (name: string, data: unknown) => unknown } | null = null;

export function registerWebSocketBroadcaster(fn: WebSocketBroadcastFn): () => void;
export function getBridgeEmitter(): typeof bridgeEmitter;
// setBridgeEmitter is net-new (no equivalent in main.ts today):
export function setBridgeEmitter(emitter: typeof bridgeEmitter): void;
// Convenience helper used by standalone.ts emit():
export function broadcastToAll(name: string, data: unknown): void;
```

#### `src/adapter/standalone.ts`

Bridge adapter for the standalone Node.js server. Uses `EventEmitter` in place of `ipcMain`.

```typescript
import { EventEmitter } from 'events';
import { bridge } from '@office-ai/platform';
import { broadcastToAll, setBridgeEmitter } from './registry';

// Internal EventEmitter — replaces ipcMain as the message bus
const internalEmitter = new EventEmitter();
internalEmitter.setMaxListeners(100);

bridge.adapter({
  emit(name, data) {
    // Broadcast to all connected WebSocket clients
    broadcastToAll(name, data);
  },
  on(bridgeEmitterRef) {
    // Save reference so webserver/adapter.ts can dispatch incoming WS messages
    setBridgeEmitter(bridgeEmitterRef);
    // Route messages dispatched via dispatchMessage() into the bridge handlers
    internalEmitter.on('message', ({ name, data }) => {
      bridgeEmitterRef.emit(name, data);
    });
  },
});

/** Called by webserver/adapter.ts for each incoming WebSocket message */
export function dispatchMessage(name: string, data: unknown): void {
  internalEmitter.emit('message', { name, data });
}
```

> **Note:** `main.ts` and `standalone.ts` both call `bridge.adapter()` at module load time. They must **never both be imported in the same process** — doing so causes the second adapter to silently overwrite the first. The standalone entry point (`server.ts`) must never import `adapter/main.ts`.

`webserver/adapter.ts` is updated to call `dispatchMessage` (imported from `adapter/standalone.ts` or via `getBridgeEmitter()` from `registry.ts`) for incoming WS messages — same behaviour as today.

#### `src/process/initBridgeStandalone.ts`

Bridge initializer for standalone mode. Identical structure to `initBridge.ts` but skips the 6 Electron-only bridges.

**Skipped bridges** (Electron-specific, not applicable in a headless server):

- `dialogBridge` — file picker replaced by HTTP upload in browser
- `shellBridge` — no desktop to open files in
- `windowControlsBridge` — no window to control
- `updateBridge` — no Electron auto-updater
- `notificationBridge` — no desktop notification
- `webuiBridge` — server is started directly, not via IPC
- `fsBridge` — top-level `import { app } from 'electron'` for `app.getPath('userData')`; skills config path needs a Node.js fallback
- `applicationBridge` — calls `app.relaunch()` / `app.exit()` / `app.getPath()`; no equivalent in standalone mode
- `cronBridge` — depends on `CronService` which has `import { powerSaveBlocker } from 'electron'` at the top level; crashes on module load in Node.js
- `mcpBridge` — depends on `McpProtocol` which has `import { app } from 'electron'`; needs verification before enabling

All remaining bridges (conversation, task, database, auth, channel, gemini, bedrock, model, previewHistory, document, systemSettings, starOffice, extensions) are registered normally.

#### `src/server.ts`

Standalone entry point. Zero Electron imports.

```typescript
import './adapter/standalone'; // sets up bridge adapter (must load before bridges)
import { initBridgeStandalone } from './process/initBridgeStandalone';
import { startWebServerWithInstance } from './webserver';
import { initStorage } from './process/initStorage';

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const ALLOW_REMOTE = process.env.ALLOW_REMOTE === 'true';

// Initialize storage paths (uses DATA_DIR env var in standalone mode — see Storage section)
initStorage();
initBridgeStandalone();

const instance = await startWebServerWithInstance(PORT, ALLOW_REMOTE);

// Graceful shutdown
const shutdown = () => {
  instance.wss.clients.forEach((ws) => ws.close(1000, 'Server shutting down'));
  instance.server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

> **Top-level await:** `bun run` and `bun build --target node` both support top-level await natively. When running the built output with plain `node`, ensure Node.js 18+ is used with an ESM entry point or wrap in an async IIFE if targeting CommonJS output.

#### `Dockerfile`

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY . .
RUN npm install -g bun && bun install --production
RUN bun build src/server.ts --outdir dist-server --target node

ENV PORT=3000
ENV ALLOW_REMOTE=true
VOLUME ["/data"]
EXPOSE 3000

CMD ["node", "dist-server/server.js"]
```

SQLite database path respects the existing `initStorage` logic (uses `DATA_DIR` env var or default `~/.aionui`). Mount `/data` and set `DATA_DIR=/data` for persistence.

---

### Modified Files (3)

#### `src/adapter/main.ts` — minor refactor

Move `webSocketBroadcasters`, `bridgeEmitter`, `registerWebSocketBroadcaster`, and `getBridgeEmitter` to `registry.ts`. Import them back. All existing behavior unchanged.

**Change size:** ~15 lines moved, 1 import added.

#### `src/webserver/adapter.ts` — 1-line change

```diff
- import { registerWebSocketBroadcaster, getBridgeEmitter } from '../adapter/main'
+ import { registerWebSocketBroadcaster, getBridgeEmitter } from '../adapter/registry'
```

#### `src/webserver/index.ts` — extract QR helpers (CRITICAL)

`webserver/index.ts` currently has a static import:

```typescript
import { generateQRLoginUrlDirect } from '@/process/bridge/webuiBridge';
```

`webuiBridge.ts` has `import { ipcMain } from 'electron'` at the top level. This means loading `webserver/index.ts` in standalone mode will crash immediately.

**Fix:** Extract `generateQRLoginUrlDirect` and `verifyQRTokenDirect` (the two functions that contain no Electron code) from `webuiBridge.ts` into a new shared file:

```
src/process/bridge/webuiQR.ts   ← new, no Electron imports
  exports: generateQRLoginUrlDirect, verifyQRTokenDirect, setWebServerInstance, getWebServerInstance
```

Then:

- `webserver/index.ts` imports from `webuiQR.ts` instead of `webuiBridge.ts`
- `webuiBridge.ts` imports `generateQRLoginUrlDirect` / `verifyQRTokenDirect` from `webuiQR.ts`

This adds 1 new file and changes 2 import lines.

#### `src/process/initStorage.ts` — standalone storage path

`initStorage.ts` has `import { app } from 'electron'` at the top level. In standalone mode, `app` is unavailable.

**Fix:** Wrap the Electron `app.getPath()` call with the existing `getElectronPathOrFallback` utility already present in `src/process/utils.ts`. The fallback resolves to `os.tmpdir()/aionui-user-data`.

For Docker deployments where a persistent volume is needed, add `DATA_DIR` env var support to `initStorage.ts`:

```typescript
const userDataPath = process.env.DATA_DIR ?? getElectronPathOrFallback('userData', 'aionui-user-data');
```

The Dockerfile mounts `/data` and sets `DATA_DIR=/data`.

#### `package.json` — add scripts

```json
{
  "scripts": {
    "server": "bun run src/server.ts",
    "build:server": "bun build src/server.ts --outdir dist-server --target node"
  }
}
```

---

## Usage

**Local development (no Electron):**

```bash
PORT=3000 bun run server
# Open http://localhost:3000
```

**With remote access:**

```bash
PORT=3000 ALLOW_REMOTE=true bun run server
```

**Docker:**

```bash
docker build -t aionui-server .
docker run -p 3000:3000 -v $(pwd)/data:/data -e DATA_DIR=/data aionui-server
```

---

## What Stays Unchanged

- `src/adapter/browser.ts` — zero changes
- `src/adapter/main.ts` — behavior unchanged, only shared state extracted to `registry.ts`
- `src/webserver/adapter.ts` — 1-line import change only
- All worker processes — zero changes
- Electron app startup path — zero changes
- All non-Electron bridge files not in the skip list — zero changes

---

## Out of Scope

- Replacing stubbed bridges (`dialog`, `shell`, `notification`, etc.) with Node.js alternatives
- Multi-user support or role-based access (existing JWT auth is sufficient)
- TLS/HTTPS termination (delegate to a reverse proxy like nginx)

---

## Testing Plan

- [ ] `bun run server` starts and serves the WebUI at `http://localhost:3000`
- [ ] Browser can connect, authenticate (password login + QR login), and send AI messages
- [ ] Streaming AI responses arrive in the browser
- [ ] Existing Electron app still launches and works normally (no regression)
- [ ] `docker build` succeeds and container serves the WebUI
- [ ] `docker stop` triggers graceful shutdown without corrupting SQLite
- [ ] Unit test: `adapter/standalone.ts` dispatches messages through EventEmitter correctly
- [ ] Import graph check: `src/server.ts` and its transitive imports contain zero `electron` references
- [ ] `DATA_DIR=/tmp/test bun run server` uses the correct storage path

---

## Known Risks

| Risk                                                                                                 | Mitigation                                                                                                           |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `bridge.adapter()` called twice if both `main.ts` and `standalone.ts` are loaded                     | `server.ts` must never import `adapter/main.ts`; add a lint rule or comment guard                                    |
| Additional Electron imports discovered in bridges not yet audited (e.g., `geminiConversationBridge`) | Run `grep -r "from 'electron'" src/process/bridge/` before implementation and add any found bridges to the skip list |
| `mcpBridge` is currently skipped — MCP tools unavailable in standalone mode                          | Acceptable for MVP; can be enabled later once `McpProtocol.ts` removes its Electron dependency                       |
| `cronBridge` is currently skipped — scheduled tasks unavailable in standalone mode                   | Acceptable for MVP; requires `CronService` to remove `powerSaveBlocker` dependency                                   |
