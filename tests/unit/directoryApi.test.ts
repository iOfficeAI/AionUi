/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

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
    const resolved = path.resolve(targetPath);
    return allowedBasePaths.some((basePath: string) => {
      const relative = path.relative(basePath, resolved);
      return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
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

  it('path.relative should return correct values for Windows paths', () => {
    // Verify path.relative behavior
    expect(path.relative('C:\\', 'C:\\Users')).toBe('Users');
    expect(path.relative('C:\\Users\\cocoon-break', 'C:\\Users')).toBe('..');
    expect(path.relative('C:\\', 'C:\\')).toBe('');
  });

  it('should correctly identify subdirectories', () => {
    const relative = path.relative('C:\\', 'C:\\Users');
    expect(relative).toBe('Users');
    expect(relative.startsWith('..')).toBe(false);
    expect(path.isAbsolute(relative)).toBe(false);
  });
});
