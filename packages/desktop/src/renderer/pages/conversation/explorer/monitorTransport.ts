/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Binds the MonitorClient + explorer store to the shared WS singleton
 * (`httpBridge`). This is the thin production wiring — the pairing/store logic
 * it connects is covered by unit tests; the live socket path is exercised by
 * end-to-end integration against a running aioncore backend.
 */

import { wsEmitter, wsSend } from '@/common/adapter/httpBridge';

import { refToKey, type Change, type DirRef, type Entry } from './explorerModel';
import type { SubscribeResult } from './explorerStore';
import { applyMonitorNotification, configureExplorerStore, onReconnect } from './explorerStore';
import { configurePreviewWatch, notifyPreviewWatchChange } from '../Preview/context/previewWatchStore';
import type { MonitorTransport } from './monitorClient';
import { MonitorClient } from './monitorClient';
import {
  applySearchMatch,
  configureSearchStore,
  type SearchMatchParams,
  type SearchResult,
} from './search/searchStore';

const FS_EVENT = 'fs';
const RECONNECT_EVENT = 'realtime.reconnected';

/** Transport over the WS singleton: `fs` event族 in, `wsSend('fs', …)` out. */
export function createWsMonitorTransport(): MonitorTransport {
  return {
    send: (frame) => wsSend(FS_EVENT, frame),
    onFrame: (cb) => wsEmitter<unknown>(FS_EVENT).on(cb),
    onReconnect: (cb) => wsEmitter(RECONNECT_EVENT).on(cb),
  };
}

type MonitorRequestResult = { snapshots: Array<{ target: DirRef; entries: Entry[] }> };

/**
 * One connection, one notification dispatcher: `fs/searchMatch` feeds the search
 * store; everything else (`fs/snapshot` | `fs/delta`) feeds the explorer store.
 * Exported so the routing (search vs explorer isolation) is unit-tested directly
 * rather than through a closure.
 */
export const dispatchMonitorNotification = (method: string, params: unknown): void => {
  if (method === 'fs/searchMatch') {
    applySearchMatch(params as SearchMatchParams);
    return;
  }

  applyMonitorNotification(method, params);

  // Fan out directory changes to the preview panel as well.
  //
  // The panel subscribes to the directories holding its open files, which the
  // explorer may or may not also be watching — the backend folds duplicate
  // subscriptions into one watch, so both get the same delta over this one
  // connection and it has to reach both consumers. Routing rather than a second
  // connection: a `fs/delta` here is already the notification the panel needs.
  //
  // Only `fs/delta` is used as a change signal.
  //
  // A `fs/snapshot` NOTIFICATION is not the initial listing — that arrives in the
  // subscribe response and never comes through here. It appears when the kernel drops
  // events and the backend rescans instead, i.e. "too much changed to enumerate". It
  // would be the right thing to react to, but the wire form carries no modification
  // time and no marker distinguishing it, so there is no way to tell which of the
  // listed files actually changed.
  //
  // Consequence, deliberately accepted for now: when a tool rewrites many files at
  // once, the refresh indicator does not light up. Reloading by hand still fetches the
  // current content. Fixing it properly needs the backend to mark those snapshots;
  // tracked separately.
  if (method === 'fs/delta') {
    const delta = params as { target?: DirRef; changes?: Change[] } | undefined;
    if (delta?.target) {
      // Only `modified` names a file whose contents changed; additions, removals and
      // renames alter the listing, which is the explorer's concern rather than a
      // signal that an open document is now stale.
      const modified = (delta.changes ?? [])
        .filter((change): change is Extract<Change, { op: 'modified' }> => change.op === 'modified')
        .map((change) => change.name);
      notifyPreviewWatchChange(refToKey(delta.target), modified);
    }
  }
};

let client: MonitorClient | null = null;

/**
 * Wire the explorer runtime once: MonitorClient over the WS transport, store
 * notifications + reconnect, and the store's subscribe/unsubscribe port. Safe to
 * call repeatedly (idempotent). Returns the shared client.
 */
export function initExplorerRuntime(): MonitorClient {
  if (client) return client;

  const transport = createWsMonitorTransport();
  const monitor = new MonitorClient({
    transport,
    onNotification: dispatchMonitorNotification,
    onReconnect,
  });
  client = monitor;

  configureExplorerStore({
    subscribe: async (refs: DirRef[]): Promise<SubscribeResult> => {
      const result = (await monitor.request('fs/subscribe', { targets: refs })) as MonitorRequestResult;
      return { snapshots: result.snapshots };
    },
    unsubscribe: (refs: DirRef[]): void => {
      monitor.notify('fs/unsubscribe', { targets: refs });
    },
  });

  // The preview panel subscribes on its own behalf over this same client. It needs
  // its own subscriptions because the explorer's track what is expanded on screen
  // and drop on collapse, while a preview tab stays open regardless.
  configurePreviewWatch({
    subscribe: (refs: DirRef[]) => monitor.request('fs/subscribe', { targets: refs }),
    unsubscribe: (refs: DirRef[]): void => {
      monitor.notify('fs/unsubscribe', { targets: refs });
    },
  });

  configureSearchStore({
    search: (params) => {
      const { id, result } = monitor.requestWithId('fs/search', params);
      return { id, result: result as Promise<SearchResult> };
    },
    cancel: (searchId): void => {
      monitor.notify('fs/searchCancel', { search_id: searchId });
    },
    abandon: (searchId): void => {
      monitor.abandon(searchId);
    },
  });

  return monitor;
}
