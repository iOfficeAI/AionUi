# WebServer Standalone Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Allow the WebServer to run as a standalone Node.js process (no Electron) so it can be deployed on a Linux server / VPS or started locally without the desktop app.

**Architecture:** Add `src/common/adapter/standalone.ts` using Node.js `EventEmitter` as the bridge transport, extract shared broadcaster/emitter state into `src/common/adapter/registry.ts`, and create `src/server.ts` as the standalone entry point. The frontend `browser.ts` requires zero changes — it already falls back to WebSocket mode when `window.electronAPI` is absent.

**Tech Stack:** Node.js 20+, Bun, TypeScript, EventEmitter, Express, ws, better-sqlite3, Docker

---

## Path Changes from PR#1583

PR#1583 (refactor/process-structure) reorganised the source tree. All paths in this plan reflect the **current** structure after that merge:

| Old path (pre-PR#1583)       | New path (current)                 |
| ---------------------------- | ---------------------------------- |
| `src/adapter/main.ts`        | `src/common/adapter/main.ts`       |
| `src/adapter/browser.ts`     | `src/common/adapter/browser.ts`    |
| `src/webserver/`             | `src/process/webserver/`           |
| `src/worker/`                | `src/process/worker/`              |
| `src/process/initBridge.ts`  | `src/process/utils/initBridge.ts`  |
| `src/process/initStorage.ts` | `src/process/utils/initStorage.ts` |
| `src/process/utils.ts`       | `src/process/utils/utils.ts`       |
| `src/process/database/`      | `src/process/services/database/`   |

Path aliases (tsconfig + electron.vite.config.ts):

- `@/` → `src/`
- `@process/` → `src/process/`
- `@worker/` → `src/process/worker/`

---

## File Map

| File                                        | Action     | Purpose                                                                                                          |
| ------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------- |
| `src/common/adapter/registry.ts`            | **Create** | Shared broadcaster list + bridge emitter ref; zero Electron deps                                                 |
| `src/common/adapter/standalone.ts`          | **Create** | EventEmitter bridge adapter; replaces `ipcMain` for standalone mode                                              |
| `src/process/bridge/webuiQR.ts`             | **Create** | QR helpers extracted from `webuiBridge.ts`; zero Electron deps                                                   |
| `src/process/utils/initBridgeStandalone.ts` | **Create** | Bridge initialiser that skips 10 Electron-only bridges                                                           |
| `src/server.ts`                             | **Create** | Standalone entry point: reads env vars, inits storage + bridges, starts server                                   |
| `Dockerfile`                                | **Create** | node:20-slim image; bun build; VOLUME /data; EXPOSE 3000                                                         |
| `src/common/adapter/main.ts`                | **Modify** | Move `webSocketBroadcasters`, `bridgeEmitter`, helpers → `registry.ts`                                           |
| `src/process/webserver/adapter.ts`          | **Modify** | 1-line: import from `@/common/adapter/registry` not `@/common/adapter/main`                                      |
| `src/process/webserver/index.ts`            | **Modify** | 1-line: import `generateQRLoginUrlDirect` from `@process/bridge/webuiQR`                                         |
| `src/process/bridge/webuiBridge.ts`         | **Modify** | Import QR helpers from `./webuiQR` instead of defining them locally                                              |
| `src/process/utils/initStorage.ts`          | **Modify** | Guard `app.getAppPath()`/`app.isPackaged`/`app.getPath('logs')`; add `DATA_DIR` env var; guard IPC provider call |
| `package.json`                              | **Modify** | Add `server` and `build:server` scripts                                                                          |

---

## Pre-implementation Audit

Before starting, run this to capture any additional Electron imports in bridges not yet audited:

```bash
grep -r "from 'electron'" src/process/bridge/ --include="*.ts" -l
```

Expected output (exactly these 8 files — all in the skip list):

```
src/process/bridge/webuiBridge.ts
src/process/bridge/notificationBridge.ts
src/process/bridge/dialogBridge.ts
src/process/bridge/shellBridge.ts
src/process/bridge/applicationBridge.ts
src/process/bridge/windowControlsBridge.ts
src/process/bridge/fsBridge.ts
src/process/bridge/updateBridge.ts
```

If any other bridge appears in that output, add it to the skip list in Task 6.

---

## Task 1: Create `src/common/adapter/registry.ts`

Extract shared WebSocket broadcaster registry and bridge emitter reference from `main.ts` into a new zero-Electron module.

**Files:**

- Create: `src/common/adapter/registry.ts`
- Create: `src/common/adapter/__tests__/registry.test.ts`

- [x] **Step 1.1: Write the failing tests**

```typescript
// src/common/adapter/__tests__/registry.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Reset module state between tests
const resetRegistry = async () => {
  vi.resetModules();
};

describe('registry', () => {
  it('registerWebSocketBroadcaster adds and removes broadcasters', async () => {
    const { registerWebSocketBroadcaster, broadcastToAll } = await import('../registry');
    const received: Array<{ name: string; data: unknown }> = [];
    const unregister = registerWebSocketBroadcaster((name, data) => received.push({ name, data }));
    broadcastToAll('test.event', { msg: 'hello' });
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ name: 'test.event', data: { msg: 'hello' } });
    unregister();
    broadcastToAll('test.event', { msg: 'world' });
    expect(received).toHaveLength(1); // no new calls after unregister
  });

  it('getBridgeEmitter returns null initially', async () => {
    const { getBridgeEmitter } = await import('../registry');
    expect(getBridgeEmitter()).toBeNull();
  });

  it('setBridgeEmitter + getBridgeEmitter round-trip', async () => {
    const { setBridgeEmitter, getBridgeEmitter } = await import('../registry');
    const fakeEmitter = { emit: (name: string, data: unknown) => undefined };
    setBridgeEmitter(fakeEmitter);
    expect(getBridgeEmitter()).toBe(fakeEmitter);
  });
});
```

- [x] **Step 1.2: Run tests — expect FAIL (module not found)**

```bash
bun run test src/common/adapter/__tests__/registry.test.ts
```

Expected: `Cannot find module '../registry'`

- [x] **Step 1.3: Create `src/common/adapter/registry.ts`**

```typescript
/**
 * Shared WebSocket broadcaster registry and bridge emitter reference.
 * No Electron imports — safe to use in both Electron main process and standalone mode.
 */

type WebSocketBroadcastFn = (name: string, data: unknown) => void;

const webSocketBroadcasters: WebSocketBroadcastFn[] = [];

let bridgeEmitter: { emit: (name: string, data: unknown) => unknown } | null = null;

/**
 * Register a WebSocket broadcast function.
 * Returns an unregister function.
 */
export function registerWebSocketBroadcaster(fn: WebSocketBroadcastFn): () => void {
  webSocketBroadcasters.push(fn);
  return () => {
    const idx = webSocketBroadcasters.indexOf(fn);
    if (idx > -1) webSocketBroadcasters.splice(idx, 1);
  };
}

/**
 * Broadcast a message to all registered WebSocket clients.
 */
export function broadcastToAll(name: string, data: unknown): void {
  for (const broadcast of webSocketBroadcasters) {
    try {
      broadcast(name, data);
    } catch (error) {
      console.error('[registry] WebSocket broadcast error:', error);
    }
  }
}

export function getBridgeEmitter(): typeof bridgeEmitter {
  return bridgeEmitter;
}

/**
 * Set the bridge emitter reference (called by adapter implementations).
 * net-new — no equivalent existed in main.ts.
 */
export function setBridgeEmitter(emitter: typeof bridgeEmitter): void {
  bridgeEmitter = emitter;
}
```

- [x] **Step 1.4: Run tests — expect PASS**

```bash
bun run test src/common/adapter/__tests__/registry.test.ts
```

- [x] **Step 1.5: Commit**

```bash
git add src/common/adapter/registry.ts src/common/adapter/__tests__/registry.test.ts
git commit -m "feat(adapter): add shared registry for WebSocket broadcasters and bridge emitter"
```

---

## Task 2: Refactor `src/common/adapter/main.ts` to use `registry.ts`

Remove the duplicate state definitions from `main.ts` and delegate to `registry.ts`. Behaviour is unchanged.

**Files:**

- Modify: `src/common/adapter/main.ts`

- [x] **Step 2.1: Run existing tests to establish baseline**

```bash
bun run test
```

Record current pass count.

- [x] **Step 2.2: Edit `src/common/adapter/main.ts`**

Replace the local `webSocketBroadcasters`, `bridgeEmitter`, `registerWebSocketBroadcaster`, and `getBridgeEmitter` definitions with imports from `./registry`. Keep all existing exports so callers are unaffected.

The diff is approximately:

```diff
 import type { BrowserWindow } from 'electron';
 import { ipcMain } from 'electron';
 import { bridge } from '@office-ai/platform';
 import { ADAPTER_BRIDGE_EVENT_KEY } from './constant';
+import { registerWebSocketBroadcaster, getBridgeEmitter, setBridgeEmitter, broadcastToAll } from './registry';

-type WebSocketBroadcastFn = (name: string, data: unknown) => void;
-const webSocketBroadcasters: WebSocketBroadcastFn[] = [];
-
-export function registerWebSocketBroadcaster(broadcastFn: WebSocketBroadcastFn): () => void {
-  webSocketBroadcasters.push(broadcastFn);
-  return () => { ... };
-}
-
-let bridgeEmitter: { emit: (name: string, data: unknown) => unknown } | null = null;
-
-export function getBridgeEmitter(): typeof bridgeEmitter {
-  return bridgeEmitter;
-}
+export { registerWebSocketBroadcaster, getBridgeEmitter };

 bridge.adapter({
   emit(name, data) {
     for (const win of adapterWindowList) {
       win.webContents.send(ADAPTER_BRIDGE_EVENT_KEY, JSON.stringify({ name, data }));
     }
-    for (const broadcast of webSocketBroadcasters) {
-      try { broadcast(name, data); } catch (error) { ... }
-    }
+    broadcastToAll(name, data);
   },
   on(emitter) {
-    bridgeEmitter = emitter;
+    setBridgeEmitter(emitter);
     ipcMain.handle(ADAPTER_BRIDGE_EVENT_KEY, (_event, info) => {
       const { name, data } = JSON.parse(info) as BridgeEventData;
       return Promise.resolve(emitter.emit(name, data));
     });
   },
 });
```

- [x] **Step 2.3: Run tests — expect same pass count (no regressions)**

```bash
bun run test && bunx tsc --noEmit
```

- [x] **Step 2.4: Commit**

```bash
git add src/common/adapter/main.ts
git commit -m "refactor(adapter): delegate broadcaster/emitter state to registry.ts"
```

---

## Task 3: Update `src/process/webserver/adapter.ts` — 1-line import change

Change the import source from `@/common/adapter/main` to `@/common/adapter/registry`.

**Files:**

- Modify: `src/process/webserver/adapter.ts`

- [x] **Step 3.1: Apply the 1-line change**

```diff
-import { registerWebSocketBroadcaster, getBridgeEmitter } from '@/common/adapter/main';
+import { registerWebSocketBroadcaster, getBridgeEmitter } from '@/common/adapter/registry';
```

> **Confirmed correct:** `adapter.ts` calls `getBridgeEmitter().emit(name, data)` directly (not `dispatchMessage`). Since `registry.ts` exports `getBridgeEmitter`, this 1-line import change is all that's needed. No additional `dispatchMessage` wiring required here.

- [x] **Step 3.2: Type-check**

```bash
bunx tsc --noEmit
```

Expected: 0 errors.

- [x] **Step 3.3: Commit**

```bash
git add src/process/webserver/adapter.ts
git commit -m "refactor(webserver): import broadcaster/emitter from registry instead of main adapter"
```

---

## Task 4: Extract QR helpers — create `src/process/bridge/webuiQR.ts`

`webserver/index.ts` statically imports `generateQRLoginUrlDirect` from `webuiBridge.ts`, which has `import { ipcMain } from 'electron'` at the top level. This crashes the standalone server. Fix: extract the two pure functions into a new Electron-free file.

**Files:**

- Create: `src/process/bridge/webuiQR.ts`
- Modify: `src/process/bridge/webuiBridge.ts`
- Modify: `src/process/webserver/index.ts`

- [x] **Step 4.1: Write tests for the extracted functions**

```typescript
// src/process/bridge/__tests__/webuiQR.test.ts
import { describe, it, expect } from 'vitest';
import { generateQRLoginUrlDirect, verifyQRTokenDirect } from '../webuiQR';

describe('generateQRLoginUrlDirect', () => {
  it('returns a qrUrl and expiresAt', () => {
    const result = generateQRLoginUrlDirect(3000, false);
    expect(result.qrUrl).toMatch(/^http:\/\/localhost:3000\/qr-login\?token=/);
    expect(result.expiresAt).toBeGreaterThan(Date.now());
  });

  it('uses LAN IP when allowRemote=true and LAN IP available', () => {
    // getLanIP may return null in CI — just verify the shape is correct
    const result = generateQRLoginUrlDirect(3000, true);
    expect(result.qrUrl).toMatch(/\/qr-login\?token=/);
  });
});

describe('verifyQRTokenDirect', () => {
  it('rejects an unknown token', async () => {
    const result = await verifyQRTokenDirect('bad-token');
    expect(result.success).toBe(false);
  });

  it('accepts a freshly generated token', async () => {
    const { qrUrl } = generateQRLoginUrlDirect(3000, false);
    const token = new URL(qrUrl).searchParams.get('token')!;
    const result = await verifyQRTokenDirect(token, '127.0.0.1');
    expect(result.success).toBe(true);
    expect(result.data?.sessionToken).toBeTruthy();
  });

  it('rejects a token used twice', async () => {
    const { qrUrl } = generateQRLoginUrlDirect(3000, false);
    const token = new URL(qrUrl).searchParams.get('token')!;
    await verifyQRTokenDirect(token, '127.0.0.1');
    const second = await verifyQRTokenDirect(token, '127.0.0.1');
    expect(second.success).toBe(false);
  });
});
```

- [x] **Step 4.2: Run tests — expect FAIL**

```bash
bun run test src/process/bridge/__tests__/webuiQR.test.ts
```

Expected: `Cannot find module '../webuiQR'`

- [x] **Step 4.3: Create `src/process/bridge/webuiQR.ts`**

Move the following code **verbatim** from `webuiBridge.ts` into this new file (no Electron imports needed):

- The `qrTokenStore` map and `QR_TOKEN_EXPIRY` constant
- `generateQRLoginUrlDirect()`
- `verifyQRTokenDirect()`
- `isLocalIP()` (private helper)
- `cleanupExpiredTokens()` (private helper)
- The `WebuiService` import (for `getLanIP`)
- The `AuthService` / `UserRepository` imports (used in `verifyQRTokenDirect`)

> **Note:** `setWebServerInstance` and `getWebServerInstance` are also in `webuiBridge.ts` but are **not** used by `webserver/index.ts` — leave them in `webuiBridge.ts`. Only the two QR functions need to move.

The file must NOT import anything from `'electron'`.

Template:

```typescript
/**
 * QR login helpers — no Electron imports.
 * Shared between webuiBridge.ts (Electron mode) and webserver/index.ts (standalone mode).
 */
import crypto from 'crypto';
import { AuthService } from '@process/webserver/auth/service/AuthService';
import { UserRepository } from '@process/webserver/auth/repository/UserRepository';
import { SERVER_CONFIG } from '@process/webserver/config/constants';
import { WebuiService } from './services/WebuiService';

const qrTokenStore = new Map<string, { expiresAt: number; used: boolean; allowLocalOnly: boolean }>();
const QR_TOKEN_EXPIRY = 5 * 60 * 1000;

// ... (paste cleanupExpiredTokens, isLocalIP, generateQRLoginUrlDirect, verifyQRTokenDirect)

export { generateQRLoginUrlDirect, verifyQRTokenDirect };
```

- [x] **Step 4.4: Update `webuiBridge.ts`** — replace the local definitions with an import from `./webuiQR`:

```diff
+import { generateQRLoginUrlDirect, verifyQRTokenDirect } from './webuiQR'

-const qrTokenStore = ...
-const QR_TOKEN_EXPIRY = ...
-function cleanupExpiredTokens() { ... }
-function isLocalIP() { ... }
-export function generateQRLoginUrlDirect(...) { ... }
-export async function verifyQRTokenDirect(...) { ... }
+export { generateQRLoginUrlDirect, verifyQRTokenDirect }
```

`webuiBridge.ts` still re-exports these so the Electron IPC path (`authRoutes.ts` calling via IPC) continues to work unchanged.

- [x] **Step 4.5: Update `src/process/webserver/index.ts`** — 1-line import change:

```diff
-import { generateQRLoginUrlDirect } from '@process/bridge/webuiBridge';
+import { generateQRLoginUrlDirect } from '@process/bridge/webuiQR';
```

- [x] **Step 4.6: Run tests and type-check**

```bash
bun run test src/process/bridge/__tests__/webuiQR.test.ts
bunx tsc --noEmit
```

- [x] **Step 4.7: Commit**

```bash
git add src/process/bridge/webuiQR.ts src/process/bridge/webuiBridge.ts src/process/webserver/index.ts src/process/bridge/__tests__/webuiQR.test.ts
git commit -m "feat(bridge): extract QR login helpers to webuiQR.ts (no Electron deps)"
```

---

## Task 5: Create `src/common/adapter/standalone.ts`

The standalone bridge adapter: uses Node.js `EventEmitter` in place of `ipcMain`.

**Files:**

- Create: `src/common/adapter/standalone.ts`
- Create: `src/common/adapter/__tests__/standalone.test.ts`

> **Critical constraint:** `bridge.adapter()` is called once at module-load time. `standalone.ts` and `main.ts` must **never both be imported in the same process**. `server.ts` (standalone entry) must never import `main.ts`.

- [x] **Step 5.1: Write tests**

```typescript
// src/common/adapter/__tests__/standalone.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @office-ai/platform bridge before importing standalone
vi.mock('@office-ai/platform', () => ({
  bridge: {
    adapter: vi.fn(({ emit, on }) => {
      // Simulate bridge calling on() with a fake emitter ref
      const fakeEmitter = {
        emit: vi.fn((name: string, data: unknown) => ({ name, data })),
      };
      on(fakeEmitter);
    }),
  },
}));

// Mock registry
const mockBroadcastToAll = vi.fn();
const mockSetBridgeEmitter = vi.fn();
vi.mock('../registry', () => ({
  broadcastToAll: mockBroadcastToAll,
  setBridgeEmitter: mockSetBridgeEmitter,
}));

describe('standalone adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('calls setBridgeEmitter on load', async () => {
    await import('../standalone');
    expect(mockSetBridgeEmitter).toHaveBeenCalledOnce();
  });

  it('dispatchMessage routes through EventEmitter to bridge emitter', async () => {
    const { dispatchMessage } = await import('../standalone');
    // setBridgeEmitter was called with fakeEmitter — get it
    const fakeEmitter = mockSetBridgeEmitter.mock.calls[0][0] as { emit: ReturnType<typeof vi.fn> };
    dispatchMessage('conv.message', { text: 'hello' });
    // Allow microtask queue to flush
    await new Promise((r) => setTimeout(r, 0));
    expect(fakeEmitter.emit).toHaveBeenCalledWith('conv.message', { text: 'hello' });
  });
});
```

- [x] **Step 5.2: Run tests — expect FAIL**

```bash
bun run test src/common/adapter/__tests__/standalone.test.ts
```

- [x] **Step 5.3: Create `src/common/adapter/standalone.ts`**

```typescript
/**
 * Standalone bridge adapter — uses Node.js EventEmitter instead of ipcMain.
 * Import this module ONLY in the standalone entry point (src/server.ts).
 * Never import alongside src/common/adapter/main.ts in the same process.
 */
import { EventEmitter } from 'events';
import { bridge } from '@office-ai/platform';
import { broadcastToAll, setBridgeEmitter } from './registry';

const internalEmitter = new EventEmitter();
internalEmitter.setMaxListeners(100);

bridge.adapter({
  emit(name, data) {
    // Broadcast to all connected WebSocket clients
    broadcastToAll(name, data);
  },
  on(bridgeEmitterRef) {
    // Persist reference so webserver/adapter.ts can route incoming WS messages
    setBridgeEmitter(bridgeEmitterRef);
    // Route messages dispatched via dispatchMessage() into the bridge handlers
    internalEmitter.on('message', ({ name, data }: { name: string; data: unknown }) => {
      bridgeEmitterRef.emit(name, data);
    });
  },
});

/**
 * Called by webserver/adapter.ts for each incoming WebSocket message.
 * Routes the message through the internal EventEmitter into the bridge handlers.
 */
export function dispatchMessage(name: string, data: unknown): void {
  internalEmitter.emit('message', { name, data });
}
```

- [x] **Step 5.4: Run tests — expect PASS**

```bash
bun run test src/common/adapter/__tests__/standalone.test.ts
bunx tsc --noEmit
```

- [x] **Step 5.5: Commit**

```bash
git add src/common/adapter/standalone.ts src/common/adapter/__tests__/standalone.test.ts
git commit -m "feat(adapter): add standalone EventEmitter bridge adapter"
```

---

## Task 6: Create `src/process/utils/initBridgeStandalone.ts`

Bridge initialiser for standalone mode. Identical structure to `initBridge.ts` but skips 10 Electron-only bridges.

**Files:**

- Create: `src/process/utils/initBridgeStandalone.ts`

**Bridges to skip (Electron-specific):**
| Bridge | Reason |
|--------|--------|
| `dialogBridge` | `dialog.showOpenDialog` |
| `shellBridge` | `shell.openExternal` |
| `windowControlsBridge` | `BrowserWindow` |
| `updateBridge` | `autoUpdater` |
| `notificationBridge` | `Notification` |
| `webuiBridge` | `ipcMain.handle` — server started directly, not via IPC |
| `fsBridge` | `app.getPath('userData')` at top level |
| `applicationBridge` | `app.relaunch()` / `app.exit()` / `app.getPath()` |
| `cronBridge` | `CronService` → `powerSaveBlocker` |
| `mcpBridge` | `McpProtocol` → `app.getPath()` |

- [x] **Step 6.1: Create `src/process/utils/initBridgeStandalone.ts`**

Model this directly on `initBridge.ts`, keeping identical dependency wiring but omitting the 10 skipped bridges and the `cronService.init()` call:

```typescript
/**
 * Bridge initialiser for standalone (no-Electron) mode.
 * Skips 10 Electron-only bridges — see docs/superpowers/specs/2026-03-20-webserver-standalone-design.md
 */
import { logger } from '@office-ai/platform';
import { SqliteChannelRepository } from '@process/services/database/SqliteChannelRepository';
import { SqliteConversationRepository } from '@process/services/database/SqliteConversationRepository';
import { ConversationServiceImpl } from '@process/services/ConversationServiceImpl';
import { workerTaskManager } from '@process/task/workerTaskManagerSingleton';
import { initAcpConversationBridge } from '@process/bridge/acpConversationBridge';
import { initAuthBridge } from '@process/bridge/authBridge';
import { initBedrockBridge } from '@process/bridge/bedrockBridge';
import { initChannelBridge } from '@process/bridge/channelBridge';
import { initConversationBridge } from '@process/bridge/conversationBridge';
import { initDatabaseBridge } from '@process/bridge/databaseBridge';
import { initDocumentBridge } from '@process/bridge/documentBridge';
import { initExtensionsBridge } from '@process/bridge/extensionsBridge';
import { initFileWatchBridge } from '@process/bridge/fileWatchBridge';
import { initGeminiBridge } from '@process/bridge/geminiBridge';
import { initGeminiConversationBridge } from '@process/bridge/geminiConversationBridge';
import { initModelBridge } from '@process/bridge/modelBridge';
import { initPreviewHistoryBridge } from '@process/bridge/previewHistoryBridge';
import { initStarOfficeBridge } from '@process/bridge/starOfficeBridge';
import { initSystemSettingsBridge } from '@process/bridge/systemSettingsBridge';
import { initTaskBridge } from '@process/bridge/taskBridge';

logger.config({ print: true });

export function initBridgeStandalone(): void {
  const repo = new SqliteConversationRepository();
  const conversationService = new ConversationServiceImpl(repo);
  const channelRepo = new SqliteChannelRepository();

  // Skipped (Electron-only): dialogBridge, shellBridge, fsBridge, applicationBridge,
  // windowControlsBridge, updateBridge, webuiBridge, notificationBridge, cronBridge, mcpBridge

  initFileWatchBridge();
  initConversationBridge(conversationService, workerTaskManager);
  initGeminiConversationBridge(workerTaskManager);
  initGeminiBridge();
  initBedrockBridge();
  initAcpConversationBridge(workerTaskManager);
  initAuthBridge();
  initModelBridge();
  initPreviewHistoryBridge();
  initDocumentBridge();
  initChannelBridge(channelRepo);
  initDatabaseBridge(repo);
  initExtensionsBridge(repo, workerTaskManager);
  initSystemSettingsBridge();
  initTaskBridge(workerTaskManager);
  initStarOfficeBridge();
}
```

- [x] **Step 6.2: Type-check**

```bash
bunx tsc --noEmit
```

Expected: 0 errors. If any skipped bridge import was accidentally included and has Electron deps, a runtime crash will occur — verify with the import graph check in Task 9.

- [x] **Step 6.3: Commit**

```bash
git add src/process/utils/initBridgeStandalone.ts
git commit -m "feat(process): add initBridgeStandalone — bridge init without Electron-only bridges"
```

---

## Task 7: Update `src/process/utils/initStorage.ts` — guard Electron calls

`initStorage.ts` has `import { app } from 'electron'` at the top level. In a plain Node.js environment, `electron` npm package resolves to a path string (not the Electron runtime), so `app` will be `undefined`. Calls like `app.getAppPath()` and `app.getPath('logs')` will throw `TypeError`.

The existing `src/process/utils/utils.ts` already exports `hasElectronAppPath()` which guards against this case.

**Files:**

- Modify: `src/process/utils/initStorage.ts`

**Changes needed:**

1. **`initBuiltinAssistantRules()`** — guard with `hasElectronAppPath()`. In standalone/server mode, builtin assistant rules aren't copied from the app bundle (there is no packaged app). Skip gracefully:

```diff
+import { hasElectronAppPath } from './utils'

 const initBuiltinAssistantRules = async (): Promise<void> => {
+  if (!hasElectronAppPath()) {
+    // Standalone mode: no packaged app bundle to copy rules from
+    return
+  }
   const assistantsDir = getAssistantsDir()
   ...
```

2. **`getSystemDir()`** — guard `app.getPath('logs')`:

```diff
 export const getSystemDir = () => {
-  const logDir = path.join(app.getPath('logs'))
+  const logDir = hasElectronAppPath()
+    ? path.join(app.getPath('logs'))
+    : path.join(os.tmpdir(), 'aionui-logs')
   return {
     cacheDir,
     workDir: dirConfig?.workDir || getDataPath(),
     logDir,
     ...
   }
 }
```

3. **`application.systemInfo.provider(...)` at end of `initStorage()`** — this registers an IPC handler via `ipcBridge`. In standalone mode this call should be skipped:

```diff
+  if (hasElectronAppPath()) {
     application.systemInfo.provider(() => {
       return Promise.resolve(getSystemDir())
     })
+  }
```

4. **`DATA_DIR` env var support** — the path functions `getConfigPath()` / `getDataPath()` in `utils.ts` already call `getElectronPathOrFallback('userData')` which falls back to `os.tmpdir()/aionui-user-data`. Add env var override at the top of `initStorage.ts`:

Check if `utils.ts` already reads `process.env.DATA_DIR`. If not, add it:

```typescript
// In utils.ts getElectronPathOrFallback, the 'userData' case becomes:
case 'userData':
  return process.env.DATA_DIR ?? path.join(os.tmpdir(), getEnvAwareName('aionui-user-data'))
```

> **Note:** If `DATA_DIR` override is more cleanly added in `utils.ts` rather than `initStorage.ts`, do it there — the important thing is `getConfigPath()` respects `DATA_DIR`.

- [x] **Step 7.1: Read current `src/process/utils/initStorage.ts` and `src/process/utils/utils.ts`** to understand current state before editing.

- [x] **Step 7.2: Apply the three guards to `initStorage.ts`** (and optionally the DATA_DIR change to `utils.ts`) as described above.

- [x] **Step 7.3: Run existing tests**

```bash
bun run test && bunx tsc --noEmit
```

Expected: same pass count, 0 TS errors.

- [x] **Step 7.4: Commit**

```bash
git add src/process/utils/initStorage.ts src/process/utils/utils.ts
git commit -m "fix(storage): guard Electron-only calls and add DATA_DIR env var support"
```

---

## Task 8: Create `src/server.ts` — standalone entry point

**Files:**

- Create: `src/server.ts`

- [x] **Step 8.1: Create `src/server.ts`**

```typescript
/**
 * Standalone entry point — runs the WebServer without Electron.
 *
 * IMPORTANT: Do NOT import src/common/adapter/main.ts anywhere in this file's
 * import tree. main.ts calls bridge.adapter() at load time; importing both
 * main.ts and standalone.ts in the same process would silently break the bridge.
 */

// Must be first import — calls bridge.adapter() at module load time
import './common/adapter/standalone';

import { initBridgeStandalone } from './process/utils/initBridgeStandalone';
import { startWebServerWithInstance } from './process/webserver';
import initStorage from './process/utils/initStorage';

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const ALLOW_REMOTE = process.env.ALLOW_REMOTE === 'true';

// Initialize storage (respects DATA_DIR env var)
await initStorage();

// Register all non-Electron bridge handlers
initBridgeStandalone();

// Start the WebServer
const instance = await startWebServerWithInstance(PORT, ALLOW_REMOTE);

console.log(`[server] WebUI running on http://${ALLOW_REMOTE ? '0.0.0.0' : 'localhost'}:${PORT}`);

// Graceful shutdown
const shutdown = () => {
  console.log('[server] Shutting down...');
  instance.wss.clients.forEach((ws) => ws.close(1000, 'Server shutting down'));
  instance.server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

> **Top-level `await`:** Bun natively supports top-level await in ESM modules. Node.js 18+ also supports it in `.mjs` files. The `bun build --target node` output handles this correctly.

- [x] **Step 8.2: Type-check**

```bash
bunx tsc --noEmit
```

- [x] **Step 8.3: Commit**

```bash
git add src/server.ts
git commit -m "feat: add standalone server entry point (src/server.ts)"
```

---

## Task 9: Add `package.json` scripts

**Files:**

- Modify: `package.json`

- [x] **Step 9.1: Add scripts**

In the `"scripts"` section of `package.json`, add:

```json
"server": "bun run src/server.ts",
"build:server": "bun build src/server.ts --outdir dist-server --target node"
```

- [x] **Step 9.2: Commit**

```bash
git add package.json
git commit -m "chore: add server and build:server npm scripts"
```

---

## Task 10: Create `Dockerfile`

**Files:**

- Create: `Dockerfile`

- [x] **Step 10.1: Create `Dockerfile`**

```dockerfile
FROM node:20-slim
WORKDIR /app

# Install bun
RUN npm install -g bun

# Copy source and install production dependencies
COPY package.json bun.lockb ./
RUN bun install --production

# Copy remaining source
COPY . .

# Build standalone server bundle
RUN bun build src/server.ts --outdir dist-server --target node

ENV PORT=3000
ENV ALLOW_REMOTE=true

# SQLite data volume — mount with: -v $(pwd)/data:/data -e DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 3000

CMD ["node", "dist-server/server.js"]
```

- [x] **Step 10.2: Commit**

```bash
git add Dockerfile
git commit -m "feat: add Dockerfile for standalone server deployment"
```

---

## Task 11: Import graph verification

Verify that `src/server.ts` and its entire transitive import tree contain no `electron` references.

**Files:**

- Read: (no file changes)

- [x] **Step 11.1: Run import audit**

```bash
# Check direct + transitive electron imports reachable from server.ts
# (rough check — inspect any hits manually)
grep -r "from 'electron'" src/common/adapter/registry.ts src/common/adapter/standalone.ts src/process/utils/initBridgeStandalone.ts src/server.ts 2>/dev/null
```

Expected: **no output** (zero matches).

- [x] **Step 11.2: Verify webuiQR.ts has no electron imports**

```bash
grep "from 'electron'" src/process/bridge/webuiQR.ts
```

Expected: no output.

- [x] **Step 11.3: Full audit of all new/modified files**

```bash
grep -r "from 'electron'" \
  src/common/adapter/registry.ts \
  src/common/adapter/standalone.ts \
  src/process/bridge/webuiQR.ts \
  src/process/utils/initBridgeStandalone.ts \
  src/server.ts
```

Expected: **zero matches**.

---

## Task 12: Smoke test — run the standalone server

- [x] **Step 12.1: Start the server**

```bash
PORT=3000 bun run server
```

Expected output:

```
[server] WebUI running on http://localhost:3000
```

No crash on startup.

- [x] **Step 12.2: Verify the WebUI is accessible**

Open `http://localhost:3000` in a browser. Expected: the login page loads.

- [x] **Step 12.3: Verify login flow works**

Log in with the admin password printed in the console on first start. Expected: chat UI loads and connects via WebSocket.

- [x] **Step 12.4: Verify Electron app still works (no regression)**

```bash
bun run start
```

Expected: Electron desktop app starts normally; all existing features work.

- [x] **Step 12.5: Run full test suite**

```bash
bun run test
```

Expected: same or higher pass count as before this feature branch.

---

## Task 13: Test with DATA_DIR env var

- [x] **Step 13.1: Start server with custom data dir**

```bash
DATA_DIR=/tmp/aionui-test PORT=3001 bun run server
```

- [x] **Step 13.2: Verify data directory is used**

```bash
ls /tmp/aionui-test/
```

Expected: SQLite database file (`.db`) and config files present.

---

## Task 14: Docker build verification

- [x] **Step 14.1: Build Docker image**

```bash
docker build -t aionui-server .
```

Expected: build succeeds (no errors).

- [x] **Step 14.2: Run Docker container**

```bash
docker run -p 3000:3000 -v $(pwd)/docker-data:/data -e DATA_DIR=/data aionui-server
```

Expected: server starts, WebUI accessible at `http://localhost:3000`.

- [x] **Step 14.3: Verify graceful shutdown**

```bash
docker stop <container_id>
```

Expected: `[server] Shutting down...` in logs; SQLite not corrupted.

---

## Testing Checklist

Before marking this feature complete:

- [x] `bun run test` — all tests pass (≥80% coverage maintained)
- [x] `bunx tsc --noEmit` — 0 TypeScript errors
- [x] `bun run lint:fix` — 0 lint errors
- [x] `bun run server` — WebUI loads at `http://localhost:3000`
- [x] `bun run start` — Electron app still works (no regression)
- [x] Import audit passes (Task 11 — zero electron refs in standalone path)
- [x] Docker build and run succeed (Task 14)

---

## Known Risks and Mitigations

| Risk                                                                                   | Mitigation                                                                                   |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `bridge.adapter()` called twice if `main.ts` and `standalone.ts` both loaded           | `server.ts` must never import `main.ts`; guard comment in both files                         |
| Additional Electron imports in bridges not yet audited                                 | Run pre-implementation audit (see top of plan); add any found bridges to skip list in Task 6 |
| `mcpBridge` unavailable in standalone — MCP tools not usable                           | Acceptable for MVP; can be enabled later once `McpProtocol.ts` removes `app.getPath()`       |
| `cronBridge` unavailable — scheduled tasks not usable                                  | Acceptable for MVP; requires `CronService` to remove `powerSaveBlocker`                      |
| `initBuiltinAssistantRules()` skipped in standalone — builtin assistant configs absent | Acceptable; server users configure assistants manually                                       |
