import { afterEach, describe, expect, it } from 'vitest';

import type { DirRef } from '@/renderer/pages/conversation/explorer/explorerModel';
import type { SearchHit } from '@/renderer/pages/conversation/explorer/search/searchModel';
import {
  applySearchMatch,
  cancelSearch,
  configureSearchStore,
  getSearchSnapshot,
  resetSearchStoreForTest,
  type SearchPort,
  type SearchResult,
  startSearch,
} from '@/renderer/pages/conversation/explorer/search/searchStore';

type Call = { id: number; params: unknown; resolve: (r: SearchResult) => void; reject: (e: unknown) => void };

function makePort() {
  const calls: Call[] = [];
  const cancelled: number[] = [];
  const abandoned: number[] = [];
  let nextId = 1;
  const port: SearchPort = {
    search: (params) => {
      const id = nextId++;
      let resolve!: (r: SearchResult) => void;
      let reject!: (e: unknown) => void;
      const result = new Promise<SearchResult>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      calls.push({ id, params, resolve, reject });
      return { id, result };
    },
    cancel: (sid) => cancelled.push(sid),
    abandon: (sid) => abandoned.push(sid),
  };
  return { port, calls, cancelled, abandoned };
}

const ROOTS: DirRef[] = [{ pe_id: 'pe1', relative_path: '' }];
const OWNER = 'test';
const hit = (name: string): SearchHit => ({ pe_id: 'pe1', relative_path: `src/${name}`, name });

afterEach(() => resetSearchStoreForTest());

describe('searchStore lifecycle', () => {
  it('starts a search, accumulates matches, and settles on the terminal response', async () => {
    const { port, calls } = makePort();
    configureSearchStore(port);

    startSearch(OWNER, ROOTS, 'btn');
    expect(getSearchSnapshot()).toMatchObject({ query: 'btn', status: 'searching', hits: [] });
    expect(calls[0].params).toEqual({ roots: ROOTS, query: 'btn', limit: undefined });

    applySearchMatch({ search_id: calls[0].id, matches: [hit('btn.tsx'), hit('iconBtn.tsx')] });
    expect(getSearchSnapshot().hits.map((h) => h.name)).toEqual(['btn.tsx', 'iconBtn.tsx']);

    calls[0].resolve({ limit_reached: true, total: 2 });
    await Promise.resolve();
    expect(getSearchSnapshot()).toMatchObject({ status: 'done', limitReached: true, total: 2 });
  });

  it('drops a late match that arrives after the terminal response (search ended)', async () => {
    const { port, calls } = makePort();
    configureSearchStore(port);
    startSearch(OWNER, ROOTS, 'btn');
    applySearchMatch({ search_id: calls[0].id, matches: [hit('btn.tsx')] });

    calls[0].resolve({ limit_reached: false, total: 1 });
    await Promise.resolve();
    expect(getSearchSnapshot()).toMatchObject({ status: 'done', total: 1 });

    // protocol.md:159 — response is terminal; a straggler match for the same id
    // must not mutate the finished result set.
    applySearchMatch({ search_id: calls[0].id, matches: [hit('late.tsx')] });
    expect(getSearchSnapshot().hits.map((h) => h.name)).toEqual(['btn.tsx']);
  });

  it('de-dups a hit that repeats across batches', () => {
    const { port, calls } = makePort();
    configureSearchStore(port);
    startSearch(OWNER, ROOTS, 'btn');
    applySearchMatch({ search_id: calls[0].id, matches: [hit('btn.tsx')] });
    applySearchMatch({ search_id: calls[0].id, matches: [hit('btn.tsx')] });
    expect(getSearchSnapshot().hits).toHaveLength(1);
  });

  it('surfaces an error terminal', async () => {
    const { port, calls } = makePort();
    configureSearchStore(port);
    startSearch(OWNER, ROOTS, 'btn');
    calls[0].reject(new Error('provider_unavailable'));
    await Promise.resolve();
    expect(getSearchSnapshot()).toMatchObject({ status: 'error', error: 'provider_unavailable' });
  });

  it('errors when no port is configured', () => {
    resetSearchStoreForTest();
    startSearch(OWNER, ROOTS, 'btn');
    expect(getSearchSnapshot().status).toBe('error');
  });
});

describe('searchStore supersede', () => {
  it('abandons the in-flight search and discards its late matches', () => {
    const { port, calls, abandoned } = makePort();
    configureSearchStore(port);

    startSearch(OWNER, ROOTS, 'bt');
    applySearchMatch({ search_id: calls[0].id, matches: [hit('old.tsx')] });

    startSearch(OWNER, ROOTS, 'btn'); // supersede
    expect(abandoned).toContain(calls[0].id);
    expect(getSearchSnapshot()).toMatchObject({ query: 'btn', status: 'searching', hits: [] });

    // Late match for the superseded id is dropped; new id is applied.
    applySearchMatch({ search_id: calls[0].id, matches: [hit('stale.tsx')] });
    expect(getSearchSnapshot().hits).toEqual([]);
    applySearchMatch({ search_id: calls[1].id, matches: [hit('btn.tsx')] });
    expect(getSearchSnapshot().hits.map((h) => h.name)).toEqual(['btn.tsx']);
  });

  it('ignores the terminal response of a superseded search', async () => {
    const { port, calls } = makePort();
    configureSearchStore(port);
    startSearch(OWNER, ROOTS, 'bt');
    startSearch(OWNER, ROOTS, 'btn');
    calls[0].resolve({ limit_reached: false, total: 9 }); // stale terminal
    await Promise.resolve();
    expect(getSearchSnapshot()).toMatchObject({ status: 'searching', total: 0 });
  });
});

describe('searchStore owner (mutual exclusion)', () => {
  it('tracks the owner of the active search and hands it over on a new owner', () => {
    const { port, calls } = makePort();
    configureSearchStore(port);

    startSearch('mention', ROOTS, 'a');
    expect(getSearchSnapshot().owner).toBe('mention');

    // A different skin starts → it takes ownership; the previous owner's view is
    // now the new search (the previous owner renders nothing on owner mismatch).
    startSearch('panel', ROOTS, 'b');
    expect(getSearchSnapshot().owner).toBe('panel');
    applySearchMatch({ search_id: calls[1].id, matches: [hit('b.tsx')] });
    expect(getSearchSnapshot().hits.map((h) => h.name)).toEqual(['b.tsx']);
  });

  it('releases ownership on cancel', () => {
    const { port } = makePort();
    configureSearchStore(port);
    startSearch('panel', ROOTS, 'a');
    expect(getSearchSnapshot().owner).toBe('panel');
    cancelSearch('panel');
    expect(getSearchSnapshot().owner).toBeNull();
  });

  it('non-owner cancel is a no-op (does not stomp the current owner)', () => {
    const { port, calls } = makePort();
    configureSearchStore(port);
    startSearch('panel', ROOTS, 'a');
    applySearchMatch({ search_id: calls[0].id, matches: [hit('a.tsx')] });

    // The `@` mention's cleanup fires while the panel owns the stream.
    cancelSearch('mention');
    expect(getSearchSnapshot()).toMatchObject({ owner: 'panel', query: 'a' });
    expect(getSearchSnapshot().hits.map((h) => h.name)).toEqual(['a.tsx']);
  });
});

describe('searchStore cancel', () => {
  it('sends fs/searchCancel, abandons the pending request, and resets to idle', () => {
    const { port, calls, cancelled, abandoned } = makePort();
    configureSearchStore(port);
    startSearch(OWNER, ROOTS, 'btn');
    applySearchMatch({ search_id: calls[0].id, matches: [hit('btn.tsx')] });

    cancelSearch(OWNER);
    expect(cancelled).toContain(calls[0].id);
    expect(abandoned).toContain(calls[0].id);
    expect(getSearchSnapshot()).toMatchObject({ status: 'idle', hits: [], query: '' });

    // A match arriving after cancel is discarded (no active search).
    applySearchMatch({ search_id: calls[0].id, matches: [hit('late.tsx')] });
    expect(getSearchSnapshot().hits).toEqual([]);
  });
});
