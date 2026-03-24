# Config Migration: Electron → Node Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the AionUi standalone Node server to automatically import AI provider and MCP config from the Electron desktop app on first startup, with optional manual import via environment variable.

**Architecture:** New module `configMigration.ts` encapsulates all path resolution and key-filtering logic. It receives the config store as an injected dependency (a minimal `ConfigStore` interface) so it can be unit-tested without touching the filesystem — this is an intentional improvement over the spec's signature which omits the parameter. `initStorage.ts` calls migration functions after `migrateLegacyData()` and `ConfigStorage.interceptor()` so storage is ready (authoritative order is the "Call Order" section of the spec; the spec's Design section header has a contradictory note that should be ignored). Both auto-migration (once, via flag) and manual import (every startup via `IMPORT_CONFIG_FROM` env var) share the same core import logic.

**Tech Stack:** Node.js `fs/promises`, `os`, `path`, Vitest 4, TypeScript strict mode

---

## File Map

| Action | Path                                               | Responsibility                                                         |
| ------ | -------------------------------------------------- | ---------------------------------------------------------------------- |
| Modify | `src/common/config/storage.ts`                     | Add `migration.electronConfigImported` to `IConfigStorageRefer`        |
| Create | `src/process/utils/configMigration.ts`             | All migration logic: path resolution, decoding, key filtering, writing |
| Modify | `src/process/utils/initStorage.ts`                 | Call migration functions after storage interceptors are set up         |
| Create | `tests/unit/process/utils/configMigration.test.ts` | Unit tests for all exported functions                                  |

---

## Task 1: Add migration flag type to `IConfigStorageRefer`

**Files:**

- Modify: `src/common/config/storage.ts` (around line 88, near other `migration.*` flags)

- [ ] **Step 1: Open `src/common/config/storage.ts` and locate the migration flag block** (lines ~82–90)

- [ ] **Step 2: Add the new flag**

Find the block ending with `'migration.promptsI18nAdded'` and add after it:

```typescript
  /** Migration flag: Electron desktop config has been imported to server config */
  'migration.electronConfigImported'?: boolean;
```

- [ ] **Step 3: Verify no type errors**

```bash
bunx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/common/config/storage.ts
git commit -m "chore(storage): add migration.electronConfigImported flag to IConfigStorageRefer"
```

---

## Task 2: Write failing tests for path resolution

**Files:**

- Create: `tests/unit/process/utils/configMigration.test.ts`

The encoding used by `JsonFileBuilder` is: `btoa(encodeURIComponent(JSON.stringify(data)))`.
To produce test fixtures inline: `Buffer.from(encodeURIComponent(JSON.stringify(data))).toString('base64')`.

- [ ] **Step 1: Create the test file with path resolution tests**

Create `tests/unit/process/utils/configMigration.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import os from 'os';
import path from 'path';

// Helper: encode data the same way JsonFileBuilder does
const encodeConfig = (data: unknown): string =>
  Buffer.from(encodeURIComponent(JSON.stringify(data))).toString('base64');

describe('getElectronConfigCandidatePaths', () => {
  const originalPlatform = process.platform;
  const originalEnv = { ...process.env };

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    process.env = { ...originalEnv };
  });

  it('returns both symlink candidates on macOS', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    const { getElectronConfigCandidatePaths } = await import('../../../../src/process/utils/configMigration');
    const home = os.homedir();
    const paths = getElectronConfigCandidatePaths();
    expect(paths).toContain(path.join(home, '.aionui-config', 'aionui-config.txt'));
    expect(paths).toContain(path.join(home, '.aionui-config-dev', 'aionui-config.txt'));
    expect(paths).toHaveLength(2);
  });

  it('returns both app-name candidates on Windows', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    process.env.APPDATA = 'C:\\Users\\test\\AppData\\Roaming';
    const { getElectronConfigCandidatePaths } = await import('../../../../src/process/utils/configMigration');
    const paths = getElectronConfigCandidatePaths();
    expect(paths).toContain('C:\\Users\\test\\AppData\\Roaming\\AionUi\\config\\aionui-config.txt');
    expect(paths).toContain('C:\\Users\\test\\AppData\\Roaming\\AionUi-Dev\\config\\aionui-config.txt');
    expect(paths).toHaveLength(2);
  });

  it('returns both app-name candidates on Linux', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const { getElectronConfigCandidatePaths } = await import('../../../../src/process/utils/configMigration');
    const home = os.homedir();
    const paths = getElectronConfigCandidatePaths();
    expect(paths).toContain(path.join(home, '.config', 'AionUi', 'config', 'aionui-config.txt'));
    expect(paths).toContain(path.join(home, '.config', 'AionUi-Dev', 'config', 'aionui-config.txt'));
    expect(paths).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
bunx vitest run tests/unit/process/utils/configMigration.test.ts
```

Expected: FAIL — `configMigration` module not found

---

## Task 3: Implement `configMigration.ts` (path helpers only)

**Files:**

- Create: `src/process/utils/configMigration.ts`

- [ ] **Step 1: Create the file with path resolution + decode helpers**

```typescript
import { existsSync, readFileSync } from 'fs';
import os from 'os';
import path from 'path';
import type { IConfigStorageRefer, IMcpServer } from '@/common/config/storage';

// Keys allowed to migrate from Electron config to server config.
// UI-only keys (theme, language, webui.desktop.*) and caches (acp.cachedModels)
// are intentionally excluded.
export const MIGRATABLE_KEYS: ReadonlyArray<keyof IConfigStorageRefer> = [
  'model.config',
  'gemini.config',
  'acp.config',
  'tools.imageGenerationModel',
  'mcp.config',
  'acp.customAgents',
] as const;

// Minimal interface for the config store — enables testing without real files.
export interface ConfigStore {
  get<K extends keyof IConfigStorageRefer>(key: K): Promise<IConfigStorageRefer[K]>;
  set<K extends keyof IConfigStorageRefer>(key: K, value: IConfigStorageRefer[K]): Promise<IConfigStorageRefer[K]>;
}

/**
 * Returns candidate Electron config file paths for the current platform.
 * Always returns two candidates (packaged + dev app name) since the server
 * cannot determine which Electron build the user ran.
 */
export function getElectronConfigCandidatePaths(): string[] {
  const home = os.homedir();
  if (process.platform === 'darwin') {
    return [
      path.join(home, '.aionui-config', 'aionui-config.txt'),
      path.join(home, '.aionui-config-dev', 'aionui-config.txt'),
    ];
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming');
    return [
      path.join(appData, 'AionUi', 'config', 'aionui-config.txt'),
      path.join(appData, 'AionUi-Dev', 'config', 'aionui-config.txt'),
    ];
  }
  // Linux and other platforms
  return [
    path.join(home, '.config', 'AionUi', 'config', 'aionui-config.txt'),
    path.join(home, '.config', 'AionUi-Dev', 'config', 'aionui-config.txt'),
  ];
}

/**
 * Decode a config file written by JsonFileBuilder (base64 → URL-decode → JSON).
 * Returns {} on any error (missing file, corrupted content, invalid JSON).
 */
export function decodeConfigFile(filePath: string): Partial<IConfigStorageRefer> {
  try {
    const raw = readFileSync(filePath, 'utf8').trim();
    if (!raw) return {};
    const decoded = decodeURIComponent(atob(raw));
    if (!decoded.trim()) return {};
    return JSON.parse(decoded) as Partial<IConfigStorageRefer>;
  } catch {
    return {};
  }
}

/**
 * Filter mcp.config: remove builtin entries (their command paths are machine-local
 * and are recreated by ensureBuiltinMcpServers on every startup anyway).
 */
function filterMcpConfig(servers: IMcpServer[]): IMcpServer[] {
  return servers.filter((s) => !s.builtin);
}
```

- [ ] **Step 2: Run the path resolution tests**

```bash
bunx vitest run tests/unit/process/utils/configMigration.test.ts
```

Expected: path resolution tests PASS

---

## Task 4: Write failing tests for `migrateFromElectronConfig`

**Files:**

- Modify: `tests/unit/process/utils/configMigration.test.ts`

- [ ] **Step 1: Add `migrateFromElectronConfig` tests**

Append to the test file (after the path resolution `describe` block):

```typescript
describe('migrateFromElectronConfig', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('skips migration when flag is already set', async () => {
    const store: Record<string, unknown> = {
      'migration.electronConfigImported': true,
    };
    const configStore = {
      get: vi.fn(async (key: string) => store[key]),
      set: vi.fn(async (key: string, value: unknown) => {
        store[key] = value;
        return value;
      }),
    };
    const { migrateFromElectronConfig } = await import('../../../../src/process/utils/configMigration');
    await migrateFromElectronConfig(configStore as any);
    // set should never be called — migration was already done
    expect(configStore.set).not.toHaveBeenCalled();
  });

  it('skips migration when no Electron config file exists', async () => {
    const store: Record<string, unknown> = {};
    const configStore = {
      get: vi.fn(async (key: string) => store[key]),
      set: vi.fn(async (key: string, value: unknown) => {
        store[key] = value;
        return value;
      }),
    };
    // Explicitly mock existsSync to return false — do not rely on real filesystem
    // (CI machines might have ~/.aionui-config from a previous run)
    vi.doMock('fs', () => ({
      existsSync: vi.fn().mockReturnValue(false),
      readFileSync: vi.fn().mockReturnValue(''),
    }));
    const { migrateFromElectronConfig } = await import('../../../../src/process/utils/configMigration');
    await migrateFromElectronConfig(configStore as any);
    expect(configStore.set).not.toHaveBeenCalled();
  });

  it('skips mcp.config write when all entries are builtin, but still sets flag', async () => {
    const sourceData = {
      'mcp.config': [
        {
          id: 'builtin-img',
          name: 'img',
          builtin: true,
          enabled: false,
          transport: { type: 'stdio', command: 'node', args: ['/path.js'] },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };
    const encodedSource = Buffer.from(encodeURIComponent(JSON.stringify(sourceData))).toString('base64');
    const store: Record<string, unknown> = {};
    const configStore = {
      get: vi.fn(async (key: string) => store[key]),
      set: vi.fn(async (key: string, value: unknown) => {
        store[key] = value;
        return value;
      }),
    };
    vi.doMock('fs', () => ({
      existsSync: vi.fn().mockReturnValue(true),
      readFileSync: vi.fn().mockReturnValue(encodedSource),
    }));
    const { migrateFromElectronConfig } = await import('../../../../src/process/utils/configMigration');
    await migrateFromElectronConfig(configStore as any);
    expect(configStore.set).not.toHaveBeenCalledWith('mcp.config', expect.anything());
    expect(configStore.set).toHaveBeenCalledWith('migration.electronConfigImported', true);
  });

  it('does not set migration flag when source file decodes to {}', async () => {
    const store: Record<string, unknown> = {};
    const configStore = {
      get: vi.fn(async (key: string) => store[key]),
      set: vi.fn(async (key: string, value: unknown) => {
        store[key] = value;
        return value;
      }),
    };
    vi.doMock('fs', () => ({
      existsSync: vi.fn().mockReturnValue(true),
      readFileSync: vi.fn().mockReturnValue(''), // empty → decodes to {}
    }));
    const { migrateFromElectronConfig } = await import('../../../../src/process/utils/configMigration');
    await migrateFromElectronConfig(configStore as any);
    expect(configStore.set).not.toHaveBeenCalled();
  });

  it('migrates whitelisted keys, skipping existing ones', async () => {
    const sourceData = {
      'model.config': [{ id: 'openai', name: 'OpenAI' }],
      'gemini.config': { authType: 'oauth', proxy: '' },
      language: 'zh-CN', // not whitelisted — should be ignored
    };
    const encodedSource = Buffer.from(encodeURIComponent(JSON.stringify(sourceData))).toString('base64');

    const store: Record<string, unknown> = {};
    const configStore = {
      get: vi.fn(async (key: string) => store[key]),
      set: vi.fn(async (key: string, value: unknown) => {
        store[key] = value;
        return value;
      }),
    };
    vi.doMock('fs', () => ({
      existsSync: vi.fn().mockReturnValue(true),
      readFileSync: vi.fn().mockReturnValue(encodedSource),
    }));
    const { migrateFromElectronConfig } = await import('../../../../src/process/utils/configMigration');
    await migrateFromElectronConfig(configStore as any);

    expect(configStore.set).toHaveBeenCalledWith('model.config', sourceData['model.config']);
    expect(configStore.set).toHaveBeenCalledWith('gemini.config', sourceData['gemini.config']);
    // language must NOT be migrated
    expect(configStore.set).not.toHaveBeenCalledWith('language', expect.anything());
    // migration flag must be set
    expect(configStore.set).toHaveBeenCalledWith('migration.electronConfigImported', true);
  });

  it('does not overwrite keys that already exist in server config', async () => {
    const sourceData = { 'model.config': [{ id: 'openai' }] };
    const encodedSource = Buffer.from(encodeURIComponent(JSON.stringify(sourceData))).toString('base64');

    const store: Record<string, unknown> = {
      'model.config': [{ id: 'existing-provider' }], // already configured
    };
    const configStore = {
      get: vi.fn(async (key: string) => store[key]),
      set: vi.fn(async (key: string, value: unknown) => {
        store[key] = value;
        return value;
      }),
    };
    vi.doMock('fs', () => ({
      existsSync: vi.fn().mockReturnValue(true),
      readFileSync: vi.fn().mockReturnValue(encodedSource),
    }));
    const { migrateFromElectronConfig } = await import('../../../../src/process/utils/configMigration');
    await migrateFromElectronConfig(configStore as any);

    expect(configStore.set).not.toHaveBeenCalledWith('model.config', expect.anything());
    // flag is still set even though no keys were actually written
    expect(configStore.set).toHaveBeenCalledWith('migration.electronConfigImported', true);
  });

  it('filters builtin:true entries from mcp.config', async () => {
    const sourceData = {
      'mcp.config': [
        {
          id: 'builtin-img',
          name: 'img-gen',
          builtin: true,
          enabled: false,
          transport: { type: 'stdio', command: 'node', args: ['/abs/path.js'] },
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'user-mcp',
          name: 'my-server',
          builtin: false,
          enabled: true,
          transport: { type: 'stdio', command: 'npx', args: ['some-mcp'] },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };
    const encodedSource = Buffer.from(encodeURIComponent(JSON.stringify(sourceData))).toString('base64');

    const store: Record<string, unknown> = {};
    const configStore = {
      get: vi.fn(async (key: string) => store[key]),
      set: vi.fn(async (key: string, value: unknown) => {
        store[key] = value;
        return value;
      }),
    };
    vi.doMock('fs', () => ({
      existsSync: vi.fn().mockReturnValue(true),
      readFileSync: vi.fn().mockReturnValue(encodedSource),
    }));
    const { migrateFromElectronConfig } = await import('../../../../src/process/utils/configMigration');
    await migrateFromElectronConfig(configStore as any);

    const writtenMcp = (configStore.set as ReturnType<typeof vi.fn>).mock.calls.find(
      ([k]) => k === 'mcp.config'
    )?.[1] as unknown[];
    expect(writtenMcp).toHaveLength(1);
    expect((writtenMcp[0] as any).id).toBe('user-mcp');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
bunx vitest run tests/unit/process/utils/configMigration.test.ts
```

Expected: FAIL — `migrateFromElectronConfig` not exported

- [ ] **Step 3: Commit the failing tests**

```bash
git add tests/unit/process/utils/configMigration.test.ts
git commit -m "test(config): add failing tests for migrateFromElectronConfig"
```

---

## Task 5: Implement `migrateFromElectronConfig`

**Files:**

- Modify: `src/process/utils/configMigration.ts`

- [ ] **Step 1: Append the function to `configMigration.ts`**

```typescript
/**
 * Auto-migration: on first server startup, copy whitelisted keys from the
 * Electron desktop config file (if present) to the server config store.
 * Uses a migration flag to run only once.
 */
export async function migrateFromElectronConfig(configStore: ConfigStore): Promise<void> {
  try {
    // Already migrated — skip
    const alreadyMigrated = await configStore.get('migration.electronConfigImported').catch(() => undefined);
    if (alreadyMigrated) return;

    // Find the first existing Electron config file
    const candidates = getElectronConfigCandidatePaths();
    const sourcePath = candidates.find((p) => existsSync(p));
    if (!sourcePath) return;

    // Decode — if result is empty, the file is missing/corrupted; do NOT set flag
    const sourceData = decodeConfigFile(sourcePath);
    if (Object.keys(sourceData).length === 0) {
      console.warn('[AionUi] Config migration: source file appears empty or corrupted, will retry next startup');
      return;
    }

    // Copy whitelisted keys that are absent in the server config
    for (const key of MIGRATABLE_KEYS) {
      const sourceValue = sourceData[key];
      if (sourceValue === undefined) continue;

      const existing = await configStore.get(key).catch(() => undefined);
      if (existing !== undefined && existing !== null) continue;

      // Special handling: filter builtin MCP entries
      if (key === 'mcp.config' && Array.isArray(sourceValue)) {
        const filtered = filterMcpConfig(sourceValue as IMcpServer[]);
        if (filtered.length > 0) {
          await configStore.set(key, filtered as IConfigStorageRefer[typeof key]);
        }
        continue;
      }

      await configStore.set(key, sourceValue as IConfigStorageRefer[typeof key]);
    }

    await configStore.set('migration.electronConfigImported', true);
    console.log('[AionUi] Config migrated from Electron desktop config:', sourcePath);
  } catch (error) {
    console.warn('[AionUi] Config migration from Electron failed:', error);
  }
}
```

- [ ] **Step 2: Run `migrateFromElectronConfig` tests**

```bash
bunx vitest run tests/unit/process/utils/configMigration.test.ts --reporter=verbose
```

Expected: all `migrateFromElectronConfig` tests PASS

---

## Task 6: Write failing tests for `importConfigFromFile`

**Files:**

- Modify: `tests/unit/process/utils/configMigration.test.ts`

- [ ] **Step 1: Append `importConfigFromFile` tests**

```typescript
describe('importConfigFromFile', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('skips import when file decodes to {}', async () => {
    const store: Record<string, unknown> = {};
    const configStore = {
      get: vi.fn(async (key: string) => store[key]),
      set: vi.fn(async (key: string, value: unknown) => {
        store[key] = value;
        return value;
      }),
    };
    vi.doMock('fs', () => ({
      existsSync: vi.fn().mockReturnValue(false),
      readFileSync: vi.fn().mockReturnValue(''),
    }));
    const { importConfigFromFile } = await import('../../../../src/process/utils/configMigration');
    await importConfigFromFile('/nonexistent/path.txt', false, configStore as any);
    expect(configStore.set).not.toHaveBeenCalled();
  });

  it('skips existing keys when overwrite=false', async () => {
    const sourceData = { 'model.config': [{ id: 'new' }], 'gemini.config': { authType: 'oauth', proxy: '' } };
    const encodedSource = Buffer.from(encodeURIComponent(JSON.stringify(sourceData))).toString('base64');
    const store: Record<string, unknown> = { 'model.config': [{ id: 'existing' }] };
    const configStore = {
      get: vi.fn(async (key: string) => store[key]),
      set: vi.fn(async (key: string, value: unknown) => {
        store[key] = value;
        return value;
      }),
    };
    vi.doMock('fs', () => ({
      existsSync: vi.fn().mockReturnValue(true),
      readFileSync: vi.fn().mockReturnValue(encodedSource),
    }));
    const { importConfigFromFile } = await import('../../../../src/process/utils/configMigration');
    await importConfigFromFile('/path/aionui-config.txt', false, configStore as any);
    expect(configStore.set).not.toHaveBeenCalledWith('model.config', expect.anything());
    expect(configStore.set).toHaveBeenCalledWith('gemini.config', sourceData['gemini.config']);
  });

  it('overwrites existing keys when overwrite=true', async () => {
    const sourceData = { 'model.config': [{ id: 'new' }] };
    const encodedSource = Buffer.from(encodeURIComponent(JSON.stringify(sourceData))).toString('base64');
    const store: Record<string, unknown> = { 'model.config': [{ id: 'existing' }] };
    const configStore = {
      get: vi.fn(async (key: string) => store[key]),
      set: vi.fn(async (key: string, value: unknown) => {
        store[key] = value;
        return value;
      }),
    };
    vi.doMock('fs', () => ({
      existsSync: vi.fn().mockReturnValue(true),
      readFileSync: vi.fn().mockReturnValue(encodedSource),
    }));
    const { importConfigFromFile } = await import('../../../../src/process/utils/configMigration');
    await importConfigFromFile('/path/aionui-config.txt', true, configStore as any);
    expect(configStore.set).toHaveBeenCalledWith('model.config', sourceData['model.config']);
  });

  it('always filters builtin:true from mcp.config regardless of overwrite', async () => {
    const sourceData = {
      'mcp.config': [
        {
          id: 'builtin',
          builtin: true,
          name: 'b',
          enabled: false,
          transport: { type: 'stdio', command: 'node', args: [] },
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'user',
          builtin: false,
          name: 'u',
          enabled: true,
          transport: { type: 'stdio', command: 'npx', args: ['mcp'] },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };
    const encodedSource = Buffer.from(encodeURIComponent(JSON.stringify(sourceData))).toString('base64');
    const store: Record<string, unknown> = {};
    const configStore = {
      get: vi.fn(async (key: string) => store[key]),
      set: vi.fn(async (key: string, value: unknown) => {
        store[key] = value;
        return value;
      }),
    };
    vi.doMock('fs', () => ({
      existsSync: vi.fn().mockReturnValue(true),
      readFileSync: vi.fn().mockReturnValue(encodedSource),
    }));
    const { importConfigFromFile } = await import('../../../../src/process/utils/configMigration');
    await importConfigFromFile('/path/aionui-config.txt', true, configStore as any);
    const written = (configStore.set as ReturnType<typeof vi.fn>).mock.calls.find(
      ([k]) => k === 'mcp.config'
    )?.[1] as unknown[];
    expect(written).toHaveLength(1);
    expect((written[0] as any).id).toBe('user');
  });

  it('resolves relative path and warns', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store: Record<string, unknown> = {};
    const configStore = {
      get: vi.fn(async (key: string) => store[key]),
      set: vi.fn(async (key: string, value: unknown) => {
        store[key] = value;
        return value;
      }),
    };
    vi.doMock('fs', () => ({
      existsSync: vi.fn().mockReturnValue(false),
      readFileSync: vi.fn().mockReturnValue(''),
    }));
    const { importConfigFromFile } = await import('../../../../src/process/utils/configMigration');
    await importConfigFromFile('relative/path.txt', false, configStore as any);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('relative path'), expect.any(String));
    warnSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
bunx vitest run tests/unit/process/utils/configMigration.test.ts
```

Expected: FAIL — `importConfigFromFile` not exported

- [ ] **Step 3: Commit the failing tests**

```bash
git add tests/unit/process/utils/configMigration.test.ts
git commit -m "test(config): add failing tests for importConfigFromFile"
```

---

## Task 7: Implement `importConfigFromFile`

**Files:**

- Modify: `src/process/utils/configMigration.ts`

- [ ] **Step 1: Append the function to `configMigration.ts`**

```typescript
/**
 * Manual import: copy whitelisted keys from a specified config file into the
 * server config store. Runs on every startup when IMPORT_CONFIG_FROM is set.
 * @param sourcePath - absolute path to an aionui-config.txt file
 * @param overwrite  - if true, overwrite existing keys; if false, skip them
 * @param configStore - injected config store (uses ProcessConfig in production)
 */
export async function importConfigFromFile(
  sourcePath: string,
  overwrite: boolean,
  configStore: ConfigStore
): Promise<void> {
  try {
    // Warn on relative paths and resolve them
    if (!path.isAbsolute(sourcePath)) {
      const resolved = path.resolve(process.cwd(), sourcePath);
      console.warn('[AionUi] IMPORT_CONFIG_FROM: relative path provided, resolving to:', resolved);
      sourcePath = resolved;
    }

    const sourceData = decodeConfigFile(sourcePath);
    if (Object.keys(sourceData).length === 0) {
      console.warn('[AionUi] IMPORT_CONFIG_FROM: file is missing, empty, or corrupted:', sourcePath);
      return;
    }

    for (const key of MIGRATABLE_KEYS) {
      const sourceValue = sourceData[key];
      if (sourceValue === undefined) continue;

      if (!overwrite) {
        const existing = await configStore.get(key).catch(() => undefined);
        if (existing !== undefined && existing !== null) continue;
      }

      // Special handling: filter builtin MCP entries
      if (key === 'mcp.config' && Array.isArray(sourceValue)) {
        const filtered = filterMcpConfig(sourceValue as IMcpServer[]);
        if (filtered.length > 0) {
          await configStore.set(key, filtered as IConfigStorageRefer[typeof key]);
        }
        continue;
      }

      await configStore.set(key, sourceValue as IConfigStorageRefer[typeof key]);
    }

    console.log('[AionUi] Config imported from:', sourcePath, '(overwrite:', overwrite, ')');
  } catch (error) {
    console.warn('[AionUi] IMPORT_CONFIG_FROM failed:', error);
  }
}
```

- [ ] **Step 2: Run all tests in the file**

```bash
bunx vitest run tests/unit/process/utils/configMigration.test.ts --reporter=verbose
```

Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/process/utils/configMigration.ts tests/unit/process/utils/configMigration.test.ts
git commit -m "feat(config): add configMigration module for Electron → server config import"
```

---

## Task 8: Wire migration into `initStorage.ts`

**Files:**

- Modify: `src/process/utils/initStorage.ts`

The migration functions must be called **after** `ConfigStorage.interceptor(configFile)` (line ~965 in current file) and **before** the MCP/assistant initialization steps.

- [ ] **Step 1: Add the import at the top of `initStorage.ts`**

Find the import section and add:

```typescript
import { migrateFromElectronConfig, importConfigFromFile } from './configMigration';
```

- [ ] **Step 2: Insert migration calls after storage interceptors**

Find this block in `initStorage()` (around line 965–968):

```typescript
ConfigStorage.interceptor(configFile);
ChatStorage.interceptor(chatFile);
ChatMessageStorage.interceptor(chatMessageFile);
EnvStorage.interceptor(envFile);
```

Add after it:

```typescript
// Migrate config from Electron desktop app (once, after storage is ready)
await migrateFromElectronConfig(configFile);

// Manual import from specified path (if env var present)
const importFrom = process.env.IMPORT_CONFIG_FROM;
if (importFrom) {
  const overwrite = process.env.IMPORT_CONFIG_OVERWRITE === 'true';
  await importConfigFromFile(importFrom, overwrite, configFile);
}
```

- [ ] **Step 3: Verify type compatibility**

The `configFile` returned by `JsonFileBuilder<IConfigStorageRefer>` structurally satisfies `ConfigStore`. If TypeScript reports a type error on the call sites (due to `Awaited<S>[K]` vs `IConfigStorageRefer[K]` variance), add an explicit cast at the call sites in `initStorage.ts`:

```typescript
await migrateFromElectronConfig(configFile as unknown as ConfigStore);
// ...
await importConfigFromFile(importFrom, overwrite, configFile as unknown as ConfigStore);
```

```bash
bunx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Run full test suite**

```bash
bun run test
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/process/utils/initStorage.ts
git commit -m "feat(config): wire config migration into initStorage startup sequence"
```

---

## Task 9: Final verification

- [ ] **Step 1: Run full test suite one more time**

```bash
bun run test
```

Expected: all tests pass

- [ ] **Step 2: Run type check**

```bash
bunx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Run linter**

```bash
bun run lint:fix
bun run format
```

Expected: no unfixable issues

- [ ] **Step 4: Final commit if any lint/format changes**

```bash
git add -A
git commit -m "chore: lint and format configMigration"
```

---

## Verification Checklist

Before marking this complete:

- [ ] `migration.electronConfigImported` is in `IConfigStorageRefer`
- [ ] `getElectronConfigCandidatePaths()` returns 2 candidates per platform
- [ ] Auto-migration runs only once (flag prevents repeat)
- [ ] Source file decoding to `{}` skips migration and does not set flag
- [ ] Whitelisted keys only — `language`, `theme`, etc. never migrate
- [ ] Existing server config keys not overwritten by auto-migration
- [ ] `builtin: true` MCP entries always filtered
- [ ] `IMPORT_CONFIG_FROM` runs every startup, respects `IMPORT_CONFIG_OVERWRITE`
- [ ] Relative paths in `IMPORT_CONFIG_FROM` are resolved with a warning
- [ ] All errors caught and warned — server always starts
- [ ] `bun run test` passes
- [ ] `bunx tsc --noEmit` passes
