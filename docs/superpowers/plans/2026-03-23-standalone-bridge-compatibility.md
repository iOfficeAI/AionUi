# Standalone Bridge Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable standalone (no-Electron) server mode to have full bridge coverage for skills hub, MCP, cron, notifications, and core fs operations by removing Electron coupling from bridges that don't need it.

**Architecture:** Three work streams: (1) directly enable three zero-change bridges in `initBridgeStandalone.ts`; (2) decouple `fsBridge.ts` from Electron by replacing the two internal path-resolution functions with `initStorage.ts` exports that already abstract the platform; (3) extract the platform-agnostic handlers from `applicationBridge.ts` into a shared `applicationBridgeCore.ts` so both modes share one implementation. Electron-only concepts (devtools, zoom, CDP, window controls) remain Electron-only.

**Tech Stack:** TypeScript, Vitest 4, Node.js fs/promises, `@process/utils/initStorage` path utilities, `@office-ai/platform` bridge adapter

---

## File Map

| Action | File                                                      | Responsibility                                                                                                                |
| ------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Modify | `src/process/bridge/fsBridge.ts`                          | Remove `import { app } from 'electron'`; replace `getUserSkillsDir()` + `findBuiltinResourceDir()` with `initStorage` exports |
| Create | `src/process/bridge/applicationBridgeCore.ts`             | `systemInfo`, `updateSystemInfo`, `getPath` handlers — platform-agnostic                                                      |
| Modify | `src/process/bridge/applicationBridge.ts`                 | Import from core; keep Electron-only handlers here                                                                            |
| Modify | `src/process/utils/initBridgeStandalone.ts`               | Add: cronBridge, mcpBridge, notificationBridge, fsBridge; add applicationBridgeCore partial init                              |
| Create | `tests/unit/process/bridge/fsBridge.standalone.test.ts`   | Verify fsBridge loads and path helpers work in Node env                                                                       |
| Create | `tests/unit/process/bridge/applicationBridgeCore.test.ts` | Verify core handlers return correct data without Electron                                                                     |

---

## Task 1: Enable zero-change bridges in standalone mode

**Files:**

- Modify: `src/process/utils/initBridgeStandalone.ts`

These three bridges have no Electron imports and their underlying services already work in Node mode. They need only to be registered.

- [ ] **Step 1: Add imports for the three bridges**

Open `src/process/utils/initBridgeStandalone.ts` and add these three import lines alongside the existing imports:

```ts
import { initCronBridge } from '@process/bridge/cronBridge';
import { initMcpBridge } from '@process/bridge/mcpBridge';
import { initNotificationBridge } from '@process/bridge/notificationBridge';
```

- [ ] **Step 2: Call the three init functions inside `initBridgeStandalone()`**

Add the three calls after `initSystemSettingsBridge()`:

```ts
initCronBridge();
initMcpBridge();
initNotificationBridge();
```

- [ ] **Step 3: Update the skipped-bridges comment**

Change the comment at the top of the function from:

```ts
// Skipped (Electron-only): dialogBridge, shellBridge, fsBridge, applicationBridge,
// windowControlsBridge, updateBridge, webuiBridge, notificationBridge, cronBridge, mcpBridge
```

to:

```ts
// Skipped (Electron-only): dialogBridge, shellBridge, applicationBridge (partial — see applicationBridgeCore),
// windowControlsBridge, updateBridge, webuiBridge
```

- [ ] **Step 4: Verify the server compiles**

```bash
bunx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/process/utils/initBridgeStandalone.ts
git commit -m "feat(server): enable cronBridge, mcpBridge, notificationBridge in standalone mode"
```

---

## Task 2: Decouple fsBridge from Electron

**Files:**

- Modify: `src/process/bridge/fsBridge.ts`
- Create: `tests/unit/process/bridge/fsBridge.standalone.test.ts`

`fsBridge.ts` imports `app` from `electron` only for two internal helper functions. Replacing them with the equivalent `initStorage` exports removes the Electron dependency entirely.

### Background: path equivalence

| Current (Electron)                           | Replacement (standalone-safe)                                                                                               |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `app.getPath('userData') + '/config/skills'` | `getSkillsDir()` from `initStorage` — resolves to the same path via `getPlatformServices()` abstraction                     |
| `app.isPackaged` + `app.getAppPath()`        | `getBuiltinSkillsDir()` from `initStorage` — returns `getSkillsDir()/_builtin`, which is the correct location in both modes |

- [ ] **Step 1: Write a failing import test**

Create `tests/unit/process/bridge/fsBridge.standalone.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the bridge so provider() calls are no-ops
vi.mock('@office-ai/platform', () => ({
  bridge: {
    buildProvider: () => ({
      provider: vi.fn(),
      invoke: vi.fn(),
    }),
    buildEmitter: () => ({
      emit: vi.fn(),
      on: vi.fn(),
    }),
  },
}));

// Mock initStorage path helpers
vi.mock('@process/utils/initStorage', () => ({
  getSkillsDir: () => '/mock/skills',
  getBuiltinSkillsDir: () => '/mock/skills/_builtin',
  getSystemDir: () => ({
    workDir: '/mock/work',
    cacheDir: '/mock/cache',
    logDir: '/mock/logs',
    platform: 'linux',
    arch: 'x64',
  }),
  getAssistantsDir: () => '/mock/assistants',
}));

// Mock common ipcBridge
vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      getFilesByDir: { provider: vi.fn() },
      getImageBase64: { provider: vi.fn() },
      fetchRemoteImage: { provider: vi.fn() },
      readFile: { provider: vi.fn() },
      readFileBuffer: { provider: vi.fn() },
      createTempFile: { provider: vi.fn() },
      writeFile: { provider: vi.fn() },
      createZip: { provider: vi.fn() },
      cancelZip: { provider: vi.fn() },
      getFileMetadata: { provider: vi.fn() },
      copyFilesToWorkspace: { provider: vi.fn() },
      removeEntry: { provider: vi.fn() },
      renameEntry: { provider: vi.fn() },
      readBuiltinRule: { provider: vi.fn() },
      readBuiltinSkill: { provider: vi.fn() },
      readAssistantRule: { provider: vi.fn() },
      writeAssistantRule: { provider: vi.fn() },
      deleteAssistantRule: { provider: vi.fn() },
      readAssistantSkill: { provider: vi.fn() },
      writeAssistantSkill: { provider: vi.fn() },
      deleteAssistantSkill: { provider: vi.fn() },
      listAvailableSkills: { provider: vi.fn() },
      readSkillInfo: { provider: vi.fn() },
      importSkill: { provider: vi.fn() },
      scanForSkills: { provider: vi.fn() },
      detectCommonSkillPaths: { provider: vi.fn() },
      detectAndCountExternalSkills: { provider: vi.fn() },
      importSkillWithSymlink: { provider: vi.fn() },
      deleteSkill: { provider: vi.fn() },
      getSkillPaths: { provider: vi.fn() },
      exportSkillWithSymlink: { provider: vi.fn() },
      getCustomExternalPaths: { provider: vi.fn() },
      addCustomExternalPath: { provider: vi.fn() },
      removeCustomExternalPath: { provider: vi.fn() },
      enableSkillsMarket: { provider: vi.fn() },
      disableSkillsMarket: { provider: vi.fn() },
    },
    fileStream: { contentUpdate: { emit: vi.fn() } },
  },
}));

describe('fsBridge standalone compatibility', () => {
  it('imports without requiring electron', async () => {
    // If this import succeeds, the module has no top-level Electron dependency
    const mod = await import('@process/bridge/fsBridge');
    expect(mod.initFsBridge).toBeTypeOf('function');
  });

  it('initFsBridge() registers all providers without throwing', async () => {
    const { initFsBridge } = await import('@process/bridge/fsBridge');
    expect(() => initFsBridge()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test — expect it to FAIL**

```bash
bun run test tests/unit/process/bridge/fsBridge.standalone.test.ts
```

Expected failure: error importing `electron` (because `fsBridge.ts` still has `import { app } from 'electron'`).

- [ ] **Step 3: Remove Electron dependency from `fsBridge.ts`**

In `src/process/bridge/fsBridge.ts`:

3a. Remove the Electron import:

```ts
// DELETE this line:
import { app } from 'electron';
```

3b. Add initStorage imports (add to the existing `@process/utils/initStorage` import if one exists, or add new):

```ts
import { getSystemDir, getAssistantsDir, getSkillsDir, getBuiltinSkillsDir } from '@process/utils/initStorage';
```

3c. Delete the `getUserSkillsDir()` function entirely:

```ts
// DELETE:
function getUserSkillsDir(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'config', 'skills');
}
```

3d. Delete the `findBuiltinResourceDir()` function entirely (lines ~33–79 in the original file).

3e. Replace all call sites:

| Old call                                    | Replacement                           |
| ------------------------------------------- | ------------------------------------- |
| `getUserSkillsDir()`                        | `getSkillsDir()`                      |
| `await findBuiltinResourceDir('skills')`    | `getBuiltinSkillsDir()`               |
| `await findBuiltinResourceDir('rules')`     | needs separate handling — see step 3f |
| `await findBuiltinResourceDir('assistant')` | needs separate handling — see step 3f |

3f. For `rules` and `assistant` resource types (`readBuiltinRule`, `readBuiltinSkill`, `readAssistantRule`, `readAssistantSkill` handlers), `findBuiltinResourceDir` was used to locate the bundled app resources. In standalone mode there is no app bundle, so these handlers should gracefully return empty string when the directory doesn't exist (which they already do via the `try/catch` in `readAssistantResource`). Replace `findBuiltinResourceDir('rules')` with a helper that uses `process.cwd()` as the search root:

```ts
/**
 * Resolve builtin resource directory without Electron.
 * In development: looks relative to process.cwd().
 * In standalone server: same. Returns first existing candidate.
 */
async function findBuiltinResourceDirNode(resourceType: 'rules' | 'skills' | 'assistant'): Promise<string> {
  const base = process.cwd();
  const devDir =
    resourceType === 'skills' || resourceType === 'assistant' ? `src/process/resources/${resourceType}` : resourceType;
  const candidates = [path.join(base, devDir), path.join(base, '..', devDir), path.join(base, resourceType)];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try next
    }
  }
  return candidates[0];
}
```

Replace all `findBuiltinResourceDir(...)` call sites with `findBuiltinResourceDirNode(...)`.

> **Note on `getSkillPaths` handler:** The existing handler returns `{ userSkillsDir, builtinSkillsDir }`. After the refactor it becomes:
>
> ```ts
> ipcBridge.fs.getSkillPaths.provider(async () => ({
>   userSkillsDir: getSkillsDir(),
>   builtinSkillsDir: getBuiltinSkillsDir(),
> }));
> ```

- [ ] **Step 4: Run the test — expect it to PASS**

```bash
bun run test tests/unit/process/bridge/fsBridge.standalone.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
bun run test
```

Expected: no regressions.

- [ ] **Step 6: Type-check**

```bash
bunx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Register fsBridge in standalone mode**

In `src/process/utils/initBridgeStandalone.ts`:

Add import:

```ts
import { initFsBridge } from '@process/bridge/fsBridge';
```

Add call inside `initBridgeStandalone()`, after `initFileWatchBridge()`:

```ts
initFsBridge();
```

- [ ] **Step 8: Verify compile again**

```bash
bunx tsc --noEmit
```

- [ ] **Step 9: Commit**

```bash
git add src/process/bridge/fsBridge.ts \
        src/process/utils/initBridgeStandalone.ts \
        tests/unit/process/bridge/fsBridge.standalone.test.ts
git commit -m "feat(server): decouple fsBridge from Electron, enable in standalone mode

Replace getUserSkillsDir() and findBuiltinResourceDir() with
initStorage exports (getSkillsDir, getBuiltinSkillsDir) which
already abstract the platform via getPlatformServices().
Fixes skills hub showing 0 skills in standalone server mode."
```

---

## Task 3: Extract applicationBridgeCore for shared platform-agnostic handlers

**Files:**

- Create: `src/process/bridge/applicationBridgeCore.ts`
- Modify: `src/process/bridge/applicationBridge.ts`
- Modify: `src/process/utils/initBridgeStandalone.ts`
- Create: `tests/unit/process/bridge/applicationBridgeCore.test.ts`

Only `systemInfo` and `updateSystemInfo` are meaningful in standalone mode. `getPath` can be partially implemented using `os`. The rest (devtools, zoom, CDP, restart) are Electron-only stubs.

- [ ] **Step 1: Write failing tests for the core handlers**

Create `tests/unit/process/bridge/applicationBridgeCore.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/common', () => ({
  ipcBridge: {
    application: {
      systemInfo: { provider: vi.fn() },
      updateSystemInfo: { provider: vi.fn() },
      getPath: { provider: vi.fn() },
      restart: { provider: vi.fn() },
      openDevTools: { provider: vi.fn() },
      isDevToolsOpened: { provider: vi.fn() },
      getZoomFactor: { provider: vi.fn() },
      setZoomFactor: { provider: vi.fn() },
      getCdpStatus: { provider: vi.fn() },
      updateCdpConfig: { provider: vi.fn() },
      logStream: { emit: vi.fn() },
      devToolsStateChanged: { emit: vi.fn() },
    },
  },
}));

vi.mock('@process/utils/initStorage', () => ({
  getSystemDir: () => ({
    cacheDir: '/mock/cache',
    workDir: '/mock/work',
    logDir: '/mock/logs',
    platform: 'linux',
    arch: 'x64',
  }),
  ProcessEnv: { set: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('@process/utils', () => ({
  copyDirectoryRecursively: vi.fn().mockResolvedValue(undefined),
}));

describe('initApplicationBridgeCore', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('imports without requiring electron', async () => {
    const mod = await import('@process/bridge/applicationBridgeCore');
    expect(mod.initApplicationBridgeCore).toBeTypeOf('function');
  });

  it('registers systemInfo and updateSystemInfo providers', async () => {
    const { ipcBridge } = await import('@/common');
    const { initApplicationBridgeCore } = await import('@process/bridge/applicationBridgeCore');
    initApplicationBridgeCore();
    expect(ipcBridge.application.systemInfo.provider).toHaveBeenCalledOnce();
    expect(ipcBridge.application.updateSystemInfo.provider).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL (file doesn't exist yet)**

```bash
bun run test tests/unit/process/bridge/applicationBridgeCore.test.ts
```

Expected: module not found error.

- [ ] **Step 3: Create `applicationBridgeCore.ts`**

Create `src/process/bridge/applicationBridgeCore.ts`:

```ts
/**
 * Platform-agnostic application bridge handlers.
 * Safe to use in both Electron and standalone server mode.
 * Electron-only handlers (restart, devtools, zoom, CDP) remain in applicationBridge.ts.
 */
import os from 'os';
import { ipcBridge } from '@/common';
import { getSystemDir, ProcessEnv } from '@process/utils/initStorage';
import { copyDirectoryRecursively } from '@process/utils';

export function initApplicationBridgeCore(): void {
  ipcBridge.application.systemInfo.provider(() => {
    return Promise.resolve(getSystemDir());
  });

  ipcBridge.application.updateSystemInfo.provider(async ({ cacheDir, workDir }) => {
    try {
      const oldDir = getSystemDir();
      if (oldDir.cacheDir !== cacheDir) {
        await copyDirectoryRecursively(oldDir.cacheDir, cacheDir);
      }
      await ProcessEnv.set('aionui.dir', { cacheDir, workDir });
      return { success: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { success: false, msg };
    }
  });

  ipcBridge.application.getPath.provider(({ name }) => {
    // Resolve common paths without Electron
    const home = os.homedir();
    const map: Record<string, string> = {
      home,
      desktop: path.join(home, 'Desktop'),
      downloads: path.join(home, 'Downloads'),
    };
    return Promise.resolve(map[name] ?? home);
  });
}
```

> Add `import path from 'path';` at the top of the file alongside the `os` import.

- [ ] **Step 4: Run the test — expect PASS**

```bash
bun run test tests/unit/process/bridge/applicationBridgeCore.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Update `applicationBridge.ts` to import from core**

In `src/process/bridge/applicationBridge.ts`:

5a. Add import:

```ts
import { initApplicationBridgeCore } from './applicationBridgeCore';
```

5b. At the top of `initApplicationBridge()`, replace the three handlers that moved to core with a single call:

```ts
// Replace the systemInfo, updateSystemInfo, and getPath provider blocks with:
initApplicationBridgeCore();
```

Remove the now-duplicate implementations of `systemInfo`, `updateSystemInfo`, and `getPath` from `applicationBridge.ts`.

- [ ] **Step 6: Run full test suite**

```bash
bun run test
```

Expected: all tests pass.

- [ ] **Step 7: Type-check**

```bash
bunx tsc --noEmit
```

- [ ] **Step 8: Register applicationBridgeCore in standalone mode**

In `src/process/utils/initBridgeStandalone.ts`:

Add import:

```ts
import { initApplicationBridgeCore } from '@process/bridge/applicationBridgeCore';
```

Add call:

```ts
initApplicationBridgeCore();
```

- [ ] **Step 9: Type-check one more time**

```bash
bunx tsc --noEmit
```

- [ ] **Step 10: Commit**

```bash
git add src/process/bridge/applicationBridgeCore.ts \
        src/process/bridge/applicationBridge.ts \
        src/process/utils/initBridgeStandalone.ts \
        tests/unit/process/bridge/applicationBridgeCore.test.ts
git commit -m "feat(server): extract applicationBridgeCore for standalone mode

systemInfo, updateSystemInfo, getPath are now shared between
Electron and standalone. Electron-only handlers (restart,
devtools, zoom, CDP) remain in applicationBridge.ts."
```

---

## Verification

After all tasks are complete, manually verify in the running server:

- [ ] Start server: `bun run server:start`
- [ ] Open `http://localhost:3000/#/settings/skills-hub`
- [ ] Confirm skills list loads (no longer stuck on "请稍候...")
- [ ] Open `http://localhost:3000/#/settings/system` — confirm system info displays correctly
- [ ] Check browser console for any bridge-related errors
