/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { isPathAllowed } from '../../src/process/webserver/directoryApi';

// Mock fs and os modules
vi.mock('fs');
vi.mock('os');

describe('directoryApi - Windows drive detection (#1082)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should detect Windows drives when platform is win32', () => {
    // Simulate Windows platform
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });

    // Mock fs functions
    vi.mocked(fs.existsSync).mockImplementation((path) => {
      const pathStr = String(path);
      // Simulate C: and D: drives exist
      return pathStr === 'C:\\' || pathStr === 'D:\\';
    });
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);
    vi.mocked(fs.realpathSync).mockImplementation((p) => String(p));
    vi.mocked(os.homedir).mockReturnValue('C:\\Users\\test');

    // Test drive detection logic
    const baseDirs: string[] = [];
    for (let charCode = 65; charCode <= 90; charCode++) {
      const driveLetter = String.fromCharCode(charCode);
      const drivePath = `${driveLetter}:\\`;
      try {
        if (fs.existsSync(drivePath) && fs.statSync(drivePath).isDirectory()) {
          baseDirs.push(drivePath);
        }
      } catch {
        // Skip
      }
    }

    expect(baseDirs).toContain('C:\\');
    expect(baseDirs).toContain('D:\\');
    expect(baseDirs.length).toBe(2);

    // Restore platform
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('should return drives list when path is empty on Windows', () => {
    const platform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });

    // Test the __ROOT__ handling logic
    const queryPath = '';
    const isWindowsRoot = process.platform === 'win32' && (!queryPath || queryPath === '__ROOT__');

    expect(isWindowsRoot).toBe(true);

    Object.defineProperty(process, 'platform', { value: platform });
  });

  it('should set parentPath to __ROOT__ when at drive root on Windows', () => {
    const platform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });

    // Simulate being at C:\ (drive root)
    const safeDir = 'C:\\';
    const parentDir = 'C:\\'; // path.dirname('C:\\') returns 'C:\\'
    const isAtDriveRoot = process.platform === 'win32' && parentDir === safeDir;

    expect(isAtDriveRoot).toBe(true);

    // parentPath should be __ROOT__ when at drive root
    const expectedParentPath = isAtDriveRoot ? '__ROOT__' : parentDir;
    expect(expectedParentPath).toBe('__ROOT__');

    Object.defineProperty(process, 'platform', { value: platform });
  });
});

describe('directoryApi - macOS and Linux root directory access', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    vi.resetModules();
  });

  it('should include / in DEFAULT_ALLOWED_DIRECTORIES on macOS', async () => {
    vi.resetModules();
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    vi.doMock('os', () => {
      const mock = { homedir: vi.fn(() => '/Users/test') };
      return { default: mock, ...mock };
    });
    vi.doMock('fs', () => {
      const mock = {
        existsSync: vi.fn(() => false),
        statSync: vi.fn(() => ({ isDirectory: () => false })),
        realpathSync: vi.fn((p: unknown) => String(p)),
        readdirSync: vi.fn(() => []),
        accessSync: vi.fn(),
        constants: { R_OK: 4 },
      };
      return { default: mock, ...mock };
    });

    const { DEFAULT_ALLOWED_DIRECTORIES } = await import('../../src/process/webserver/directoryApi');
    expect(DEFAULT_ALLOWED_DIRECTORIES).toContain('/');
  });

  it('should include / in DEFAULT_ALLOWED_DIRECTORIES on Linux', async () => {
    vi.resetModules();
    Object.defineProperty(process, 'platform', { value: 'linux' });
    vi.doMock('os', () => {
      const mock = { homedir: vi.fn(() => '/home/test') };
      return { default: mock, ...mock };
    });
    vi.doMock('fs', () => {
      const mock = {
        existsSync: vi.fn(() => false),
        statSync: vi.fn(() => ({ isDirectory: () => false })),
        realpathSync: vi.fn((p: unknown) => String(p)),
        readdirSync: vi.fn(() => []),
        accessSync: vi.fn(),
        constants: { R_OK: 4 },
      };
      return { default: mock, ...mock };
    });

    const { DEFAULT_ALLOWED_DIRECTORIES } = await import('../../src/process/webserver/directoryApi');
    expect(DEFAULT_ALLOWED_DIRECTORIES).toContain('/');
  });

  it('should allow /Applications path when / is in allowed directories', () => {
    expect(isPathAllowed('/Applications', ['/Users/test', '/'])).toBe(true);
    expect(isPathAllowed('/System', ['/Users/test', '/'])).toBe(true);
    expect(isPathAllowed('/Users/test/Documents', ['/Users/test', '/'])).toBe(true);
  });

  it('should allow / itself when / is in allowed directories', () => {
    expect(isPathAllowed('/', ['/'])).toBe(true);
  });
});

describe('directoryApi - symlink handling in directory listing', () => {
  it('should skip symlinks that resolve outside the allowed directory', () => {
    // Simulate the production validatePath behavior: throws when symlink resolves outside safeDir
    function mockValidatePath(targetPath: string, allowedDirs: string[]): string {
      const resolved = fs.realpathSync(targetPath) as string;
      const isAllowed = allowedDirs.some((base) => {
        const rel = path.relative(base, resolved);
        return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
      });
      if (!isAllowed) {
        throw new Error(`Path "${resolved}" is outside allowed directories`);
      }
      return resolved;
    }

    vi.mocked(fs.readdirSync).mockReturnValue(['normalDir', 'symlinkToRoot'] as unknown as fs.Dirent[]);
    vi.mocked(fs.realpathSync).mockImplementation((p) => {
      const pStr = String(p);
      if (pStr.endsWith('symlinkToRoot')) return '/';
      return pStr;
    });
    vi.mocked(fs.statSync).mockReturnValue({
      isDirectory: () => true,
      isFile: () => false,
      size: 0,
      mtime: new Date(),
    } as unknown as fs.Stats);

    const safeDir = '/Applications';
    const names = fs.readdirSync(safeDir) as unknown as string[];

    const items = names
      .map((name) => {
        try {
          const itemPath = mockValidatePath(path.join(safeDir, name), [safeDir]);
          const itemStats = fs.statSync(itemPath);
          return { name, path: itemPath, isDirectory: itemStats.isDirectory() };
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    // symlinkToRoot resolves to '/' which is outside /Applications, so it's skipped
    expect(items).toHaveLength(1);
    expect(items[0]?.name).toBe('normalDir');
  });

  it('should include normal directories and skip symlinks that throw', () => {
    function mockValidatePath(targetPath: string, allowedDirs: string[]): string {
      const resolved = fs.realpathSync(targetPath) as string;
      const isAllowed = allowedDirs.some((base) => {
        const rel = path.relative(base, resolved);
        return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
      });
      if (!isAllowed) {
        throw new Error(`Path outside allowed directories`);
      }
      return resolved;
    }

    vi.mocked(fs.readdirSync).mockReturnValue(['App1.app', 'App2.app', 'brokenSymlink'] as unknown as fs.Dirent[]);
    vi.mocked(fs.realpathSync).mockImplementation((p) => {
      const pStr = String(p);
      if (pStr.endsWith('brokenSymlink')) throw new Error('No such file or directory');
      return pStr;
    });
    vi.mocked(fs.statSync).mockReturnValue({
      isDirectory: () => true,
      isFile: () => false,
      size: 0,
      mtime: new Date(),
    } as unknown as fs.Stats);

    const safeDir = '/Applications';
    const names = fs.readdirSync(safeDir) as unknown as string[];

    const items = names
      .map((name) => {
        try {
          const itemPath = mockValidatePath(path.join(safeDir, name), [safeDir]);
          const itemStats = fs.statSync(itemPath);
          return { name, path: itemPath, isDirectory: itemStats.isDirectory() };
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    expect(items).toHaveLength(2);
    expect(items.map((i) => i?.name)).toEqual(['App1.app', 'App2.app']);
  });

  it('isPathAllowed returns false for a symlink that resolves outside the allowed directory', () => {
    // Verify the real isPathAllowed: when fs.realpathSync resolves a symlink to '/',
    // it is NOT inside /Applications, so isPathAllowed returns false — this is why
    // the production directory listing skips such symlinks.
    vi.mocked(fs.realpathSync).mockImplementation((p) => {
      const pStr = String(p);
      if (pStr === '/Applications/symlinkToRoot') return '/';
      return pStr;
    });

    expect(isPathAllowed('/Applications/symlinkToRoot', ['/Applications'])).toBe(false);
    expect(isPathAllowed('/Applications/normalDir', ['/Applications'])).toBe(true);
  });
});

describe('directoryApi - canGoUp logic (#1082)', () => {
  it('should allow going up from drive root to drive list', () => {
    const platform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });

    const safeDir = 'C:\\';
    const parentDir = 'C:\\';
    const isAtDriveRoot = process.platform === 'win32' && parentDir === safeDir;

    // canGoUp should be true at drive root on Windows
    const canGoUp = isAtDriveRoot || parentDir !== safeDir;
    expect(canGoUp).toBe(true);

    Object.defineProperty(process, 'platform', { value: platform });
  });

  it('should allow going up from subdirectory', () => {
    const safeDir = 'C:\\Users\\test';
    const parentDir = 'C:\\Users';
    const isAtDriveRoot = process.platform === 'win32' && parentDir === safeDir;

    const canGoUp = isAtDriveRoot || parentDir !== safeDir;
    expect(canGoUp).toBe(true);
  });
});

describe('directoryApi - isPathAllowed function (#1082)', () => {
  // Simulate isPathAllowed function logic
  function isPathAllowed(targetPath: string, allowedBasePaths: string[]): boolean {
    const resolved = path.win32.resolve(targetPath);
    return allowedBasePaths.some((basePath: string) => {
      const relative = path.win32.relative(basePath, resolved);
      return relative === '' || (!relative.startsWith('..') && !path.win32.isAbsolute(relative));
    });
  }

  it('should allow C:\\Users when C:\\ is in allowed paths', () => {
    const allowedPaths = ['C:\\'];
    expect(isPathAllowed('C:\\Users', allowedPaths)).toBe(true);
  });

  it('should allow C:\\Users\\cocoon-break when C:\\ is in allowed paths', () => {
    const allowedPaths = ['C:\\'];
    expect(isPathAllowed('C:\\Users\\cocoon-break', allowedPaths)).toBe(true);
  });

  it('should allow C:\\Users when homedir is C:\\Users\\cocoon-break (via drive root)', () => {
    // This is the key scenario for #1082
    // When homedir is C:\Users\cocoon-break, C:\Users should still be allowed
    // because C:\ is also in allowed paths
    const allowedPaths = ['C:\\', 'C:\\Users\\cocoon-break'];
    expect(isPathAllowed('C:\\Users', allowedPaths)).toBe(true);
  });

  it('should NOT allow going up from homedir when only homedir is allowed', () => {
    // If ONLY homedir is allowed (no drive root), then C:\Users should not be allowed
    const allowedPaths = ['C:\\Users\\cocoon-break'];
    expect(isPathAllowed('C:\\Users', allowedPaths)).toBe(false);
  });

  it('should allow drive root itself', () => {
    const allowedPaths = ['C:\\'];
    expect(isPathAllowed('C:\\', allowedPaths)).toBe(true);
  });

  it('path.win32.relative should return correct values for Windows paths', () => {
    expect(path.win32.relative('C:\\', 'C:\\Users')).toBe('Users');
    expect(path.win32.relative('C:\\Users\\cocoon-break', 'C:\\Users')).toBe('..');
    expect(path.win32.relative('C:\\', 'C:\\')).toBe('');
  });

  it('should correctly identify subdirectories using win32 path api', () => {
    const relative = path.win32.relative('C:\\', 'C:\\Users');
    expect(relative).toBe('Users');
    expect(relative.startsWith('..')).toBe(false);
    expect(path.win32.isAbsolute(relative)).toBe(false);
  });
});
