# Platform Services Interface — Design Spec

**Date**: 2026-03-20
**Branch**: feat/webserver-standalone
**Status**: Approved (post-review)

---

## 1. Background & Problem

The standalone WebServer (`src/server.ts`) cannot run in a pure Node.js / Docker environment because multiple modules in `src/process/` contain static imports from `electron` (or references to `electronSafe.ts` exports that ultimately depend on runtime Electron objects). Even after creating `src/common/electronSafe.ts` as a runtime shim, the pattern is fragile:

- It is not clear from reading a file whether it is safe to load in standalone mode.
- Each new module that needs an Electron API must remember to use the shim.
- There is no compile-time or lint-time boundary to enforce the separation.

The immediate blocker is that the AI worker process spawner (`ForkTask`) uses `utilityProcess.fork` which only exists inside Electron, so the standalone server cannot launch any AI agent workers.

---

## 2. Goal

Introduce a **Platform Services** abstraction layer so that:

1. All Electron-specific capabilities are accessed through a single interface, never imported directly.
2. Two concrete implementations exist: one backed by Electron, one backed by plain Node.js.
3. The correct implementation is injected once at process startup (same pattern as `bridge.adapter()`).
4. The standalone WebServer can run with full AI agent functionality using the Node.js implementation.

### Out of Scope

- `Tray` / `Menu` / `nativeImage` — pure desktop UI, never reachable from webserver. `tray.ts` continues using `electronSafe.ts` directly.
- `BrowserWindow` (hidden window PDF conversion in `conversionService.ts`) — the conversion bridge handler is registered as a no-op in standalone mode; no interface abstraction needed.

---

## 3. Architecture

### 3.1 File Structure

```
src/common/platform/
  IPlatformServices.ts          <- interface definitions (no runtime code)
  ElectronPlatformServices.ts   <- Electron implementation
  NodePlatformServices.ts       <- Node.js / standalone implementation
  index.ts                      <- register / get singleton
```

### 3.2 Interfaces

```typescript
// src/common/platform/IPlatformServices.ts

/**
 * Path resolution and app metadata — replaces all app.getPath() /
 * app.getAppPath() / app.getName() / app.getVersion() calls.
 */
export interface IPlatformPaths {
  /** Persistent user data directory (equivalent to app.getPath('userData')). */
  getDataDir(): string;
  /** OS temp directory. */
  getTempDir(): string;
  /** User home directory. */
  getHomeDir(): string;
  /**
   * Application log directory.
   * In standalone mode respects LOGS_DIR env var, falls back to <tmpdir>/aionui-logs.
   */
  getLogsDir(): string;
  /**
   * Root path of the application bundle.
   * Returns null in standalone mode (no bundle concept).
   */
  getAppPath(): string | null;
  /**
   * True when running from a packaged Electron build.
   * In standalone mode controlled by IS_PACKAGED env var (default false).
   */
  isPackaged(): boolean;
  /**
   * Well-known system paths exposed to the renderer (desktop, home, downloads).
   * Returns null in standalone mode.
   */
  getSystemPath(name: 'desktop' | 'home' | 'downloads'): string | null;
  /** Application name (used for MCP client identification). */
  getName(): string;
  /** Application version string (used for MCP client identification). */
  getVersion(): string;
}

/**
 * A running worker child process.
 *
 * Covers the exact subset of Electron.UtilityProcess / Node.js ChildProcess
 * APIs used by ForkTask:
 *   - postMessage({ type, data, ...extPrams }) — ForkTask builds the full
 *     message object before passing to this method.
 *   - on('message', handler) — handler receives the raw object from the child.
 *   - on('error', handler)
 *   - on('exit', handler) — emitted when the child process ends.
 *   - kill()
 *
 * When migrating ForkTask, the field `fcp: UtilityProcess | undefined`
 * must be changed to `fcp: IWorkerProcess | undefined`.
 */
export interface IWorkerProcess {
  postMessage(message: unknown): void;
  on(event: 'message', handler: (data: unknown) => void): this;
  on(event: 'error', handler: (err: Error) => void): this;
  on(event: 'exit', handler: (code: number | null) => void): this;
  kill(): void;
}

/**
 * Worker process factory — replaces utilityProcess.fork() / child_process.fork().
 */
export interface IWorkerProcessFactory {
  fork(modulePath: string, args: string[], options: { cwd?: string; env?: Record<string, string> }): IWorkerProcess;
}

/**
 * System sleep/suspension control — replaces powerSaveBlocker.
 * In standalone mode all methods are no-ops.
 *
 * Callers must guard against null before calling allowSleep:
 *   const id = power.preventSleep()
 *   if (id !== null) power.allowSleep(id)
 */
export interface IPowerManager {
  /** Returns a handle ID, or null if not supported (standalone). */
  preventSleep(): number | null;
  /** id may be null (returned by standalone preventSleep); this is a no-op in that case. */
  allowSleep(id: number | null): void;
}

/**
 * System notification — replaces Electron Notification class.
 *
 * In standalone mode: silent no-op (intentional degradation).
 * Notification click-to-focus and lifecycle events (click, failed, close)
 * are Electron-only behaviour and are not modelled in this interface.
 * The GC-protection reference held in notificationBridge is also
 * Electron-only and will be removed during migration.
 */
export interface INotificationService {
  send(options: { title: string; body: string; icon?: string }): void;
}

/** Top-level aggregate injected at process startup. */
export interface IPlatformServices {
  paths: IPlatformPaths;
  worker: IWorkerProcessFactory;
  power: IPowerManager;
  notification: INotificationService;
}
```

### 3.3 Registration Singleton

```typescript
// src/common/platform/index.ts

import type { IPlatformServices } from './IPlatformServices';

let _services: IPlatformServices | null = null;

export function registerPlatformServices(services: IPlatformServices): void {
  _services = services;
}

export function getPlatformServices(): IPlatformServices {
  if (!_services) {
    throw new Error('[Platform] Services not registered. Call registerPlatformServices() before using platform APIs.');
  }
  return _services;
}

export type {
  IPlatformServices,
  IPlatformPaths,
  IWorkerProcess,
  IWorkerProcessFactory,
  IPowerManager,
  INotificationService,
} from './IPlatformServices';
```

### 3.4 Electron Implementation (sketch)

```typescript
// src/common/platform/ElectronPlatformServices.ts
// NOTE: This is the ONLY file in src/common/platform/ that may import from 'electron' directly.
import { app, utilityProcess, powerSaveBlocker, Notification } from 'electron';
import type { IPlatformServices, IWorkerProcess } from './IPlatformServices';

class ElectronWorkerProcess implements IWorkerProcess {
  /* wraps UtilityProcess */
}

export class ElectronPlatformServices implements IPlatformServices {
  paths = {
    getDataDir: () => app.getPath('userData'),
    getTempDir: () => app.getPath('temp'),
    getHomeDir: () => app.getPath('home'),
    getLogsDir: () => app.getPath('logs'),
    getAppPath: () => app.getAppPath(),
    isPackaged: () => app.isPackaged,
    getSystemPath: (name) => app.getPath(name),
    getName: () => app.getName(),
    getVersion: () => app.getVersion(),
  };
  worker = {
    fork: (modulePath, args, opts) => new ElectronWorkerProcess(utilityProcess.fork(modulePath, args, opts)),
  };
  power = {
    preventSleep: () => powerSaveBlocker.start('prevent-app-suspension'),
    allowSleep: (id) => {
      if (id !== null) powerSaveBlocker.stop(id);
    },
  };
  notification = {
    send: ({ title, body }) => new Notification({ title, body }).show(),
  };
}
```

### 3.5 Node.js Implementation (sketch)

```typescript
// src/common/platform/NodePlatformServices.ts
import { fork as cpFork } from 'child_process';
import os from 'os';
import path from 'path';
import { readFileSync } from 'fs';
import type { IPlatformServices, IWorkerProcess } from './IPlatformServices';

class NodeWorkerProcess implements IWorkerProcess {
  /* wraps ChildProcess */
}

// Read version from package.json once at startup.
const _pkg = (() => {
  try {
    return JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
  } catch {
    return { name: 'aionui', version: '0.0.0' };
  }
})();

export class NodePlatformServices implements IPlatformServices {
  paths = {
    getDataDir: () => process.env.DATA_DIR ?? path.join(os.tmpdir(), 'aionui-user-data'),
    getTempDir: () => os.tmpdir(),
    getHomeDir: () => os.homedir(),
    // Supports LOGS_DIR env var for production Docker deployments.
    getLogsDir: () => process.env.LOGS_DIR ?? path.join(os.tmpdir(), 'aionui-logs'),
    getAppPath: () => null,
    // Controlled by IS_PACKAGED env var. False by default (standalone = dev/server mode).
    // Note: appEnv.ts uses isPackaged() to decide whether to append '-dev' suffix to
    // directory names. In standalone mode this suffix is suppressed by setting IS_PACKAGED=true
    // when deploying a production Docker image.
    isPackaged: () => process.env.IS_PACKAGED === 'true',
    getSystemPath: (_name) => null,
    getName: () => _pkg.name ?? 'aionui',
    getVersion: () => _pkg.version ?? '0.0.0',
  };
  worker = {
    // serialization: 'advanced' enables V8 structured clone (supports Buffer, Map, Set).
    // Transferable ArrayBuffer ownership transfer is NOT supported — acceptable because
    // current IForkData messages do not use Transferables. Re-evaluate if that changes.
    fork: (modulePath, args, opts) =>
      new NodeWorkerProcess(cpFork(modulePath, args, { cwd: opts.cwd, env: opts.env, serialization: 'advanced' })),
  };
  power = {
    preventSleep: () => null, // no-op in standalone
    allowSleep: (_id) => {},
  };
  notification = {
    send: (_opts) => {}, // intentional no-op in standalone
  };
}
```

### 3.6 Entry Point Registration

**Registration order is critical.** `registerPlatformServices()` must be called before any module
that calls `getPlatformServices()` is evaluated. In `src/server.ts` this means registering
**before** `import './common/adapter/standalone'`, because the adapter triggers `bridge.adapter()`
at module evaluation time and its import tree must not reference platform services. Verify this
by checking the full import tree of `standalone.ts` before finalising Phase 1.

```typescript
// src/server.ts — platform registration FIRST, then adapter
import { registerPlatformServices } from './common/platform';
import { NodePlatformServices } from './common/platform/NodePlatformServices';
registerPlatformServices(new NodePlatformServices());

import './common/adapter/standalone'; // bridge adapter — comes after registration
// ... rest of server.ts unchanged

// src/process/index.ts  (Electron main — add near top, before any service imports)
import { registerPlatformServices } from '@/common/platform';
import { ElectronPlatformServices } from '@/common/platform/ElectronPlatformServices';
registerPlatformServices(new ElectronPlatformServices());
```

---

## 4. Migration Plan

### Phase 1 — Scaffold (no behaviour change)

1. Create `src/common/platform/IPlatformServices.ts`
2. Create `src/common/platform/index.ts` (register/get)
3. Create `src/common/platform/NodePlatformServices.ts`
4. Create `src/common/platform/ElectronPlatformServices.ts`
5. Wire registration into `src/server.ts` and `src/process/index.ts`
6. Verify import tree of `standalone.ts` to confirm registration-before-evaluation ordering.

### Phase 2 — Migrate call sites (9 files)

Each file below replaces its `electronSafe.*` import with `getPlatformServices()`:

| File                                              | API replaced                                                                                                                                                   |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/common/config/appEnv.ts`                     | `electronApp.getPath` → `paths.getDataDir / getTempDir`                                                                                                        |
| `src/process/utils/utils.ts`                      | `electronApp.getPath` → `paths.*`                                                                                                                              |
| `src/process/utils/initStorage.ts`                | `electronApp.getPath / getAppPath / isPackaged` → `paths.*`                                                                                                    |
| `src/process/webserver/routes/staticRoutes.ts`    | `electronApp.getAppPath` → `paths.getAppPath()`                                                                                                                |
| `src/process/services/mcpServices/McpProtocol.ts` | `electronApp.getName / getVersion` → `paths.getName() / getVersion()`                                                                                          |
| `src/process/extensions/constants.ts`             | `electronApp.getAppPath` → `paths.getAppPath()`                                                                                                                |
| `src/process/worker/fork/ForkTask.ts`             | `utilityProcess.fork` → `worker.fork`; change `fcp` field type to `IWorkerProcess`                                                                             |
| `src/process/services/cron/CronService.ts`        | `powerSaveBlocker` → `power.*`; guard `allowSleep` with `id !== null` check                                                                                    |
| `src/process/bridge/notificationBridge.ts`        | `NotificationCtor + app` → `notification.send`; remove click/failed/close event handlers and GC-protection set (intentional feature degradation in standalone) |

### Phase 3 — Cleanup

- Mark `electronSafe.ts` exports with `@internal` JSDoc: "Only import from tray.ts, conversionService.ts, and ElectronPlatformServices.ts".
- Add lint rule to warn on `import.*from.*electronSafe` or `import.*from.*electron[^S]` outside the three allowed files above. Note: the rule must distinguish between `from 'electron'` (direct, blocked everywhere except ElectronPlatformServices) and `from '@/common/electronSafe'` (internal shim, blocked except tray + conversionService).

---

## 5. Data Flow (Standalone Mode)

```
server.ts
  └─ registerPlatformServices(new NodePlatformServices())   <- MUST BE FIRST
  └─ import './common/adapter/standalone'
  └─ initStorage()
       └─ getPlatformServices().paths.getDataDir()   <- reads DATA_DIR env or tmpdir
  └─ initBridgeStandalone()
  └─ startWebServerWithInstance(port)
       └─ ... user sends message ...
            └─ ForkTask.init()
                 └─ getPlatformServices().worker.fork(workerScript, [], { cwd, env })
                      └─ child_process.fork(...)  <- Node.js native, no Electron needed
```

---

## 6. Risks & Mitigations

| Risk                                                                            | Mitigation                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `child_process.fork` serialization parity                                       | Use `{ serialization: 'advanced' }` for structured clone. **Scope**: parity holds for current `IForkData` messages which contain no Transferables. Re-evaluate if Transferable support is added in future. |
| `getPlatformServices()` called before registration at module load time          | Registration must be the first statement in each entry point. Phase 1 includes an explicit import-tree audit of `standalone.ts`.                                                                           |
| `better-sqlite3` native addon incompatible with Bun                             | Build server bundle with esbuild (`build:server` script); externalize `better-sqlite3` and run with `node`.                                                                                                |
| `tray.ts` still imports from `electronSafe.ts`                                  | Acceptable — tray is never in the webserver import path; enforced by Phase 3 lint rule.                                                                                                                    |
| `isPackaged()` always false causes `-dev` directory suffix in Docker production | Set `IS_PACKAGED=true` in production Docker environment. Document in deployment guide.                                                                                                                     |
| Notification click/close events removed in standalone                           | Intentional degradation. Desktop Electron path unaffected — `ElectronPlatformServices.notification` can be extended to return an event handle if needed in future.                                         |

---

## 7. Success Criteria

- `bun run build:server && node dist-server/server.js` starts without errors in a Docker container with no Electron installed.
- All existing Electron desktop tests continue to pass.
- No `import ... from 'electron'` outside `ElectronPlatformServices.ts`.
- No `import ... from '@/common/electronSafe'` outside `tray.ts` and `conversionService.ts`.
