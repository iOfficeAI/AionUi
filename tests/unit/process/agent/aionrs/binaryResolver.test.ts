/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { existsSyncMock, execFileSyncMock, getEnhancedEnvMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
  execFileSyncMock: vi.fn(),
  getEnhancedEnvMock: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: existsSyncMock,
}));

vi.mock('node:child_process', () => ({
  execFileSync: execFileSyncMock,
}));

vi.mock('@process/utils/shellEnv', () => ({
  getEnhancedEnv: getEnhancedEnvMock,
}));

describe('aionrs binary resolver', () => {
  const originalPlatform = process.platform;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NODE_ENV = 'development';
    existsSyncMock.mockReturnValue(false);
    getEnhancedEnvMock.mockReturnValue({ PATH: '/enhanced/bin' });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('returns null on Windows when aionrs is not on PATH without surfacing stderr output', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    execFileSyncMock.mockImplementation(() => {
      throw new Error('missing');
    });

    const { resolveAionrsBinary } = await import('@/process/agent/aionrs/binaryResolver');

    expect(resolveAionrsBinary()).toBeNull();
    expect(execFileSyncMock).toHaveBeenCalledWith(
      'where.exe',
      ['aionrs'],
      expect.objectContaining({
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
      })
    );
  });

  it('uses the enhanced PATH when resolving aionrs on Linux', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    execFileSyncMock.mockReturnValue('/opt/tools/aionrs\n');
    existsSyncMock.mockImplementation((filePath: string) => filePath === '/opt/tools/aionrs');

    const { resolveAionrsBinary } = await import('@/process/agent/aionrs/binaryResolver');

    expect(resolveAionrsBinary()).toBe('/opt/tools/aionrs');
    expect(getEnhancedEnvMock).toHaveBeenCalledTimes(1);
    expect(execFileSyncMock).toHaveBeenCalledWith(
      'which',
      ['aionrs'],
      expect.objectContaining({
        encoding: 'utf-8',
        env: { PATH: '/enhanced/bin' },
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
    );
  });

  it('uses the first PATH match returned by where.exe on Windows', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    execFileSyncMock.mockReturnValue('C:\\tools\\aionrs.exe\r\nD:\\backup\\aionrs.exe\r\n');
    existsSyncMock.mockImplementation((filePath: string) => filePath === 'C:\\tools\\aionrs.exe');

    const { resolveAionrsBinary } = await import('@/process/agent/aionrs/binaryResolver');

    expect(resolveAionrsBinary()).toBe('C:\\tools\\aionrs.exe');
  });

  it('returns version metadata when the binary is available', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    execFileSyncMock.mockReturnValueOnce('C:\\tools\\aionrs.exe\r\n').mockReturnValueOnce('aionrs 0.1.0');
    existsSyncMock.mockImplementation((filePath: string) => filePath === 'C:\\tools\\aionrs.exe');

    const { detectAionrs } = await import('@/process/agent/aionrs/binaryResolver');

    expect(detectAionrs()).toEqual({
      available: true,
      path: 'C:\\tools\\aionrs.exe',
      version: 'aionrs 0.1.0',
    });
    expect(execFileSyncMock).toHaveBeenLastCalledWith(
      'C:\\tools\\aionrs.exe',
      ['--version'],
      expect.objectContaining({
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
      })
    );
  });
});
