import { describe, expect, it } from 'vitest';

import type { IDirOrFile } from '@/common/adapter/ipcBridge';
import {
  collectFilePaths,
  computeContextMenuPosition,
} from '@/renderer/pages/conversation/Workspace/utils/treeHelpers';

// Helper to create a file node
function file(name: string, fullPath: string): IDirOrFile {
  return {
    name,
    fullPath,
    relativePath: name,
    isDir: false,
    isFile: true,
  };
}

// Helper to create a directory node
function dir(name: string, fullPath: string, children: IDirOrFile[] = []): IDirOrFile {
  return {
    name,
    fullPath,
    relativePath: name,
    isDir: true,
    isFile: false,
    children,
  };
}

// ---------------------------------------------------------------------------
// collectFilePaths
// ---------------------------------------------------------------------------
describe('collectFilePaths', () => {
  it('returns an empty array for an empty input', () => {
    expect(collectFilePaths([])).toEqual([]);
  });

  it('collects paths from a flat list of files', () => {
    const items = [file('a.ts', '/src/a.ts'), file('b.ts', '/src/b.ts')];
    const paths = collectFilePaths(items);

    expect(paths).toEqual(['/src/a.ts', '/src/b.ts']);
  });

  it('collects paths from nested directories with files', () => {
    const items = [
      dir('src', '/src', [
        file('index.ts', '/src/index.ts'),
        dir('utils', '/src/utils', [file('helper.ts', '/src/utils/helper.ts')]),
      ]),
    ];
    const paths = collectFilePaths(items);

    expect(paths).toEqual(['/src/index.ts', '/src/utils/helper.ts']);
  });

  it('returns an empty array for a directory with no files (only subdirectories)', () => {
    const items = [dir('root', '/root', [dir('empty', '/root/empty')])];
    const paths = collectFilePaths(items);

    expect(paths).toEqual([]);
  });

  it('collects paths from a deeply nested structure', () => {
    const items = [
      dir('a', '/a', [
        dir('b', '/a/b', [dir('c', '/a/b/c', [dir('d', '/a/b/c/d', [file('deep.ts', '/a/b/c/d/deep.ts')])])]),
      ]),
    ];
    const paths = collectFilePaths(items);

    expect(paths).toEqual(['/a/b/c/d/deep.ts']);
  });

  it('skips directory nodes that have isFile = false', () => {
    const items = [dir('lib', '/lib'), file('main.ts', '/main.ts')];
    const paths = collectFilePaths(items);

    expect(paths).toEqual(['/main.ts']);
  });
});

// ---------------------------------------------------------------------------
// computeContextMenuPosition
// ---------------------------------------------------------------------------
describe('computeContextMenuPosition', () => {
  // Store original innerWidth/innerHeight and restore after tests
  const originalInnerWidth = globalThis.window?.innerWidth;
  const originalInnerHeight = globalThis.window?.innerHeight;

  // In a node environment (no window), the function returns unclipped values.
  // We mock window dimensions for viewport-clipping tests.

  it('returns the same position when within viewport bounds', () => {
    // With default menu size 220x220, position 100,100 is safe in any reasonable viewport
    Object.defineProperty(globalThis, 'window', {
      value: { innerWidth: 1920, innerHeight: 1080 },
      writable: true,
      configurable: true,
    });

    const pos = computeContextMenuPosition(100, 100);
    expect(pos).toEqual({ top: 100, left: 100 });
  });

  it('clips x when position is too close to the right edge', () => {
    Object.defineProperty(globalThis, 'window', {
      value: { innerWidth: 1000, innerHeight: 800 },
      writable: true,
      configurable: true,
    });

    // x = 900, menuWidth = 220 => 900 > 1000-220=780, should clip to 780
    const pos = computeContextMenuPosition(900, 100);
    expect(pos.left).toBe(780);
    expect(pos.top).toBe(100);
  });

  it('clips y when position is too close to the bottom edge', () => {
    Object.defineProperty(globalThis, 'window', {
      value: { innerWidth: 1000, innerHeight: 800 },
      writable: true,
      configurable: true,
    });

    // y = 700, menuHeight = 220 => 700 > 800-220=580, should clip to 580
    const pos = computeContextMenuPosition(100, 700);
    expect(pos.left).toBe(100);
    expect(pos.top).toBe(580);
  });

  it('returns top:0, left:0 for position at origin', () => {
    Object.defineProperty(globalThis, 'window', {
      value: { innerWidth: 1920, innerHeight: 1080 },
      writable: true,
      configurable: true,
    });

    const pos = computeContextMenuPosition(0, 0);
    expect(pos).toEqual({ top: 0, left: 0 });
  });

  it('clips both dimensions for a large menu that exceeds viewport', () => {
    Object.defineProperty(globalThis, 'window', {
      value: { innerWidth: 400, innerHeight: 300 },
      writable: true,
      configurable: true,
    });

    // Menu 350x280, position 200,100
    // clippedX = min(200, 400-350) = min(200, 50) = 50
    // clippedY = min(100, 300-280) = min(100, 20) = 20
    const pos = computeContextMenuPosition(200, 100, 350, 280);
    expect(pos.left).toBe(50);
    expect(pos.top).toBe(20);
  });

  // Clean up window mock
  afterAll(() => {
    if (originalInnerWidth !== undefined) {
      Object.defineProperty(globalThis, 'window', {
        value: { innerWidth: originalInnerWidth, innerHeight: originalInnerHeight },
        writable: true,
        configurable: true,
      });
    }
  });
});
