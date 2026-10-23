/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  checkNodeShimmer,
  normalizeActivityPath,
  type FileActivity,
} from '@/renderer/pages/conversation/explorer/fileTree/fileTreeActivityStore';
import { formatFileAge, formatFileSize } from '@/renderer/pages/conversation/explorer/fileTree/fileTreeMetadataStore';

describe('fileTreeActivityStore', () => {
  it('normalizes activity file paths correctly', () => {
    expect(normalizeActivityPath('src\\renderer\\App.tsx')).toBe('src/renderer/App.tsx');
    expect(normalizeActivityPath('/src/components/Button.tsx')).toBe('src/components/Button.tsx');
    expect(normalizeActivityPath('  index.ts  ')).toBe('index.ts');
  });

  it('matches active node shimmer by relative path and filename', () => {
    const map = new Map<string, FileActivity>();
    map.set('src/index.ts', {
      path: 'src/index.ts',
      tone: 'write',
      inFlight: true,
      timestamp: Date.now(),
    });

    map.set('src/utils/math.ts', {
      path: 'src/utils/math.ts',
      tone: 'read',
      inFlight: false,
      timestamp: Date.now(),
    });

    expect(checkNodeShimmer(map, 'src/index.ts', 'index.ts')).toBe('write');
    expect(checkNodeShimmer(map, 'src/utils/math.ts', 'math.ts')).toBe('read');
    expect(checkNodeShimmer(map, 'src/unknown.ts', 'unknown.ts')).toBeNull();
  });
});

describe('fileTreeMetadataStore', () => {
  it('formats file sizes accurately matching claude-code-filetree style', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(4500)).toBe('4.4 KB');
    expect(formatFileSize(25000)).toBe('24 KB');
    expect(formatFileSize(1024 * 1024 * 2.5)).toBe('2.5 MB');
    expect(formatFileSize(undefined)).toBe('');
  });

  it('formats file relative age cleanly', () => {
    const now = Date.now();
    expect(formatFileAge(now - 10 * 1000)).toBe('now');
    expect(formatFileAge(now - 5 * 60 * 1000)).toBe('5m');
    expect(formatFileAge(now - 3 * 3600 * 1000)).toBe('3h');
    expect(formatFileAge(now - 2 * 24 * 3600 * 1000)).toBe('2d');
    expect(formatFileAge(undefined)).toBe('');
  });
});
