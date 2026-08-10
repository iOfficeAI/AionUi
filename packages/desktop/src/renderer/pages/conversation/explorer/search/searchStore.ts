/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Module-level store for project filename search (see `formal/runtime/search.md`).
 * Drives one `fs/search` stream at a time over the shared MonitorClient: issue a
 * search, accumulate `fs/searchMatch` batches keyed by the request id, settle on
 * the terminal response. Both UI skins (the `@`-mention dropdown and the search
 * result panel) subscribe to this one store — "same stream, two skins"
 * (search.md §结果 UI).
 *
 * Supersede (search.md §引擎 / protocol.md §取消两路): a new search on the same
 * connection auto-supersedes the previous in-flight one. We bump `activeSearchId`
 * so any late `fs/searchMatch` for the old id is discarded, and abandon the old
 * request locally (the backend sends no terminal for a superseded search). An
 * explicit cancel (box closed / query cleared) sends `fs/searchCancel`.
 *
 * The send/cancel/abandon side is behind an injected `SearchPort`, so the
 * supersede/discard/limit logic is unit-testable without a real socket.
 */

import { useSyncExternalStore } from 'react';

import type { DirRef } from '../explorerModel';
import type { RpcId } from '../monitorClient';
import { rankSearchHits, type SearchHit, searchHitKey } from './searchModel';

/** `fs/search` request params (protocol.md §文件名搜索). */
export type SearchParams = {
  roots: DirRef[];
  query: string;
  limit?: number;
};

/** `fs/search` terminal response (protocol.md). */
export type SearchResult = {
  limit_reached: boolean;
  total: number;
};

/** `fs/searchMatch` notification params (protocol.md). */
export type SearchMatchParams = {
  search_id: RpcId;
  matches: SearchHit[];
};

/**
 * The send side the store rides. `search` issues an `fs/search` request and
 * returns its assigned id + terminal-response promise; `cancel` sends an
 * `fs/searchCancel` notification; `abandon` drops a superseded request's local
 * pending entry (no terminal is coming).
 */
export type SearchPort = {
  search: (params: SearchParams) => { id: RpcId; result: Promise<SearchResult> };
  cancel: (searchId: RpcId) => void;
  abandon: (searchId: RpcId) => void;
};

export type SearchStatus = 'idle' | 'searching' | 'done' | 'error';

/** Owner ids for the two mutually-exclusive search skins (one owns the shared stream). */
export const MENTION_SEARCH_OWNER = 'mention';
export const PANEL_SEARCH_OWNER = 'panel';

/** Projected view for React consumers. `hits` is display-ranked (searchModel). */
export type SearchView = {
  query: string;
  hits: SearchHit[];
  status: SearchStatus;
  limitReached: boolean;
  total: number;
  error?: string;
  /**
   * Which UI skin currently owns the single shared stream (search.md "same
   * stream, two skins"). The store drives one backend search at a time (one WS,
   * backend auto-supersedes per connection), so the `@`-mention dropdown and the
   * search panel are mutually exclusive: each renders results only while it is
   * the owner. `null` when idle/released. A new `startSearch` takes ownership;
   * `cancelSearch` releases it.
   */
  owner: string | null;
};

// ── internal state ──────────────────────────────────────────────────────────

let port: SearchPort | null = null;

let activeSearchId: RpcId | null = null;
let owner: string | null = null; // which skin owns the shared stream (mutual exclusion)
let query = '';
let rawHits: SearchHit[] = []; // accumulation order; ranked lazily into the snapshot
let seen = new Set<string>(); // dedup by searchHitKey (a hit could repeat across batches)
let status: SearchStatus = 'idle';
let limitReached = false;
let total = 0;
let error: string | undefined;

const IDLE_SNAPSHOT: SearchView = { query: '', hits: [], status: 'idle', limitReached: false, total: 0, owner: null };
let snapshot: SearchView = IDLE_SNAPSHOT;

const listeners = new Set<() => void>();

/** Rebuild the cached snapshot (ranked) and notify subscribers. */
function publish(): void {
  snapshot = {
    query,
    hits: rankSearchHits(rawHits, query),
    status,
    limitReached,
    total,
    error,
    owner,
  };
  for (const listener of listeners) listener();
}

function resetState(): void {
  activeSearchId = null;
  owner = null;
  query = '';
  rawHits = [];
  seen = new Set();
  status = 'idle';
  limitReached = false;
  total = 0;
  error = undefined;
}

// ── wiring ──────────────────────────────────────────────────────────────────

/** Inject the send side (called once by the runtime wiring). */
export const configureSearchStore = (nextPort: SearchPort): void => {
  port = nextPort;
};

// ── actions ───────────────────────────────────────────────────────────────

/**
 * Start (or replace) the active search on behalf of `nextOwner` (the UI skin).
 * Takes ownership of the shared stream — the other skin's view goes non-owner
 * and stops rendering results (mutual exclusion). Abandons any in-flight search
 * locally (the backend auto-supersedes it), then issues a fresh `fs/search` and
 * tracks its id as authoritative — later matches for older ids are discarded.
 */
export const startSearch = (nextOwner: string, roots: DirRef[], nextQuery: string, limit?: number): void => {
  if (!port) {
    status = 'error';
    error = 'search port not configured';
    publish();
    return;
  }

  // Supersede the previous in-flight search: the backend replaces it and sends
  // no terminal for the old id, so drop its local pending entry too.
  if (activeSearchId !== null && status === 'searching') {
    port.abandon(activeSearchId);
  }

  const { id, result } = port.search({ roots, query: nextQuery, limit });
  activeSearchId = id;
  owner = nextOwner;
  query = nextQuery;
  rawHits = [];
  seen = new Set();
  status = 'searching';
  limitReached = false;
  total = 0;
  error = undefined;
  publish();

  result.then(
    (res) => {
      if (activeSearchId !== id) return; // superseded — its terminal (if any) is stale
      // The response is terminal: the search has ended (protocol.md:159). Clear
      // the active id so any late fs/searchMatch for it is discarded — results
      // must not keep changing after "done".
      activeSearchId = null;
      status = 'done';
      limitReached = Boolean(res?.limit_reached);
      total = typeof res?.total === 'number' ? res.total : rawHits.length;
      publish();
    },
    (err: unknown) => {
      if (activeSearchId !== id) return; // superseded/abandoned — ignore its rejection
      activeSearchId = null; // terminal (error): reject any late match for this id
      status = 'error';
      error = err instanceof Error ? err.message : String(err);
      publish();
    }
  );
};

/**
 * Apply an inbound `fs/searchMatch` batch. Discards batches whose `search_id`
 * does not match the authoritative search (superseded stream) and de-dups hits.
 */
export const applySearchMatch = (params: SearchMatchParams): void => {
  if (activeSearchId === null || params.search_id !== activeSearchId) return; // stale/unknown
  let changed = false;
  for (const hit of params.matches ?? []) {
    const key = searchHitKey(hit);
    if (seen.has(key)) continue;
    seen.add(key);
    rawHits.push(hit);
    changed = true;
  }
  if (changed) publish();
};

/**
 * Cancel the active search on behalf of `requester` (box closed / query cleared):
 * send `fs/searchCancel`, drop the local pending entry, and reset to idle.
 *
 * OWNER-GUARDED: only the current owner may release the shared stream. A
 * non-owner's cleanup (e.g. the `@` menu closing while the search panel owns the
 * stream) is a no-op, so it can't stomp the current owner's results.
 */
export const cancelSearch = (requester: string): void => {
  if (requester !== owner) return; // not the owner → leave the current owner untouched
  if (activeSearchId !== null) {
    port?.cancel(activeSearchId);
    port?.abandon(activeSearchId);
  }
  resetState();
  publish();
};

/** Reset to idle without touching the wire (e.g. on conversation/project switch). */
export const resetSearch = (): void => {
  resetState();
  publish();
};

// ── React binding ───────────────────────────────────────────────────────────

export const getSearchSnapshot = (): SearchView => snapshot;

export const subscribeSearch = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Subscribe a React component to the search view. */
export const useSearch = (): SearchView => useSyncExternalStore(subscribeSearch, getSearchSnapshot, getSearchSnapshot);

/** Test hook: reset module state (port + data). */
export const resetSearchStoreForTest = (): void => {
  port = null;
  resetState();
  snapshot = IDLE_SNAPSHOT;
  listeners.clear();
};
