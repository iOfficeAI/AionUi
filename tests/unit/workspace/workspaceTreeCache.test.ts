/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IDirOrFile } from '@/common/adapter/ipcBridge';
import {
  __clearWorkspaceTreeCache,
  getWorkspaceTreeSnapshot,
  setWorkspaceTreeSnapshot,
} from '@/renderer/pages/conversation/Workspace/utils/workspaceTreeCache';
import { beforeEach, describe, expect, it } from 'vitest';

const snap = (paths: string[]) => ({
  files: paths.map((p): IDirOrFile => ({ name: p, fullPath: `/ws/${p}`, relativePath: p, isDir: false, isFile: true })),
  expandedKeys: [''],
});

describe('workspaceTreeCache', () => {
  beforeEach(() => __clearWorkspaceTreeCache());

  it('stores and retrieves a snapshot by workspace path', () => {
    setWorkspaceTreeSnapshot('/ws/a', snap(['x.ts']));
    expect(getWorkspaceTreeSnapshot('/ws/a')?.files[0].relativePath).toBe('x.ts');
    expect(getWorkspaceTreeSnapshot('/ws/b')).toBeUndefined();
  });

  it('keeps two projects isolated', () => {
    setWorkspaceTreeSnapshot('/ws/a', snap(['a.ts']));
    setWorkspaceTreeSnapshot('/ws/b', snap(['b.ts']));
    expect(getWorkspaceTreeSnapshot('/ws/a')?.files[0].relativePath).toBe('a.ts');
    expect(getWorkspaceTreeSnapshot('/ws/b')?.files[0].relativePath).toBe('b.ts');
  });

  it('ignores empty workspace keys', () => {
    setWorkspaceTreeSnapshot('', snap(['x.ts']));
    expect(getWorkspaceTreeSnapshot('')).toBeUndefined();
  });

  it('evicts the least-recently-used project past the cap', () => {
    // Cap is 20; insert 21 and confirm the first is evicted.
    for (let i = 0; i < 21; i++) {
      setWorkspaceTreeSnapshot(`/ws/${i}`, snap([`f${i}.ts`]));
    }
    expect(getWorkspaceTreeSnapshot('/ws/0')).toBeUndefined();
    expect(getWorkspaceTreeSnapshot('/ws/20')?.files[0].relativePath).toBe('f20.ts');
  });

  it('re-inserting a key marks it most-recently-used (survives eviction)', () => {
    for (let i = 0; i < 20; i++) setWorkspaceTreeSnapshot(`/ws/${i}`, snap([`f${i}.ts`]));
    // Touch /ws/0 so it becomes MRU.
    setWorkspaceTreeSnapshot('/ws/0', snap(['f0-updated.ts']));
    // Insert a new one → LRU (/ws/1) evicted, /ws/0 survives.
    setWorkspaceTreeSnapshot('/ws/new', snap(['new.ts']));
    expect(getWorkspaceTreeSnapshot('/ws/0')?.files[0].relativePath).toBe('f0-updated.ts');
    expect(getWorkspaceTreeSnapshot('/ws/1')).toBeUndefined();
  });
});
