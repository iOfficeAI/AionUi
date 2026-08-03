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

import type { DirRef, Entry } from './explorerModel';
import type { SubscribeResult } from './explorerStore';
import { applyMonitorNotification, configureExplorerStore, onReconnect } from './explorerStore';
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
  } else {
    applyMonitorNotification(method, params);
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
