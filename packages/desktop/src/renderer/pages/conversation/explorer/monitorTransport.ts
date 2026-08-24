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
import {
  configurePreviewWatch,
  notifyPreviewWatchChange,
  type PreviewChangeSignal,
} from '../Preview/context/previewWatchStore';
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
  if (method === 'fs/delta') {
    const delta = params as { target?: DirRef; changes?: Change[] } | undefined;
    if (delta?.target) {
      const signal = classifyDelta(delta.changes ?? []);
      if (signal) notifyPreviewWatchChange(refToKey(delta.target), signal);
    }
    return;
  }

  // A `fs/snapshot` NOTIFICATION is not the initial listing — that arrives in the
  // subscribe response and never comes through here. It only appears after the kernel
  // dropped events and the backend rescanned instead, which the backend now marks
  // (`reason: 'overflow'`).
  //
  // Reacting conservatively is the only correct option: a rescan *replaces* the
  // per-file deltas coalesced into its debounce window rather than accompanying them,
  // so the changes it stands for are gone, not pending. The listing it carries has no
  // modification times, so there is no way to narrow it to the files that changed.
  //
  // The marker is treated as confirmation rather than as the test. A snapshot can only
  // reach this fan-out from an overflow rescan (verified in aioncore: the subscribe
  // reply is returned to its caller and never dispatched as a notification), so
  // requiring `reason` would make a backend that predates the marker fail silently —
  // exactly the failure this change exists to remove.
  if (method === 'fs/snapshot') {
    const snapshot = params as { target?: DirRef } | undefined;
    if (snapshot?.target) {
      notifyPreviewWatchChange(refToKey(snapshot.target), { kind: 'directory', reason: 'overflow' });
    }
  }
};

/**
 * Decide what a delta tells the preview panel, or `null` when it tells it nothing.
 *
 * `modified` is the only op that says an open document is now stale; additions,
 * removals and renames change the listing, which is the explorer's concern. So the
 * precise answer is the modified names — but only when every op was understood.
 *
 * An op this build does not recognise means the backend has moved ahead, and it may
 * well be the one carrying "this file's contents changed". Dropping it would look
 * identical to "nothing relevant happened", which is how the `modified` op itself went
 * unnoticed here for five blocks of work. Falling back to the whole directory costs a
 * few unnecessary re-reads and cannot cost a silently stale document.
 *
 * Returning `null` rather than a third "nothing to report" variant keeps that state out
 * of the signal type: a caller with nothing to say says nothing, so no listener has to
 * decide what an empty report means.
 */
const classifyDelta = (changes: readonly Change[]): PreviewChangeSignal | null => {
  const names: string[] = [];
  let unknown = false;

  for (const change of changes) {
    switch (change.op) {
      case 'modified':
        names.push(change.name);
        break;
      case 'added':
      case 'removed':
      case 'renamed':
        break;
      default:
        unknown = true;
        break;
    }
  }

  if (unknown) return { kind: 'directory', reason: 'unknown-op' };
  if (names.length === 0) return null;
  return { kind: 'files', names: names as [string, ...string[]] };
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
    remount: async (refs: DirRef[]): Promise<SubscribeResult> => {
      const result = (await monitor.request('fs/remount', { targets: refs })) as MonitorRequestResult;
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
