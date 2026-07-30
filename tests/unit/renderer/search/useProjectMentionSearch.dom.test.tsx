/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Locks the `@`-mention gating behaviors (the core user path). SendBox has many
 * deps, so the gate is extracted into useProjectMentionSearch and tested here at
 * hook granularity: menu open → fs/search, query change → supersede, menu close
 * → cancel, and the defensive fallback gate (roots unresolved → inactive, caller
 * falls back to list_workspace_files). Roots + the stream hook are mocked so the
 * gate/driver logic is observable without a socket.
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DirRef } from '@/renderer/pages/conversation/explorer/explorerModel';
import type { SearchHit } from '@/renderer/pages/conversation/explorer/search/searchModel';
import type { SearchView } from '@/renderer/pages/conversation/explorer/search/searchStore';

const roots = vi.hoisted(() => ({ value: [] as DirRef[], peNames: {} as Record<string, string> }));
vi.mock('@/renderer/pages/conversation/explorer/search/useProjectSearchRoots', () => ({
  useProjectSearchRoots: () => ({ roots: roots.value, peNames: roots.peNames }),
}));

const fs = vi.hoisted(() => ({
  view: { query: '', hits: [], status: 'idle', limitReached: false, total: 0, owner: 'mention' } as SearchView,
  runSearch: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock('@/renderer/pages/conversation/explorer/search/useFileSearch', () => ({
  useFileSearch: () => ({ view: fs.view, runSearch: fs.runSearch, cancel: fs.cancel }),
}));

import { useProjectMentionSearch } from '@/renderer/pages/conversation/explorer/search/useProjectMentionSearch';

const PROJECT_ROOTS: DirRef[] = [{ pe_id: 'pe1', relative_path: '' }];
const hit = (name: string): SearchHit => ({ pe_id: 'pe1', relative_path: `src/${name}`, name });
const setView = (v: Partial<SearchView>): void => {
  fs.view = { query: '', hits: [], status: 'idle', limitReached: false, total: 0, owner: 'mention', ...v };
};

beforeEach(() => {
  roots.value = PROJECT_ROOTS;
  roots.peNames = {};
  setView({});
  fs.runSearch.mockClear();
  fs.cancel.mockClear();
});
afterEach(() => cleanup());

const render = (props: { query: string; isOpen: boolean; limit?: number }) =>
  renderHook((p) => useProjectMentionSearch({ limit: 8, ...p }), { initialProps: props });

describe('useProjectMentionSearch gating', () => {
  it('opening the menu with resolved roots issues an fs/search for the query', () => {
    render({ query: 'btn', isOpen: true });
    expect(fs.runSearch).toHaveBeenCalledWith('btn');
  });

  it('changing the query while open supersedes with a new fs/search', () => {
    const { rerender } = render({ query: 'bt', isOpen: true });
    expect(fs.runSearch).toHaveBeenLastCalledWith('bt');
    rerender({ query: 'btn', isOpen: true });
    expect(fs.runSearch).toHaveBeenLastCalledWith('btn');
  });

  it('closing the menu cancels the active search', () => {
    const { rerender } = render({ query: 'btn', isOpen: true });
    fs.cancel.mockClear();
    rerender({ query: 'btn', isOpen: false });
    expect(fs.cancel).toHaveBeenCalled();
  });

  it('exposes ranked hits as project chat-ref items (capped to limit)', () => {
    setView({ hits: [hit('a.tsx'), hit('b.tsx'), hit('c.tsx')], status: 'done' });
    const { result } = render({ query: 'x', isOpen: true, limit: 2 });
    expect(result.current.active).toBe(true);
    expect(result.current.items).toHaveLength(2);
    expect(result.current.items[0].chatRef).toEqual({ kind: 'project', pe_id: 'pe1', relative_path: 'src/a.tsx' });
  });

  it('exposes the pe name map for the PE · REL label', () => {
    roots.peNames = { pe1: 'TEAMS' };
    const { result } = render({ query: 'x', isOpen: true });
    expect(result.current.peNames).toEqual({ pe1: 'TEAMS' });
  });

  it('suppresses results when the search panel owns the stream (mutual exclusion)', () => {
    setView({ hits: [hit('a.tsx')], status: 'done', owner: 'panel' });
    const { result } = render({ query: 'x', isOpen: true });
    expect(result.current.items).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('reflects the searching state as loading', () => {
    setView({ status: 'searching' });
    const { result } = render({ query: 'x', isOpen: true });
    expect(result.current.loading).toBe(true);
  });

  describe('defensive fallback gate (roots unresolved)', () => {
    beforeEach(() => {
      roots.value = []; // backfill / async-load window
    });

    it('is inactive, issues no search, and yields empty items so the caller falls back', () => {
      const { result } = render({ query: 'btn', isOpen: true });
      expect(result.current.active).toBe(false);
      expect(result.current.items).toEqual([]);
      expect(result.current.loading).toBe(false);
      expect(fs.runSearch).not.toHaveBeenCalled();
    });

    it('activates and searches once roots resolve mid-open', () => {
      const { rerender } = render({ query: 'btn', isOpen: true });
      expect(fs.runSearch).not.toHaveBeenCalled();
      act(() => {
        roots.value = PROJECT_ROOTS; // roots arrive (project.get resolved / backfill landed)
      });
      rerender({ query: 'btn', isOpen: true });
      expect(fs.runSearch).toHaveBeenCalledWith('btn');
    });
  });
});
