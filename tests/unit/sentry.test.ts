/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for the pure helpers exported from `packages/desktop/src/sentry.ts`:
 * `selectRecentLogFiles`, `packAndCap`. Electron and Sentry are mocked so this
 * suite runs under the `node` Vitest project.
 */

import { describe, it, expect, vi } from 'vitest';
import { gunzipSync } from 'node:zlib';
import { randomBytes } from 'node:crypto';

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.0-test', getPath: () => '/tmp', isPackaged: false },
}));

vi.mock('@sentry/electron/main', () => ({
  init: vi.fn(),
  setTag: vi.fn(),
  setUser: vi.fn(),
}));

vi.mock('@/process/utils/analyticsId', () => ({
  getOrCreateAnalyticsId: () => 'test-device-id',
}));

import { selectRecentLogFiles, packAndCap } from '@/sentry';

describe('selectRecentLogFiles', () => {
  it('returns every file from the N most recent non-empty days', () => {
    const files = [
      { path: '/a/2026-05-22.log', mtime: Date.UTC(2026, 4, 22, 10), size: 100 },
      { path: '/a/2026-05-22.aioncore.log', mtime: Date.UTC(2026, 4, 22, 11), size: 200 },
      { path: '/a/2026-05-21.log', mtime: Date.UTC(2026, 4, 21, 10), size: 50 },
      { path: '/a/2026-05-20.log', mtime: Date.UTC(2026, 4, 20, 10), size: 0 },
      { path: '/a/2026-05-19.log', mtime: Date.UTC(2026, 4, 19, 10), size: 80 },
    ];
    const picked = selectRecentLogFiles(files, 2);
    const days = new Set(picked.map((f) => /\d{4}-\d{2}-\d{2}/.exec(f.path)![0]));
    expect(days).toEqual(new Set(['2026-05-22', '2026-05-21']));
    expect(picked).toHaveLength(3);
  });

  it('skips empty files', () => {
    const files = [{ path: '/a/x.log', mtime: 1, size: 0 }];
    expect(selectRecentLogFiles(files, 7)).toEqual([]);
  });

  it('returns fewer days when the input has fewer than N distinct days', () => {
    const files = [
      { path: '/a/2026-05-22.log', mtime: Date.UTC(2026, 4, 22, 10), size: 1 },
      { path: '/a/2026-05-22b.log', mtime: Date.UTC(2026, 4, 22, 11), size: 1 },
    ];
    const picked = selectRecentLogFiles(files, 7);
    expect(picked).toHaveLength(2);
  });
});

describe('packAndCap', () => {
  it('returns a gzip buffer well under cap with truncated=false', () => {
    const segments = [{ name: 'tiny.log', mtime: 0, content: 'hello world\n' }];
    const out = packAndCap(segments, 1024);
    expect(out.gzipped.length).toBeLessThan(1024);
    expect(out.truncated).toBe(false);
    const decompressed = gunzipSync(out.gzipped).toString('utf8');
    expect(decompressed).toContain('hello world');
    expect(decompressed).toContain('tiny.log');
  });

  it('truncates from the head and preserves the tail when over cap', () => {
    // Highly-incompressible payload so gzip can't shrink past the cap on its own:
    // base64-encoded random bytes are near maximum entropy.
    const big = randomBytes(2_000_000).toString('base64');
    const segments = [{ name: 'big.log', mtime: 0, content: big + '\nMARKER_TAIL\n' }];
    const out = packAndCap(segments, 50_000);
    expect(out.gzipped.length).toBeLessThanOrEqual(50_000);
    expect(out.truncated).toBe(true);
    const decompressed = gunzipSync(out.gzipped).toString('utf8');
    expect(decompressed).toContain('MARKER_TAIL');
  });
});
