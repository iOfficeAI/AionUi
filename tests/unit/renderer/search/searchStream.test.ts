import { afterEach, describe, expect, it } from 'vitest';

import { MonitorClient, type MonitorTransport } from '@/renderer/pages/conversation/explorer/monitorClient';
import type { DirRef } from '@/renderer/pages/conversation/explorer/explorerModel';
import {
  applySearchMatch,
  cancelSearch,
  configureSearchStore,
  getSearchSnapshot,
  resetSearchStoreForTest,
  type SearchMatchParams,
  type SearchResult,
  startSearch,
} from '@/renderer/pages/conversation/explorer/search/searchStore';

// End-to-end over the REAL MonitorClient (mock stream = the injected transport):
// this exercises requestWithId + abandon + notify exactly as the production
// `monitorTransport` wiring does, so the supersede path really rejects the old
// request (mock ports would hide that) and we can assert nothing is unhandled.

type Harness = {
  transport: MonitorTransport;
  sent: Array<{ id?: number; method: string; params: unknown }>;
  feed: (frame: unknown) => void;
};

function makeHarness(): Harness {
  const sent: Harness['sent'] = [];
  let frameCb: ((f: unknown) => void) | undefined;
  return {
    transport: {
      send: (f) => {
        sent.push(f as Harness['sent'][number]);
        return true;
      },
      onFrame: (cb) => {
        frameCb = cb;
        return () => {
          frameCb = undefined;
        };
      },
      onReconnect: () => () => {},
    },
    sent,
    feed: (frame) => frameCb?.(frame),
  };
}

const ROOTS: DirRef[] = [{ pe_id: 'pe1', relative_path: '' }];
const OWNER = 'test';
const match = (id: number, name: string): unknown => ({
  jsonrpc: '2.0',
  method: 'fs/searchMatch',
  params: {
    search_id: id,
    matches: [{ pe_id: 'pe1', relative_path: `src/${name}`, name }],
  } satisfies SearchMatchParams,
});

let client: MonitorClient;

function wire(): Harness {
  const h = makeHarness();
  client = new MonitorClient({
    transport: h.transport,
    onNotification: (method, params) => {
      if (method === 'fs/searchMatch') applySearchMatch(params as SearchMatchParams);
    },
  });
  configureSearchStore({
    search: (params) => {
      const { id, result } = client.requestWithId('fs/search', params);
      return { id, result: result as Promise<SearchResult> };
    },
    cancel: (searchId) => client.notify('fs/searchCancel', { search_id: searchId }),
    abandon: (searchId) => client.abandon(searchId),
  });
  return h;
}

afterEach(() => {
  client?.dispose();
  resetSearchStoreForTest();
});

describe('search stream over real MonitorClient', () => {
  it('streams matches then settles on the terminal response', async () => {
    const h = wire();
    startSearch(OWNER, ROOTS, 'btn');
    const id = h.sent[0].id as number;
    expect(h.sent[0]).toMatchObject({ method: 'fs/search', params: { roots: ROOTS, query: 'btn' } });

    h.feed(match(id, 'btn.tsx'));
    h.feed(match(id, 'iconBtn.tsx'));
    expect(getSearchSnapshot().hits.map((x) => x.name)).toEqual(['btn.tsx', 'iconBtn.tsx']);

    h.feed({ jsonrpc: '2.0', id, result: { limit_reached: false, total: 2 } });
    await Promise.resolve();
    expect(getSearchSnapshot()).toMatchObject({ status: 'done', total: 2 });
  });

  it('supersede: the old request is really abandoned (rejected) and swallowed by the stale guard — no unhandled rejection', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      const h = wire();
      startSearch(OWNER, ROOTS, 'bt');
      const id1 = h.sent[0].id as number;
      h.feed(match(id1, 'old.tsx'));

      startSearch(OWNER, ROOTS, 'btn'); // supersede → client.abandon(id1) rejects id1's result
      const id2 = h.sent[1].id as number;
      expect(id2).toBe(id1 + 1);

      // Flush microtasks so the abandoned promise's rejection handler runs.
      await Promise.resolve();
      await Promise.resolve();

      expect(getSearchSnapshot()).toMatchObject({ status: 'searching', query: 'btn', hits: [] });

      // A late terminal for the abandoned id must not throw or re-settle.
      expect(() => h.feed({ jsonrpc: '2.0', id: id1, result: { limit_reached: false, total: 9 } })).not.toThrow();
      // Late match for the old id is discarded; new id applies.
      h.feed(match(id1, 'stale.tsx'));
      h.feed(match(id2, 'btn.tsx'));
      expect(getSearchSnapshot().hits.map((x) => x.name)).toEqual(['btn.tsx']);

      await Promise.resolve();
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('cancel sends fs/searchCancel over the wire and resets', () => {
    const h = wire();
    startSearch(OWNER, ROOTS, 'btn');
    const id = h.sent[0].id as number;
    cancelSearch(OWNER);
    expect(
      h.sent.some((f) => f.method === 'fs/searchCancel' && (f.params as { search_id: number }).search_id === id)
    ).toBe(true);
    expect(getSearchSnapshot()).toMatchObject({ status: 'idle', hits: [] });
  });
});
