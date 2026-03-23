/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for src/process/utils/shellEnv.ts
 *
 * Verifies that:
 * 1. mergePaths correctly combines PATH strings without duplicates
 * 2. getEnhancedEnv always includes process.env.PATH (critical for workers)
 * 3. Windows extra tool paths are detected and appended
 * 4. Shell environment is loaded and merged on macOS/Linux
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';

// -------------------------------------------------------------------
// 1. Pure-logic tests for mergePaths (no Electron, no mocking needed)
// -------------------------------------------------------------------
describe('mergePaths', () => {
  // Dynamic import after resetModules is NOT needed for this pure function
  // but we still import lazily so module cache is shared within this describe
  it('merges two PATH strings deduplicating common entries', async () => {
    const { mergePaths } = await import('@process/utils/shellEnv');
    const sep = process.platform === 'win32' ? ';' : ':';
    const p1 = ['/usr/bin', '/usr/local/bin'].join(sep);
    const p2 = ['/usr/local/bin', '/opt/homebrew/bin'].join(sep);
    const result = mergePaths(p1, p2);
    const parts = result.split(sep);
    // No duplicates
    expect(new Set(parts).size).toBe(parts.length);
    // Original order preserved (p1 first)
    expect(parts[0]).toBe('/usr/bin');
    expect(parts).toContain('/opt/homebrew/bin');
  });

  it('handles undefined first arg', async () => {
    const { mergePaths } = await import('@process/utils/shellEnv');
    const result = mergePaths(undefined, '/usr/bin');
    expect(result).toBe('/usr/bin');
  });

  it('handles undefined second arg', async () => {
    const { mergePaths } = await import('@process/utils/shellEnv');
    const result = mergePaths('/usr/bin', undefined);
    expect(result).toBe('/usr/bin');
  });

  it('handles both args undefined', async () => {
    const { mergePaths } = await import('@process/utils/shellEnv');
    expect(mergePaths(undefined, undefined)).toBe('');
  });

  it('preserves Windows semicolon separator', async () => {
    if (process.platform !== 'win32') return;
    const { mergePaths } = await import('@process/utils/shellEnv');
    const result = mergePaths('C:\\Windows\\System32', 'C:\\Users\\test\\AppData\\Roaming\\npm');
    // Entries must be separated by ; on Windows
    const parts = result.split(';');
    expect(parts.length).toBe(2);
    expect(parts[0]).toBe('C:\\Windows\\System32');
    expect(parts[1]).toBe('C:\\Users\\test\\AppData\\Roaming\\npm');
  });
});

// -------------------------------------------------------------------
// 2. getEnhancedEnv – verify it always includes process.env.PATH
//    (This is the core requirement for the worker fix)
// -------------------------------------------------------------------
describe('getEnhancedEnv', () => {
  const SENTINEL_PATH = '/sentinel-test-path/bin';

  beforeEach(() => {
    vi.resetModules();
  });

  it('includes process.env.PATH in the returned env (macOS/Linux, shell skipped via mock)', async () => {
    // Simulate shell that returns an empty env (shell not available / times out)
    vi.doMock('child_process', () => ({
      execFileSync: vi.fn().mockImplementation(() => {
        throw new Error('shell not available');
      }),
      execFile: vi.fn(),
    }));

    const originalPath = process.env.PATH;
    process.env.PATH = SENTINEL_PATH;

    const { getEnhancedEnv } = await import('@process/utils/shellEnv');
    const result = getEnhancedEnv();

    expect(result.PATH).toContain(SENTINEL_PATH);
    process.env.PATH = originalPath;
  });

  it('merges shell PATH with process.env.PATH (macOS/Linux, shell returns extra path)', async () => {
    if (process.platform === 'win32') return; // Shell loading skipped on Windows

    const SHELL_EXTRA = '/nvm/versions/node/v22/bin';
    vi.doMock('child_process', () => ({
      execFileSync: vi.fn().mockReturnValue(`PATH=${SHELL_EXTRA}:/usr/bin\nHOME=/home/user\n`),
      execFile: vi.fn(),
    }));

    const originalPath = process.env.PATH;
    const originalShell = process.env.SHELL;
    process.env.PATH = '/usr/local/bin';
    process.env.SHELL = '/bin/bash';

    const { getEnhancedEnv } = await import('@process/utils/shellEnv');
    const result = getEnhancedEnv();

    // Must contain both the process PATH and the shell PATH
    expect(result.PATH).toContain('/usr/local/bin');
    expect(result.PATH).toContain(SHELL_EXTRA);
    // No duplicates of /usr/bin
    const sep = ':';
    const parts = result.PATH.split(sep);
    expect(parts.filter((p) => p === '/usr/bin').length).toBeLessThanOrEqual(1);

    process.env.PATH = originalPath;
    process.env.SHELL = originalShell;
  });

  it('merges customEnv.PATH with both process.env.PATH and shell PATH', async () => {
    vi.doMock('child_process', () => ({
      execFileSync: vi.fn().mockImplementation(() => {
        throw new Error('skip shell');
      }),
      execFile: vi.fn(),
    }));

    const originalPath = process.env.PATH;
    process.env.PATH = '/usr/bin';

    const { getEnhancedEnv } = await import('@process/utils/shellEnv');
    const result = getEnhancedEnv({ PATH: '/custom/tools/bin' });

    expect(result.PATH).toContain('/usr/bin');
    expect(result.PATH).toContain('/custom/tools/bin');
    process.env.PATH = originalPath;
  });

  it('returns an object where all values are strings (not undefined)', async () => {
    vi.doMock('child_process', () => ({
      execFileSync: vi.fn().mockImplementation(() => {
        throw new Error('skip shell');
      }),
      execFile: vi.fn(),
    }));

    const { getEnhancedEnv } = await import('@process/utils/shellEnv');
    const result = getEnhancedEnv();
    expect(typeof result.PATH).toBe('string');
    // Spot-check: no undefined string values were injected
    for (const [k, v] of Object.entries(result)) {
      expect(typeof v).toBe('string');
    }
  });
});

// -------------------------------------------------------------------
// 3. Windows extra tool path detection
//    getWindowsExtraToolPaths() is private, but its effect is visible
//    through getEnhancedEnv() on win32.
// -------------------------------------------------------------------
describe('getEnhancedEnv Windows extra paths', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('appends npm global path on Windows when it exists and is not in PATH', async () => {
    if (process.platform !== 'win32') return; // Only meaningful on Windows

    const NPM_GLOBAL = 'C:\\Users\\test\\AppData\\Roaming\\npm';

    vi.doMock('fs', async () => {
      const actual = await vi.importActual<typeof import('fs')>('fs');
      return {
        ...actual,
        existsSync: vi.fn((p: string) => p === NPM_GLOBAL),
        readdirSync: vi.fn(() => []),
        accessSync: vi.fn(),
      };
    });

    const originalPath = process.env.PATH;
    const originalAppData = process.env.APPDATA;
    process.env.PATH = 'C:\\Windows\\System32'; // Does NOT contain npm global
    process.env.APPDATA = 'C:\\Users\\test\\AppData\\Roaming';

    const { getEnhancedEnv } = await import('@process/utils/shellEnv');
    const result = getEnhancedEnv();

    expect(result.PATH).toContain(NPM_GLOBAL);

    process.env.PATH = originalPath;
    process.env.APPDATA = originalAppData;
  });

  it('does not duplicate npm global path if already in PATH on Windows', async () => {
    if (process.platform !== 'win32') return;

    const NPM_GLOBAL = 'C:\\Users\\test\\AppData\\Roaming\\npm';

    vi.doMock('fs', async () => {
      const actual = await vi.importActual<typeof import('fs')>('fs');
      return {
        ...actual,
        existsSync: vi.fn((p: string) => p === NPM_GLOBAL),
        readdirSync: vi.fn(() => []),
        accessSync: vi.fn(),
      };
    });

    const originalPath = process.env.PATH;
    const originalAppData = process.env.APPDATA;
    // npm global IS already in PATH
    process.env.PATH = `C:\\Windows\\System32;${NPM_GLOBAL}`;
    process.env.APPDATA = 'C:\\Users\\test\\AppData\\Roaming';

    const { getEnhancedEnv } = await import('@process/utils/shellEnv');
    const result = getEnhancedEnv();

    const occurrences = result.PATH.split(';').filter((p) => p === NPM_GLOBAL).length;
    expect(occurrences).toBe(1);

    process.env.PATH = originalPath;
    process.env.APPDATA = originalAppData;
  });
});

// -------------------------------------------------------------------
// 4. Windows extra tool path detection (cross-platform, mocked platform)
//    Verifies that getWindowsExtraToolPaths() appends Git, Chocolatey,
//    and other tool paths. Runs on any OS by mocking process.platform.
// -------------------------------------------------------------------
describe('getEnhancedEnv Windows extra paths (cross-platform mock)', () => {
  const originalPlatform = process.platform;
  const originalPath = process.env.PATH;
  const originalAppData = process.env.APPDATA;
  const originalLocalAppData = process.env.LOCALAPPDATA;
  const originalProgramFiles = process.env.ProgramFiles;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    process.env.PATH = originalPath;
    process.env.APPDATA = originalAppData;
    process.env.LOCALAPPDATA = originalLocalAppData;
    process.env.ProgramFiles = originalProgramFiles;
  });

  it('appends Git for Windows paths when they exist (cygpath fix)', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    process.env.PATH = 'C:\\Windows\\System32';
    process.env.APPDATA = 'C:\\Users\\test\\AppData\\Roaming';
    process.env.LOCALAPPDATA = 'C:\\Users\\test\\AppData\\Local';
    process.env.ProgramFiles = 'C:\\Program Files';

    // Use path.join to compute expected paths — on macOS path.join uses '/'
    // but the source code also uses path.join, so they will match.
    const GIT_USR_BIN = path.join('C:\\Program Files', 'Git', 'usr', 'bin');
    const GIT_CMD = path.join('C:\\Program Files', 'Git', 'cmd');

    vi.doMock('fs', async () => {
      const actual = await vi.importActual<typeof import('fs')>('fs');
      return {
        ...actual,
        existsSync: vi.fn((p: string) => p === GIT_USR_BIN || p === GIT_CMD),
        readdirSync: actual.readdirSync,
        accessSync: actual.accessSync,
      };
    });

    vi.doMock('child_process', () => ({
      execFileSync: vi.fn().mockImplementation(() => {
        throw new Error('skip shell');
      }),
      execFile: vi.fn(),
    }));

    const { getEnhancedEnv } = await import('@process/utils/shellEnv');
    const result = getEnhancedEnv();

    // PATH must include Git usr/bin (where cygpath lives) and Git cmd
    expect(result.PATH).toContain(GIT_USR_BIN);
    expect(result.PATH).toContain(GIT_CMD);
  });

  it('appends Chocolatey bin when it exists', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    process.env.PATH = 'C:\\Windows\\System32';
    process.env.APPDATA = 'C:\\Users\\test\\AppData\\Roaming';
    process.env.LOCALAPPDATA = 'C:\\Users\\test\\AppData\\Local';
    process.env.ProgramFiles = 'C:\\Program Files';

    const CHOCO_BIN = path.join('C:\\ProgramData\\chocolatey', 'bin');

    vi.doMock('fs', async () => {
      const actual = await vi.importActual<typeof import('fs')>('fs');
      return {
        ...actual,
        existsSync: vi.fn((p: string) => p === CHOCO_BIN),
        readdirSync: actual.readdirSync,
        accessSync: actual.accessSync,
      };
    });

    vi.doMock('child_process', () => ({
      execFileSync: vi.fn().mockImplementation(() => {
        throw new Error('skip shell');
      }),
      execFile: vi.fn(),
    }));

    const { getEnhancedEnv } = await import('@process/utils/shellEnv');
    const result = getEnhancedEnv();

    expect(result.PATH).toContain(CHOCO_BIN);
  });

  it('does not append paths that are already in PATH', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });

    const GIT_USR_BIN = path.join('C:\\Program Files', 'Git', 'usr', 'bin');
    // Git usr/bin is already in PATH
    process.env.PATH = `C:\\Windows\\System32;${GIT_USR_BIN}`;
    process.env.APPDATA = 'C:\\Users\\test\\AppData\\Roaming';
    process.env.LOCALAPPDATA = 'C:\\Users\\test\\AppData\\Local';
    process.env.ProgramFiles = 'C:\\Program Files';

    vi.doMock('fs', async () => {
      const actual = await vi.importActual<typeof import('fs')>('fs');
      return {
        ...actual,
        existsSync: vi.fn((p: string) => p === GIT_USR_BIN),
        readdirSync: actual.readdirSync,
        accessSync: actual.accessSync,
      };
    });

    vi.doMock('child_process', () => ({
      execFileSync: vi.fn().mockImplementation(() => {
        throw new Error('skip shell');
      }),
      execFile: vi.fn(),
    }));

    const { getEnhancedEnv } = await import('@process/utils/shellEnv');
    const result = getEnhancedEnv();

    // Should appear exactly once (from process.env.PATH), not duplicated
    const occurrences = result.PATH.split(';').filter((p) => p === GIT_USR_BIN).length;
    expect(occurrences).toBe(1);
  });

  it('skips shell env loading on Windows and relies on extra tool paths', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    process.env.PATH = 'C:\\Windows\\System32';
    process.env.APPDATA = 'C:\\Users\\test\\AppData\\Roaming';
    process.env.LOCALAPPDATA = 'C:\\Users\\test\\AppData\\Local';
    process.env.ProgramFiles = 'C:\\Program Files';

    const execFileSync = vi.fn();

    vi.doMock('fs', async () => {
      const actual = await vi.importActual<typeof import('fs')>('fs');
      return {
        ...actual,
        existsSync: vi.fn(() => false),
        readdirSync: actual.readdirSync,
        accessSync: actual.accessSync,
      };
    });

    vi.doMock('child_process', () => ({
      execFileSync,
      execFile: vi.fn(),
    }));

    const { getEnhancedEnv } = await import('@process/utils/shellEnv');
    getEnhancedEnv();

    // execFileSync should NOT be called on Windows (shell env loading is skipped)
    expect(execFileSync).not.toHaveBeenCalled();
  });
});

describe('resolveNpxPath', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('verifies Windows npx via the bundled npm entrypoint JS', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });

    const execFileSync = vi
      .fn()
      .mockReturnValueOnce(`${path.join('/tooling', 'node.exe')}\n`)
      .mockReturnValueOnce('10.9.0\n');

    vi.doMock('fs', async () => {
      const actual = await vi.importActual<typeof import('fs')>('fs');
      return {
        ...actual,
        existsSync: vi.fn(() => true),
      };
    });

    vi.doMock('child_process', () => ({
      execFileSync,
      execFile: vi.fn(),
    }));

    const { resolveNpxPath } = await import('@process/utils/shellEnv');
    const result = resolveNpxPath({ PATH: '/tooling' });
    const npxCandidate = path.join('/tooling', 'npx.cmd');
    const npxCliJs = path.join('/tooling', 'node_modules', 'npm', 'bin', 'npx-cli.js');

    expect(result).toBe(npxCandidate);
    expect(execFileSync).toHaveBeenNthCalledWith(
      2,
      path.join('/tooling', 'node.exe'),
      [npxCliJs, '--version'],
      expect.objectContaining({
        env: { PATH: '/tooling' },
        windowsHide: true,
      })
    );
  });

  it('falls back to PATH lookup when bundled npm scripts are missing on Windows', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });

    const execFileSync = vi.fn().mockReturnValueOnce(`${path.join('/tooling', 'node.exe')}\n`);

    vi.doMock('fs', async () => {
      const actual = await vi.importActual<typeof import('fs')>('fs');
      return {
        ...actual,
        existsSync: vi.fn((target: string) => target === path.join('/tooling', 'npx.cmd')),
      };
    });

    vi.doMock('child_process', () => ({
      execFileSync,
      execFile: vi.fn(),
    }));

    const { resolveNpxPath } = await import('@process/utils/shellEnv');

    expect(resolveNpxPath({ PATH: '/tooling' })).toBe('npx.cmd');
  });
});

// -------------------------------------------------------------------
// 5. Regression test: the fix that was applied to ForkTask.ts
//    Documents the expected behavior: getEnhancedEnv must be called
//    so workers get the full PATH.
// -------------------------------------------------------------------
describe('ForkTask environment propagation (regression)', () => {
  it('getEnhancedEnv returns PATH that includes global tool directories', async () => {
    vi.resetModules();

    vi.doMock('child_process', () => ({
      execFileSync: vi.fn().mockImplementation(() => {
        throw new Error('skip shell');
      }),
      execFile: vi.fn(),
    }));

    // Simulate a PATH that a global tool (e.g. openclaw) would be installed in
    const originalPath = process.env.PATH;
    const GLOBAL_BIN = '/home/user/.npm-global/bin'; // typical npm global bin on Linux
    process.env.PATH = `/usr/bin:/usr/local/bin:${GLOBAL_BIN}`;

    const { getEnhancedEnv } = await import('@process/utils/shellEnv');
    const workerEnv = getEnhancedEnv();

    // Worker process will have this PATH — tools like `openclaw`, `node`, `npm`
    // installed in GLOBAL_BIN will be found
    expect(workerEnv.PATH).toContain(GLOBAL_BIN);
    expect(workerEnv.PATH).toContain('/usr/bin');

    process.env.PATH = originalPath;
  });
});
