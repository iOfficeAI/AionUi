/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for getNpxCacheDir() in src/process/utils/shellEnv.ts
 *
 * Verifies cross-platform npx cache directory resolution:
 * - Windows: %LOCALAPPDATA%\npm-cache\_npx
 * - POSIX:   ~/.npm/_npx
 *
 * Uses process.platform mocking so tests run on any OS.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';

describe('getNpxCacheDir', () => {
  const originalPlatform = process.platform;
  const originalLocalAppData = process.env.LOCALAPPDATA;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    process.env.LOCALAPPDATA = originalLocalAppData;
  });

  it('returns ~/.npm/_npx on POSIX (macOS/Linux)', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });

    // Mock child_process to prevent shell env loading side-effects
    vi.doMock('child_process', () => ({
      execFileSync: vi.fn().mockImplementation(() => {
        throw new Error('skip shell');
      }),
      execFile: vi.fn(),
    }));

    const os = await import('os');
    const { getNpxCacheDir } = await import('@process/utils/shellEnv');

    const result = getNpxCacheDir();
    expect(result).toBe(path.join(os.homedir(), '.npm', '_npx'));
  });

  it('uses LOCALAPPDATA on Windows when set', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    process.env.LOCALAPPDATA = 'C:\\Users\\test\\AppData\\Local';

    vi.doMock('child_process', () => ({
      execFileSync: vi.fn().mockImplementation(() => {
        throw new Error('skip shell');
      }),
      execFile: vi.fn(),
    }));

    const { getNpxCacheDir } = await import('@process/utils/shellEnv');

    const result = getNpxCacheDir();
    expect(result).toBe(path.join('C:\\Users\\test\\AppData\\Local', 'npm-cache', '_npx'));
  });

  it('falls back to homedir AppData\\Local on Windows when LOCALAPPDATA is unset', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    delete process.env.LOCALAPPDATA;

    vi.doMock('child_process', () => ({
      execFileSync: vi.fn().mockImplementation(() => {
        throw new Error('skip shell');
      }),
      execFile: vi.fn(),
    }));

    const os = await import('os');
    const { getNpxCacheDir } = await import('@process/utils/shellEnv');

    const result = getNpxCacheDir();
    expect(result).toBe(path.join(os.homedir(), 'AppData', 'Local', 'npm-cache', '_npx'));
  });
});
