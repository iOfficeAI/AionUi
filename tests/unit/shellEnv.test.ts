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

import { describe, it, expect, vi, beforeEach } from 'vitest';

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
      (expect(typeof v).toBe('string'), `key ${k} has non-string value`);
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
// 4. Regression test: the fix that was applied to ForkTask.ts
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
