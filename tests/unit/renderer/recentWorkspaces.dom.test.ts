/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Covers the recent-workspaces localStorage cache helpers, with focus on
 * `pruneRecentWorkspaces` — the lazy-cleanup helper that drops cached entries
 * whose backing directory no longer exists (project deleted in-app, `rm -rf`,
 * container redeploy, etc.).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_RECENT_WS_KEY,
  addRecentWorkspace,
  getRecentWorkspaces,
  pruneRecentWorkspaces,
  removeRecentWorkspace,
} from '@/renderer/components/workspace/recentWorkspaces';

const BASE_URL = 'http://localhost:1234';

const seed = (paths: string[], key = DEFAULT_RECENT_WS_KEY) => {
  localStorage.setItem(key, JSON.stringify(paths));
};

const responseFor = (ok: boolean) => ({ ok }) as Response;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('addRecentWorkspace / getRecentWorkspaces', () => {
  it('returns an empty list when storage is unset', () => {
    expect(getRecentWorkspaces()).toEqual([]);
  });

  it('deduplicates and caps the list at 5 entries (most recent first)', () => {
    for (const p of ['/a', '/b', '/c', '/d', '/e', '/f']) addRecentWorkspace(p);
    // Re-adding an existing path moves it to the front, not duplicates it.
    addRecentWorkspace('/c');
    expect(getRecentWorkspaces()).toEqual(['/c', '/f', '/e', '/d', '/b']);
  });

  it('returns [] when the cache contains invalid JSON', () => {
    localStorage.setItem(DEFAULT_RECENT_WS_KEY, '{not-json');
    expect(getRecentWorkspaces()).toEqual([]);
  });
});

describe('removeRecentWorkspace', () => {
  it('removes the given path and persists the result', () => {
    seed(['/a', '/b', '/c']);
    removeRecentWorkspace('/b');
    expect(getRecentWorkspaces()).toEqual(['/a', '/c']);
  });

  it('is a no-op when the path is absent (does not touch storage)', () => {
    seed(['/a', '/b']);
    const before = localStorage.getItem(DEFAULT_RECENT_WS_KEY);
    removeRecentWorkspace('/missing');
    expect(localStorage.getItem(DEFAULT_RECENT_WS_KEY)).toBe(before);
  });

  it('honors a custom storage key', () => {
    const KEY = 'aionui:team-recents';
    seed(['/x', '/y'], KEY);
    removeRecentWorkspace('/x', KEY);
    expect(getRecentWorkspaces(KEY)).toEqual(['/y']);
  });
});

describe('pruneRecentWorkspaces', () => {
  it('returns the original list verbatim when nothing is cached (no requests)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const out = await pruneRecentWorkspaces(BASE_URL);
    expect(out).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps every entry when all fs/browse calls return 200', async () => {
    seed(['/a', '/b', '/c']);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(responseFor(true));

    const out = await pruneRecentWorkspaces(BASE_URL);

    expect(out).toEqual(['/a', '/b', '/c']);
    // localStorage untouched when nothing was pruned.
    expect(JSON.parse(localStorage.getItem(DEFAULT_RECENT_WS_KEY) ?? 'null')).toEqual(['/a', '/b', '/c']);
  });

  it('drops entries whose fs/browse call returns a non-OK status', async () => {
    seed(['/keep', '/gone', '/also-keep']);
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      // Decode so /gone matches even after encodeURIComponent.
      const path = new URL(url).searchParams.get('path');
      return Promise.resolve(responseFor(path !== '/gone'));
    });

    const out = await pruneRecentWorkspaces(BASE_URL);

    expect(out).toEqual(['/keep', '/also-keep']);
    expect(JSON.parse(localStorage.getItem(DEFAULT_RECENT_WS_KEY) ?? 'null')).toEqual(['/keep', '/also-keep']);
  });

  it('preserves entries on per-request network errors (conservative policy)', async () => {
    // The bug we are protecting against: a transient network failure must not
    // wipe the user's history. Only confirmed non-existence (HTTP non-OK)
    // qualifies as a reason to delete.
    seed(['/a', '/b']);
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('network down'));

    const out = await pruneRecentWorkspaces(BASE_URL);

    expect(out).toEqual(['/a', '/b']);
    expect(JSON.parse(localStorage.getItem(DEFAULT_RECENT_WS_KEY) ?? 'null')).toEqual(['/a', '/b']);
  });

  it('encodes path segments so paths with spaces or unicode reach the backend intact', async () => {
    seed(['/Users/me/My Folder', '/Users/me/项目']);
    const seen: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const u = new URL(String(input));
      seen.push(u.searchParams.get('path') ?? '');
      return Promise.resolve(responseFor(true));
    });

    await pruneRecentWorkspaces(BASE_URL);

    expect(seen).toEqual(['/Users/me/My Folder', '/Users/me/项目']);
  });

  it('targets a custom storage key without polluting the default key', async () => {
    const KEY = 'aionui:team-recents';
    seed(['/keep', '/gone'], KEY);
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const path = new URL(String(input)).searchParams.get('path');
      return Promise.resolve(responseFor(path !== '/gone'));
    });

    const out = await pruneRecentWorkspaces(BASE_URL, KEY);

    expect(out).toEqual(['/keep']);
    expect(localStorage.getItem(DEFAULT_RECENT_WS_KEY)).toBeNull();
    expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual(['/keep']);
  });

  it('issues exactly one fs/browse request per cached entry', async () => {
    seed(['/a', '/b', '/c', '/d']);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(responseFor(true));
    await pruneRecentWorkspaces(BASE_URL);
    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });
});
