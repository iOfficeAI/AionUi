/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const isWindows = process.platform === 'win32';
const binaryName = isWindows ? 'aionrs.exe' : 'aionrs';
const runtimeKey = `${process.platform}-${process.arch}`;

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mockExistsSync = vi.hoisted(() => vi.fn());
const mockExecSync = vi.hoisted(() => vi.fn());

vi.mock('node:fs', () => ({
  existsSync: mockExistsSync,
}));

vi.mock('node:child_process', () => ({
  execSync: mockExecSync,
}));

import { detectAionrs, isAionrsAvailable, resolveAionrsBinary } from '../../src/process/agent/aionrs/binaryResolver';

describe('binaryResolver', () => {
  const originalResourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const originalCwd = process.cwd;

  beforeEach(() => {
    vi.resetAllMocks();
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockImplementation(() => {
      throw new Error('not found');
    });
    process.cwd = () => '/project';
    (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath = undefined;
  });

  afterEach(() => {
    (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath = originalResourcesPath;
    process.cwd = originalCwd;
  });

  describe('resolveAionrsBinary', () => {
    it('returns bundled path when resourcesPath binary exists', () => {
      (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath = '/app/resources';
      const bundledPath = path.join('/app/resources', 'bundled-aionrs', runtimeKey, binaryName);
      mockExistsSync.mockImplementation((p: string) => p === bundledPath);

      const result = resolveAionrsBinary();
      expect(result).toBe(bundledPath);
    });

    it('falls back to cwd when bundled path is missing', () => {
      const cwdPath = path.join('/project', 'resources', 'bundled-aionrs', runtimeKey, binaryName);
      mockExistsSync.mockImplementation((p: string) => p === cwdPath);

      const result = resolveAionrsBinary();
      expect(result).toBe(cwdPath);
    });

    it('falls back to parent of cwd when cwd is missing', () => {
      const parentPath = path.join('/project', '..', 'resources', 'bundled-aionrs', runtimeKey, binaryName);
      mockExistsSync.mockImplementation((p: string) => p === parentPath);

      const result = resolveAionrsBinary();
      expect(result).toBe(parentPath);
    });

    it('falls back to PATH when no bundled or dev binary exists', () => {
      const pathResult = isWindows ? 'C:\\Program Files\\aionrs.exe\r\n' : '/usr/local/bin/aionrs\n';
      const resolvedPath = isWindows ? 'C:\\Program Files\\aionrs.exe' : '/usr/local/bin/aionrs';
      mockExecSync.mockReturnValue(pathResult);
      mockExistsSync.mockImplementation((p: string) => p === resolvedPath);

      const result = resolveAionrsBinary();
      expect(result).toBe(resolvedPath);
      expect(mockExecSync).toHaveBeenCalledWith(isWindows ? 'where aionrs' : 'which aionrs', {
        encoding: 'utf-8',
        timeout: 5000,
      });
    });

    it('returns null when binary is not found anywhere', () => {
      const result = resolveAionrsBinary();
      expect(result).toBeNull();
    });
  });

  describe('isAionrsAvailable', () => {
    it('returns true when binary is found', () => {
      const cwdPath = path.join('/project', 'resources', 'bundled-aionrs', runtimeKey, binaryName);
      mockExistsSync.mockImplementation((p: string) => p === cwdPath);

      expect(isAionrsAvailable()).toBe(true);
    });

    it('returns false when binary is not found', () => {
      expect(isAionrsAvailable()).toBe(false);
    });
  });

  describe('detectAionrs', () => {
    it('returns version when binary exists and responds to --version', () => {
      const cwdPath = path.join('/project', 'resources', 'bundled-aionrs', runtimeKey, binaryName);
      mockExistsSync.mockImplementation((p: string) => p === cwdPath);
      mockExecSync.mockReturnValue('aionrs 0.1.17\n');

      const result = detectAionrs();
      expect(result.available).toBe(true);
      expect(result.version).toBe('aionrs 0.1.17');
      expect(result.path).toBe(cwdPath);
    });

    it('returns available without version when --version fails', () => {
      const cwdPath = path.join('/project', 'resources', 'bundled-aionrs', runtimeKey, binaryName);
      mockExistsSync.mockImplementation((p: string) => p === cwdPath);
      mockExecSync.mockImplementation(() => {
        throw new Error('exit 1');
      });

      const result = detectAionrs();
      expect(result.available).toBe(true);
      expect(result.version).toBeUndefined();
      expect(result.path).toBe(cwdPath);
    });

    it('returns unavailable when binary is not found', () => {
      const result = detectAionrs();
      expect(result.available).toBe(false);
      expect(result.path).toBeUndefined();
    });
  });
});
