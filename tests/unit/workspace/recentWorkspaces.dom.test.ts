/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { addRecentWorkspace, getRecentWorkspaces } from '@/renderer/components/workspace/recentWorkspaces';
import { beforeEach, describe, expect, it } from 'vitest';

const storageKey = 'recent-workspaces-test';

describe('recentWorkspaces', () => {
  beforeEach(() => localStorage.clear());

  it('returns an empty list for invalid JSON', () => {
    localStorage.setItem(storageKey, '{');
    expect(getRecentWorkspaces(storageKey)).toEqual([]);
  });

  it.each(['{}', 'null'])('returns an empty list for non-array JSON: %s', (value) => {
    localStorage.setItem(storageKey, value);
    expect(getRecentWorkspaces(storageKey)).toEqual([]);
  });

  it('keeps only string entries in order', () => {
    localStorage.setItem(storageKey, JSON.stringify(['/workspace/a', null, 1, '/workspace/b', {}]));
    expect(getRecentWorkspaces(storageKey)).toEqual(['/workspace/a', '/workspace/b']);
  });

  it('preserves valid string arrays', () => {
    localStorage.setItem(storageKey, JSON.stringify(['/workspace/a', '/workspace/b']));
    expect(getRecentWorkspaces(storageKey)).toEqual(['/workspace/a', '/workspace/b']);
  });

  it('adds a workspace when stored JSON is not an array', () => {
    localStorage.setItem(storageKey, '{}');
    addRecentWorkspace('/workspace/a', storageKey);
    expect(getRecentWorkspaces(storageKey)).toEqual(['/workspace/a']);
  });
});
