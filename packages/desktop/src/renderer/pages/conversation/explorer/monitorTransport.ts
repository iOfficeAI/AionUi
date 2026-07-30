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
    onNotification: applyMonitorNotification,
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

  return monitor;
}
