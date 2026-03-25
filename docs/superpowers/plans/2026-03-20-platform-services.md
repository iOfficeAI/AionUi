# Platform Services Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a `IPlatformServices` dependency-injection layer so the standalone WebServer can run in pure Node.js / Docker without any Electron dependency.

**Architecture:** Four new files under `src/common/platform/` define the interface, registration singleton, and two implementations (Electron + Node.js). Each call site in `src/process/` that currently imports from `electronSafe.ts` is migrated to call `getPlatformServices()` instead. Registration is performed once at each process entry point (`server.ts` and `process/index.ts`) before any service modules are loaded.

**Tech Stack:** TypeScript (strict), Vitest 4, Node.js `child_process.fork`, path aliases `@/` = `src/`, `@process/` = `src/process/`. Run tests with `bun run test`.

**Spec:** `docs/superpowers/specs/2026-03-20-platform-services-design.md`

---

## File Map

### New files

| Path                                               | Responsibility                                                                                  |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/common/platform/IPlatformServices.ts`         | Interface definitions only — no runtime code                                                    |
| `src/common/platform/index.ts`                     | `registerPlatformServices` / `getPlatformServices` singleton                                    |
| `src/common/platform/NodePlatformServices.ts`      | Node.js implementation (no Electron)                                                            |
| `src/common/platform/ElectronPlatformServices.ts`  | Electron implementation                                                                         |
| `src/common/platform/register-node.ts`             | Side-effect module: registers `NodePlatformServices` (imported first in `server.ts`)            |
| `src/common/platform/register-electron.ts`         | Side-effect module: registers `ElectronPlatformServices` (imported first in `process/index.ts`) |
| `tests/unit/platform/platformRegistry.test.ts`     | Tests for register/get singleton                                                                |
| `tests/unit/platform/NodePlatformServices.test.ts` | Tests for Node.js implementation                                                                |

### Modified files

| Path                                              | Change                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/server.ts`                                   | Add `registerPlatformServices(new NodePlatformServices())` as first statement              |
| `src/process/index.ts`                            | Add `registerPlatformServices(new ElectronPlatformServices())` as first statement          |
| `src/common/config/appEnv.ts`                     | `electronApp` → `getPlatformServices().paths`                                              |
| `src/process/utils/utils.ts`                      | `electronApp` → `getPlatformServices().paths`                                              |
| `src/process/utils/initStorage.ts`                | `electronApp` → `getPlatformServices().paths`                                              |
| `src/process/webserver/routes/staticRoutes.ts`    | `electronApp` → `getPlatformServices().paths`                                              |
| `src/process/services/mcpServices/McpProtocol.ts` | `electronApp.getName/getVersion` → `getPlatformServices().paths`                           |
| `src/process/extensions/constants.ts`             | `electronApp` → `getPlatformServices().paths`                                              |
| `src/process/worker/fork/ForkTask.ts`             | `utilityProcess.fork` → `getPlatformServices().worker.fork`; `fcp` type → `IWorkerProcess` |
| `src/process/services/cron/CronService.ts`        | `powerSaveBlocker` → `getPlatformServices().power`                                         |
| `src/process/bridge/notificationBridge.ts`        | `NotificationCtor + electronApp` → `getPlatformServices().notification.send`               |
| `src/common/electronSafe.ts`                      | Add `@internal` JSDoc                                                                      |
| `tests/unit/common/appEnv.test.ts`                | Update mock: `electron` → `@/common/platform`                                              |

---

## Task 1: Define IPlatformServices interface

**Files:**

- Create: `src/common/platform/IPlatformServices.ts`

- [ ] **Step 1: Create the interface file**

```typescript
// src/common/platform/IPlatformServices.ts

/**
 * Path resolution and app metadata.
 * Replaces all app.getPath() / app.getAppPath() / app.getName() / app.getVersion() calls.
 */
export interface IPlatformPaths {
  /** Persistent user data directory. Equivalent to app.getPath('userData'). */
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
   * Well-known system paths (desktop, home, downloads).
   * Returns null in standalone mode.
   */
  getSystemPath(name: 'desktop' | 'home' | 'downloads'): string | null;
  /** Application name used for MCP client identification. */
  getName(): string;
  /** Application version string used for MCP client identification. */
  getVersion(): string;
}

/**
 * A running worker child process.
 *
 * Covers the subset of Electron.UtilityProcess / Node.js ChildProcess APIs
 * used by ForkTask. When migrating ForkTask, change fcp field type from
 * UtilityProcess to IWorkerProcess.
 */
export interface IWorkerProcess {
  postMessage(message: unknown): void;
  on(event: 'message', handler: (data: unknown) => void): this;
  on(event: 'error', handler: (err: Error) => void): this;
  on(event: 'exit', handler: (code: number | null) => void): this;
  kill(): void;
}

/**
 * Worker process factory.
 * Replaces utilityProcess.fork() in Electron and child_process.fork() in Node.js.
 */
export interface IWorkerProcessFactory {
  fork(modulePath: string, args: string[], options: { cwd?: string; env?: Record<string, string> }): IWorkerProcess;
}

/**
 * System sleep/suspension control. Replaces powerSaveBlocker.
 *
 * Callers MUST guard against null before calling allowSleep:
 *   const id = power.preventSleep()
 *   if (id !== null) power.allowSleep(id)
 */
export interface IPowerManager {
  /** Returns a handle ID, or null if not supported (standalone mode). */
  preventSleep(): number | null;
  /** id may be null (returned by standalone preventSleep); safe no-op in that case. */
  allowSleep(id: number | null): void;
}

/**
 * System notification. Replaces Electron Notification class.
 *
 * In standalone mode: silent no-op (intentional degradation).
 * Notification lifecycle events (click, failed, close) are Electron-only
 * and are NOT modelled here.
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

- [ ] **Step 2: Verify TypeScript compiles with no errors**

```bash
cd /Users/zhangyaxiong/Workspace/src/github/iOfficeAI/AionUi-Bak
bunx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/common/platform/IPlatformServices.ts
git commit -m "feat(platform): add IPlatformServices interface definitions"
```

---

## Task 2: Registration singleton + tests

**Files:**

- Create: `src/common/platform/index.ts`
- Create: `tests/unit/platform/platformRegistry.test.ts`

- [ ] **Step 1: Write the failing test first**

```typescript
// tests/unit/platform/platformRegistry.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('platformRegistry', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('getPlatformServices throws before registration', async () => {
    const { getPlatformServices } = await import('../../../src/common/platform/index');
    expect(() => getPlatformServices()).toThrow('[Platform] Services not registered');
  });

  it('getPlatformServices returns the registered instance', async () => {
    const { registerPlatformServices, getPlatformServices } = await import('../../../src/common/platform/index');
    const mock = {
      paths: {},
      worker: {},
      power: {},
      notification: {},
    } as Parameters<typeof registerPlatformServices>[0];
    registerPlatformServices(mock);
    expect(getPlatformServices()).toBe(mock);
  });

  it('re-registering replaces the previous instance', async () => {
    const { registerPlatformServices, getPlatformServices } = await import('../../../src/common/platform/index');
    const first = { paths: {}, worker: {}, power: {}, notification: {} } as Parameters<
      typeof registerPlatformServices
    >[0];
    const second = { paths: {}, worker: {}, power: {}, notification: {} } as Parameters<
      typeof registerPlatformServices
    >[0];
    registerPlatformServices(first);
    registerPlatformServices(second);
    expect(getPlatformServices()).toBe(second);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
bun run test tests/unit/platform/platformRegistry.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Create the registration module**

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

- [ ] **Step 4: Run test — expect PASS**

```bash
bun run test tests/unit/platform/platformRegistry.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/common/platform/index.ts tests/unit/platform/platformRegistry.test.ts
git commit -m "feat(platform): add registerPlatformServices / getPlatformServices singleton"
```

---

## Task 3: NodePlatformServices + tests

**Files:**

- Create: `src/common/platform/NodePlatformServices.ts`
- Create: `tests/unit/platform/NodePlatformServices.test.ts`

- [ ] **Step 1: Write the failing tests first**

```typescript
// tests/unit/platform/NodePlatformServices.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import os from 'os';
import path from 'path';

describe('NodePlatformServices.paths', () => {
  beforeEach(() => {
    delete process.env.DATA_DIR;
    delete process.env.LOGS_DIR;
    delete process.env.IS_PACKAGED;
    vi.resetModules();
  });

  it('getDataDir uses DATA_DIR env var when set', async () => {
    process.env.DATA_DIR = '/custom/data';
    const { NodePlatformServices } = await import('../../../src/common/platform/NodePlatformServices');
    expect(new NodePlatformServices().paths.getDataDir()).toBe('/custom/data');
  });

  it('getDataDir falls back to tmpdir/aionui-user-data', async () => {
    const { NodePlatformServices } = await import('../../../src/common/platform/NodePlatformServices');
    expect(new NodePlatformServices().paths.getDataDir()).toBe(path.join(os.tmpdir(), 'aionui-user-data'));
  });

  it('getLogsDir uses LOGS_DIR env var when set', async () => {
    process.env.LOGS_DIR = '/custom/logs';
    const { NodePlatformServices } = await import('../../../src/common/platform/NodePlatformServices');
    expect(new NodePlatformServices().paths.getLogsDir()).toBe('/custom/logs');
  });

  it('getLogsDir falls back to tmpdir/aionui-logs', async () => {
    const { NodePlatformServices } = await import('../../../src/common/platform/NodePlatformServices');
    expect(new NodePlatformServices().paths.getLogsDir()).toBe(path.join(os.tmpdir(), 'aionui-logs'));
  });

  it('getAppPath returns null', async () => {
    const { NodePlatformServices } = await import('../../../src/common/platform/NodePlatformServices');
    expect(new NodePlatformServices().paths.getAppPath()).toBeNull();
  });

  it('isPackaged returns false by default', async () => {
    const { NodePlatformServices } = await import('../../../src/common/platform/NodePlatformServices');
    expect(new NodePlatformServices().paths.isPackaged()).toBe(false);
  });

  it('isPackaged returns true when IS_PACKAGED=true', async () => {
    process.env.IS_PACKAGED = 'true';
    const { NodePlatformServices } = await import('../../../src/common/platform/NodePlatformServices');
    expect(new NodePlatformServices().paths.isPackaged()).toBe(true);
  });

  it('getSystemPath returns null for any name', async () => {
    const { NodePlatformServices } = await import('../../../src/common/platform/NodePlatformServices');
    const svc = new NodePlatformServices();
    expect(svc.paths.getSystemPath('desktop')).toBeNull();
    expect(svc.paths.getSystemPath('home')).toBeNull();
    expect(svc.paths.getSystemPath('downloads')).toBeNull();
  });

  it('getName and getVersion read from package.json', async () => {
    const { NodePlatformServices } = await import('../../../src/common/platform/NodePlatformServices');
    const svc = new NodePlatformServices();
    expect(typeof svc.paths.getName()).toBe('string');
    expect(svc.paths.getName().length).toBeGreaterThan(0);
    expect(typeof svc.paths.getVersion()).toBe('string');
  });
});

describe('NodePlatformServices.worker', () => {
  it('fork delegates to child_process.fork with serialization:advanced', async () => {
    const mockChildProcess = vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      send: vi.fn(),
      kill: vi.fn(),
    });
    vi.mock('child_process', () => ({ fork: mockChildProcess }));
    const { NodePlatformServices } = await import('../../../src/common/platform/NodePlatformServices');
    const svc = new NodePlatformServices();
    svc.worker.fork('/path/script.js', [], { cwd: '/cwd', env: { FOO: 'bar' } });
    expect(mockChildProcess).toHaveBeenCalledWith('/path/script.js', [], {
      cwd: '/cwd',
      env: { FOO: 'bar' },
      serialization: 'advanced',
    });
  });
});

describe('NodePlatformServices.power', () => {
  it('preventSleep returns null', async () => {
    const { NodePlatformServices } = await import('../../../src/common/platform/NodePlatformServices');
    expect(new NodePlatformServices().power.preventSleep()).toBeNull();
  });

  it('allowSleep is a no-op for null', async () => {
    const { NodePlatformServices } = await import('../../../src/common/platform/NodePlatformServices');
    expect(() => new NodePlatformServices().power.allowSleep(null)).not.toThrow();
  });

  it('allowSleep is a no-op for a number', async () => {
    const { NodePlatformServices } = await import('../../../src/common/platform/NodePlatformServices');
    expect(() => new NodePlatformServices().power.allowSleep(42)).not.toThrow();
  });
});

describe('NodePlatformServices.notification', () => {
  it('send is a no-op and does not throw', async () => {
    const { NodePlatformServices } = await import('../../../src/common/platform/NodePlatformServices');
    expect(() => new NodePlatformServices().notification.send({ title: 'T', body: 'B' })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
bun run test tests/unit/platform/NodePlatformServices.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement NodePlatformServices**

```typescript
// src/common/platform/NodePlatformServices.ts
import { fork as cpFork, type ChildProcess } from 'child_process';
import { readFileSync } from 'fs';
import os from 'os';
import path from 'path';
import type { IPlatformServices, IWorkerProcess } from './IPlatformServices';

class NodeWorkerProcess implements IWorkerProcess {
  constructor(private readonly cp: ChildProcess) {}

  postMessage(message: unknown): void {
    this.cp.send(message as Parameters<ChildProcess['send']>[0]);
  }

  on(event: 'message', handler: (data: unknown) => void): this;
  on(event: 'error', handler: (err: Error) => void): this;
  on(event: 'exit', handler: (code: number | null) => void): this;
  on(event: string, handler: (...args: unknown[]) => void): this {
    this.cp.on(event, handler as (...args: unknown[]) => void);
    return this;
  }

  kill(): void {
    this.cp.kill();
  }
}

// Read name + version from package.json once at module load.
const _pkg = (() => {
  try {
    return JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as {
      name?: string;
      version?: string;
    };
  } catch {
    return { name: 'aionui', version: '0.0.0' };
  }
})();

export class NodePlatformServices implements IPlatformServices {
  paths = {
    getDataDir: () => process.env.DATA_DIR ?? path.join(os.tmpdir(), 'aionui-user-data'),
    getTempDir: () => os.tmpdir(),
    getHomeDir: () => os.homedir(),
    getLogsDir: () => process.env.LOGS_DIR ?? path.join(os.tmpdir(), 'aionui-logs'),
    getAppPath: (): string | null => null,
    isPackaged: () => process.env.IS_PACKAGED === 'true',
    getSystemPath: (_name: 'desktop' | 'home' | 'downloads'): string | null => null,
    getName: () => _pkg.name ?? 'aionui',
    getVersion: () => _pkg.version ?? '0.0.0',
  };

  worker = {
    fork: (modulePath: string, args: string[], opts: { cwd?: string; env?: Record<string, string> }): IWorkerProcess =>
      new NodeWorkerProcess(
        cpFork(modulePath, args, {
          cwd: opts.cwd,
          env: opts.env,
          // Enables V8 structured clone (supports Buffer, Map, Set).
          // ArrayBuffer ownership transfer is not supported — acceptable
          // because current IForkData messages contain no Transferables.
          serialization: 'advanced',
        })
      ),
  };

  power = {
    preventSleep: (): number | null => null,
    allowSleep: (_id: number | null): void => {},
  };

  notification = {
    send: (_opts: { title: string; body: string; icon?: string }): void => {},
  };
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
bun run test tests/unit/platform/NodePlatformServices.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
bun run test
```

Expected: no regressions.

- [ ] **Step 6: Commit**

```bash
git add src/common/platform/NodePlatformServices.ts tests/unit/platform/NodePlatformServices.test.ts
git commit -m "feat(platform): implement NodePlatformServices for standalone mode"
```

---

## Task 4: ElectronPlatformServices

**Files:**

- Create: `src/common/platform/ElectronPlatformServices.ts`

> Note: `ElectronPlatformServices` is the ONLY file permitted to `import from 'electron'` directly in the platform layer. No Vitest unit tests are written for it — it is integration-tested through the existing Electron desktop tests.

- [ ] **Step 1: Create the Electron implementation**

```typescript
// src/common/platform/ElectronPlatformServices.ts
// This is the only file in src/common/platform/ permitted to import from 'electron'.
import { app, Notification, powerSaveBlocker, utilityProcess, type UtilityProcess } from 'electron';
import type { IPlatformServices, IWorkerProcess } from './IPlatformServices';

class ElectronWorkerProcess implements IWorkerProcess {
  constructor(private readonly up: UtilityProcess) {}

  postMessage(message: unknown): void {
    this.up.postMessage(message);
  }

  on(event: 'message', handler: (data: unknown) => void): this;
  on(event: 'error', handler: (err: Error) => void): this;
  on(event: 'exit', handler: (code: number | null) => void): this;
  on(event: string, handler: (...args: unknown[]) => void): this {
    this.up.on(event as Parameters<UtilityProcess['on']>[0], handler as never);
    return this;
  }

  kill(): void {
    this.up.kill();
  }
}

export class ElectronPlatformServices implements IPlatformServices {
  paths = {
    getDataDir: () => app.getPath('userData'),
    getTempDir: () => app.getPath('temp'),
    getHomeDir: () => app.getPath('home'),
    getLogsDir: () => app.getPath('logs'),
    getAppPath: () => app.getAppPath(),
    isPackaged: () => app.isPackaged,
    getSystemPath: (name: 'desktop' | 'home' | 'downloads') => app.getPath(name),
    getName: () => app.getName(),
    getVersion: () => app.getVersion(),
  };

  worker = {
    fork: (modulePath: string, args: string[], opts: { cwd?: string; env?: Record<string, string> }): IWorkerProcess =>
      new ElectronWorkerProcess(
        utilityProcess.fork(modulePath, args, {
          cwd: opts.cwd,
          env: opts.env,
        })
      ),
  };

  power = {
    preventSleep: (): number | null => powerSaveBlocker.start('prevent-app-suspension'),
    allowSleep: (id: number | null): void => {
      if (id !== null) powerSaveBlocker.stop(id);
    },
  };

  notification = {
    send: ({ title, body }: { title: string; body: string; icon?: string }): void => {
      new Notification({ title, body }).show();
    },
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
bunx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/common/platform/ElectronPlatformServices.ts
git commit -m "feat(platform): implement ElectronPlatformServices wrapping Electron APIs"
```

---

## Task 5: Wire entry points

**Files:**

- Create: `src/common/platform/register-node.ts`
- Create: `src/common/platform/register-electron.ts`
- Modify: `src/server.ts`
- Modify: `src/process/index.ts`

> **Why side-effect modules, not inline calls?**
> In ESM, ALL static `import` declarations in a file are hoisted and evaluated before any imperative code runs. This means writing `registerPlatformServices(...)` between two `import` lines does NOT work — Node.js would evaluate both imports before reaching the call.
>
> The correct pattern is to put the registration in its own module (`register-node.ts`) and import it FIRST. ESM guarantees that sibling imports are evaluated in source order, so `register-node.ts` (a leaf with no dependencies that call `getPlatformServices()`) runs before `initStorage.ts`'s module-level code, which after Task 6 will call `getPlatformServices()`.

- [ ] **Step 1: Audit server.ts import tree for module-level getPlatformServices calls**

After Task 6 migrates `utils.ts`, `initStorage.ts` lines 299–315 (module-level `JsonFileBuilder` calls that invoke `getConfigPath` → `getElectronPathOrFallback` → `hasElectronAppPath`) will call `getPlatformServices()` at the moment `initStorage` is first imported. Confirm this will be safe by verifying `register-node.ts` is listed before `initStorage` in `server.ts`.

- [ ] **Step 2: Create register-node.ts**

```typescript
// src/common/platform/register-node.ts
// Side-effect module. Import this as the FIRST import in server.ts.
// It must have no transitive dependencies that call getPlatformServices().
import { registerPlatformServices } from './index';
import { NodePlatformServices } from './NodePlatformServices';

registerPlatformServices(new NodePlatformServices());
```

- [ ] **Step 3: Create register-electron.ts**

```typescript
// src/common/platform/register-electron.ts
// Side-effect module. Import this as the FIRST import in src/process/index.ts.
import { registerPlatformServices } from './index';
import { ElectronPlatformServices } from './ElectronPlatformServices';

registerPlatformServices(new ElectronPlatformServices());
```

- [ ] **Step 4: Update src/server.ts**

Replace the existing first import (`import './common/adapter/standalone'`) so that `register-node` comes before it:

```typescript
// src/server.ts — register-node MUST be the first import in the file
import './common/platform/register-node';

// Must follow registration — calls bridge.adapter() at module load time
import './common/adapter/standalone';

import { initBridgeStandalone } from './process/utils/initBridgeStandalone';
import { startWebServerWithInstance } from './process/webserver';
import initStorage from './process/utils/initStorage';
// ... rest of file unchanged
```

- [ ] **Step 5: Update src/process/index.ts**

Add `register-electron` as the very first import (before `import { app } from 'electron'`):

```typescript
// src/process/index.ts — register-electron MUST be the first import
import '@/common/platform/register-electron';

import { app } from 'electron';
// ... rest of file unchanged
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
bunx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Run full test suite**

```bash
bun run test
```

Expected: all tests pass (no behaviour change yet).

- [ ] **Step 8: Commit**

```bash
git add src/common/platform/register-node.ts src/common/platform/register-electron.ts \
  src/server.ts src/process/index.ts
git commit -m "feat(platform): register platform services via side-effect imports in entry points"
```

---

## Task 6: Migrate path call sites (6 files)

**Files:**

- Modify: `src/common/config/appEnv.ts`
- Modify: `src/process/utils/utils.ts`
- Modify: `src/process/utils/initStorage.ts`
- Modify: `src/process/webserver/routes/staticRoutes.ts`
- Modify: `src/process/services/mcpServices/McpProtocol.ts`
- Modify: `src/process/extensions/constants.ts`
- Modify: `tests/unit/common/appEnv.test.ts`

The pattern for each file is the same: replace `import { electronApp as app } from '@/common/electronSafe'` with `import { getPlatformServices } from '@/common/platform'`, then replace each usage:

| Old call                                       | New call                                                                                                                                                               |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app?.getPath('userData')`                     | `getPlatformServices().paths.getDataDir()`                                                                                                                             |
| `app?.getPath('temp')`                         | `getPlatformServices().paths.getTempDir()`                                                                                                                             |
| `app?.getPath('home')`                         | `getPlatformServices().paths.getHomeDir()`                                                                                                                             |
| `app?.getPath('logs')`                         | `getPlatformServices().paths.getLogsDir()`                                                                                                                             |
| `app?.getPath('desktop'\|'home'\|'downloads')` | `getPlatformServices().paths.getSystemPath(name)`                                                                                                                      |
| `app?.getAppPath()`                            | `getPlatformServices().paths.getAppPath()`                                                                                                                             |
| `app?.isPackaged`                              | `getPlatformServices().paths.isPackaged()`                                                                                                                             |
| `app?.getName()`                               | `getPlatformServices().paths.getName()`                                                                                                                                |
| `app?.getVersion()`                            | `getPlatformServices().paths.getVersion()`                                                                                                                             |
| `hasElectronAppPath()` body (in utils.ts)      | Rewrite to `return getPlatformServices().paths.getAppPath() !== null` — returns `true` in Electron (getAppPath returns a string), `false` in standalone (returns null) |

> **Note on McpProtocol.ts**: The actual usage is `app?.getName()` and `app?.getVersion()`, not `getPath`. Use `paths.getName()` and `paths.getVersion()`.

> **Note on hasElectronAppPath()**: This function in `utils.ts` checks `typeof app?.getPath === 'function'`. After migrating `app` import in this file, `hasElectronAppPath` should return `true` in Electron (since `ElectronPlatformServices.paths.getDataDir` is a function) and `false` in standalone (since `NodePlatformServices.paths.getAppPath` returns `null`). Simplest fix: rewrite to `return getPlatformServices().paths.getAppPath() !== null`.

- [ ] **Step 1: Update appEnv.ts test first (test drives the interface)**

```typescript
// tests/unit/common/appEnv.test.ts — replace electron mock with platform mock
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/common/platform', () => ({
  getPlatformServices: () => ({ paths: { isPackaged: () => false } }),
}));

describe('common/appEnv', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('appends -dev suffix in dev builds', async () => {
    const { getEnvAwareName } = await import('../../../src/common/config/appEnv');
    expect(getEnvAwareName('.aionui')).toBe('.aionui-dev');
    expect(getEnvAwareName('.aionui-config')).toBe('.aionui-config-dev');
  });

  it('returns baseName unchanged in release builds', async () => {
    vi.doMock('@/common/platform', () => ({
      getPlatformServices: () => ({ paths: { isPackaged: () => true } }),
    }));
    const { getEnvAwareName } = await import('../../../src/common/config/appEnv');
    expect(getEnvAwareName('.aionui')).toBe('.aionui');
    expect(getEnvAwareName('.aionui-config')).toBe('.aionui-config');
  });
});
```

- [ ] **Step 2: Run appEnv test — expect FAIL**

```bash
bun run test tests/unit/common/appEnv.test.ts
```

- [ ] **Step 3: Migrate appEnv.ts**

In `src/common/config/appEnv.ts`, replace:

```typescript
import { electronApp as app } from '@/common/electronSafe';
// ...
app?.isPackaged;
```

with:

```typescript
import { getPlatformServices } from '@/common/platform';
// ...
getPlatformServices().paths.isPackaged();
```

- [ ] **Step 4: Run appEnv test — expect PASS**

```bash
bun run test tests/unit/common/appEnv.test.ts
```

- [ ] **Step 5: Migrate remaining 5 files**

Apply the replacement table above to each file:

- `src/process/utils/utils.ts` — replace `electronApp as app` import; replace `hasElectronAppPath` body with `return getPlatformServices().paths.getAppPath() !== null`
- `src/process/utils/initStorage.ts` — replace `electronApp as app` import; update all `app?.getPath(...)`, `app?.getAppPath()`, `app?.isPackaged` usages
- `src/process/webserver/routes/staticRoutes.ts` — replace `electronApp as app`; update `app?.getAppPath()`
- `src/process/services/mcpServices/McpProtocol.ts` — replace `electronApp as app`; update `app?.getName()`, `app?.getVersion()`
- `src/process/extensions/constants.ts` — replace `electronApp as app`; update `app?.getAppPath()`

- [ ] **Step 6: Run full test suite**

```bash
bun run test
```

Expected: all tests pass.

- [ ] **Step 7: TypeScript check**

```bash
bunx tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add src/common/config/appEnv.ts src/process/utils/utils.ts src/process/utils/initStorage.ts \
  src/process/webserver/routes/staticRoutes.ts src/process/services/mcpServices/McpProtocol.ts \
  src/process/extensions/constants.ts tests/unit/common/appEnv.test.ts
git commit -m "feat(platform): migrate path call sites to getPlatformServices().paths"
```

---

## Task 7: Migrate ForkTask (worker process)

**Files:**

- Modify: `src/process/worker/fork/ForkTask.ts`

This is the most critical migration — it unblocks worker process spawning in standalone mode.

- [ ] **Step 1: Verify all `app?.` references in ForkTask.ts before removing the import**

```bash
grep -n "app\?" src/process/worker/fork/ForkTask.ts
```

Expected: only `app?.isPackaged` and `app.getAppPath()` inside `getWorkerCwd()`. If any `app?.` references appear outside `getWorkerCwd()`, migrate them using `getPlatformServices().paths.*` before removing the import.

- [ ] **Step 1b: Read ForkTask.ts to confirm required changes**

Key changes needed:

1. Remove `import { electronApp as app, electronUtilityProcess as utilityProcess }`
2. Remove `import type { UtilityProcess } from 'electron'`
3. Add `import { getPlatformServices } from '@/common/platform'`
4. Add `import type { IWorkerProcess } from '@/common/platform'`
5. Change `protected fcp: UtilityProcess | undefined` to `protected fcp: IWorkerProcess | undefined`
6. Remove the `getWorkerCwd()` function entirely — replace with inline logic in `init()`
7. In `init()`, replace `utilityProcess.fork(...)` with `getPlatformServices().worker.fork(...)`

- [ ] **Step 2: Apply the migration**

```typescript
// src/process/worker/fork/ForkTask.ts — key changes shown as diff

// REMOVE these imports:
// import type { UtilityProcess } from "electron"
// import { electronApp as app, electronUtilityProcess as utilityProcess } from "@/common/electronSafe"

// ADD:
import { getPlatformServices } from "@/common/platform"
import type { IWorkerProcess } from "@/common/platform"

// REMOVE the getWorkerCwd() function entirely.

// CHANGE field type:
// protected fcp: UtilityProcess | undefined
protected fcp: IWorkerProcess | undefined

// IN init(), replace the fork call:
// OLD:
//   const workerCwd = getWorkerCwd()
//   const workerEnv = getEnhancedEnv()
//   const fcp = utilityProcess.fork(this.path, [], { cwd: workerCwd, env: workerEnv })
// NEW:
const platform = getPlatformServices()
const workerCwd = platform.paths.isPackaged()
  ? (platform.paths.getAppPath() ?? process.cwd()).replace('app.asar', 'app.asar.unpacked')
  : process.cwd()
const workerEnv = getEnhancedEnv()
const fcp = platform.worker.fork(this.path, [], { cwd: workerCwd, env: workerEnv })
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
bunx tsc --noEmit
```

Expected: no errors. Pay attention to any type errors on `fcp.on(...)` — `IWorkerProcess.on` uses method overloads; ensure the message handler `(e: IForkData)` is cast via `(e: unknown)` then asserted inside the handler body.

- [ ] **Step 4: Run full test suite**

```bash
bun run test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/process/worker/fork/ForkTask.ts
git commit -m "feat(platform): migrate ForkTask to use IPlatformServices.worker.fork"
```

---

## Task 8: Migrate CronService (power manager)

**Files:**

- Modify: `src/process/services/cron/CronService.ts`

- [ ] **Step 1: Apply migration**

There are **three** `powerSaveBlocker` call sites in this file. Migrate all three:

```typescript
// src/process/services/cron/CronService.ts

// REMOVE:
// import { electronPowerSaveBlocker as powerSaveBlocker } from "@/common/electronSafe"

// ADD:
import { getPlatformServices } from '@/common/platform';

// SITE 1 — in updatePowerBlocker(), enable path:
// OLD: this.powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension')
// NEW: this.powerSaveBlockerId = getPlatformServices().power.preventSleep()

// SITE 2 — in updatePowerBlocker(), disable path:
// OLD: powerSaveBlocker.stop(this.powerSaveBlockerId)
// NEW: getPlatformServices().power.allowSleep(this.powerSaveBlockerId)

// SITE 3 — in cleanup() private method:
// OLD: powerSaveBlocker.stop(this.powerSaveBlockerId)
// NEW: getPlatformServices().power.allowSleep(this.powerSaveBlockerId)

// Note: allowSleep(id: number | null) is a no-op for null, so no guard needed.
```

- [ ] **Step 2: Update cronService.test.ts mock**

`tests/unit/cronService.test.ts` currently mocks `'electron'` with a `powerSaveBlocker` entry. After the migration, `CronService` calls `getPlatformServices().power` instead. Update the test:

1. Remove `powerSaveBlocker: { start: vi.fn(() => 1), stop: vi.fn() }` from the `vi.mock('electron', ...)` block.
2. Add a new mock at the top of the file:

```typescript
vi.mock('@/common/platform', () => ({
  getPlatformServices: () => ({
    power: {
      preventSleep: vi.fn(() => 1),
      allowSleep: vi.fn(),
    },
  }),
}));
```

- [ ] **Step 3: Run CronService tests**

```bash
bun run test tests/unit/cronService.test.ts
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/process/services/cron/CronService.ts tests/unit/cronService.test.ts
git commit -m "feat(platform): migrate CronService to use IPlatformServices.power"
```

---

## Task 9: Migrate notificationBridge

**Files:**

- Modify: `src/process/bridge/notificationBridge.ts`

> This migration involves intentional feature degradation in standalone mode: the Electron notification lifecycle events (click, failed, close) and the GC-protection reference set are removed. The desktop Electron path continues to work through `ElectronPlatformServices.notification.send`.

- [ ] **Step 1: Read notificationBridge.ts to understand current structure**

There are four distinct deletion/replacement points. Identify each one before editing:

1. **`import type { BrowserWindow, Notification } from "electron"`** (line 14) — type-only, erased at compile time. Remove this line.
2. **`getNotificationIcon()` body uses `app?.isPackaged`** (line 33) — replace with `getPlatformServices().paths.isPackaged()`.
3. **`NotificationCtor?.isSupported()` guard** (line 74) — `INotificationService` has no `isSupported()` method. Replace the entire guard block with a simple `if (true)` or remove it; `notification.send()` is a no-op in standalone so no guard is needed.
4. **The `showNotification` body**: the `activeNotifications` Set (GC protection), `new NotificationCtor(...)`, all `.on('click'|'failed'|'close', ...)` handlers — replace the entire try block with `getPlatformServices().notification.send({ title, body, icon: iconPath })`.

**Also note:** `mainWindow` / `setMainWindow` are Electron-only (focus window on click). Keep them as-is — they are referenced only inside the `'click'` handler which is being removed. After removing the click handler body, `mainWindow` will become unused; remove the `let mainWindow` declaration and `setMainWindow()` export, or guard them behind a comment marking them as Electron-only for future use.

- [ ] **Step 2: Apply migration**

```typescript
// src/process/bridge/notificationBridge.ts — summary of all changes:

// 1. REMOVE: import type { BrowserWindow, Notification } from "electron"
// 2. REMOVE: import { electronNotification as NotificationCtor, electronApp as app }
// 3. ADD:    import { getPlatformServices } from "@/common/platform"
// 4. REMOVE: let mainWindow and const activeNotifications declarations
// 5. REMOVE: export function setMainWindow(...)
// 6. IN getNotificationIcon(): replace app?.isPackaged with getPlatformServices().paths.isPackaged()
// 7. IN showNotification(): replace the NotificationCtor?.isSupported() guard and entire
//    try block with:
//      const iconPath = getNotificationIcon()
//      getPlatformServices().notification.send({ title, body, icon: iconPath })
```

- [ ] **Step 3: Run full test suite**

```bash
bun run test
```

Expected: all tests pass. If any test imports `setMainWindow`, remove that import and the call.

- [ ] **Step 4: TypeScript check**

```bash
bunx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/process/bridge/notificationBridge.ts
git commit -m "feat(platform): migrate notificationBridge to IPlatformServices.notification"
```

---

## Task 10: Phase 3 cleanup

**Files:**

- Modify: `src/common/electronSafe.ts`

- [ ] **Step 1: Add @internal JSDoc to electronSafe.ts**

Add this block at the top of the file, after the license comment:

```typescript
/**
 * @internal
 *
 * Null-safe Electron shim. Import ONLY from:
 *   - src/process/utils/tray.ts
 *   - src/process/services/conversionService.ts
 *   - src/common/platform/ElectronPlatformServices.ts (imports 'electron' directly, not this file)
 *
 * All other modules must use getPlatformServices() from '@/common/platform' instead.
 */
```

- [ ] **Step 2: Verify no unexpected consumers remain**

```bash
grep -r "from.*electronSafe" src/ --include="*.ts" | grep -v "tray.ts" | grep -v "conversionService.ts"
```

Expected: no output. If any files appear, migrate them using the patterns from Tasks 6-9.

- [ ] **Step 3: Run full test suite one final time**

```bash
bun run test
```

Expected: all tests pass.

- [ ] **Step 4: TypeScript final check**

```bash
bunx tsc --noEmit
```

- [ ] **Step 5: Final commit**

```bash
git add src/common/electronSafe.ts
git commit -m "chore(platform): mark electronSafe.ts as @internal with allowed consumers"
```

---

## Verification

After all tasks are complete, verify the standalone server starts correctly:

```bash
# Build the server bundle (esbuild, externalizes native addons)
bun run build:server

# Start the standalone server
DATA_DIR=/tmp/aionui-test node dist-server/server.js
```

Expected: `[server] WebUI running on http://localhost:3000` with no Electron-related errors.

Also confirm desktop Electron mode still works:

```bash
bun run test
```

Expected: all existing tests continue to pass.
