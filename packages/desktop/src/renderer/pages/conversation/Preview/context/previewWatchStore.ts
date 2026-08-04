/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { keyToRef, reconcileDiff, type DirRef, type PeKey } from '@/renderer/pages/conversation/explorer/explorerModel';
import { deriveWatchTargets, type SubscribableTab } from './previewWatchTargets';

/**
 * The preview panel's directory subscriptions.
 *
 * Module-level rather than component state on purpose. The panel unmounts whenever
 * the user navigates between conversation pages while its tabs — and therefore its
 * need for change signals — outlive that. Tying subscriptions to a component would
 * drop them on every navigation and re-add them on the way back; tying them to tab
 * state means the two stay in step by construction.
 *
 * The only primitive is reconciliation: compute the wanted set, diff it against what
 * is currently subscribed, apply the difference. Nothing here adds or removes a
 * subscription directly, which is what keeps repeated runs harmless — and they will
 * be repeated, because any write to a tab's metadata (by this feature or another)
 * produces a new tabs array and triggers another pass.
 */

/** How this store reaches the monitor connection. Injected so it stays testable. */
export type PreviewWatchPort = {
  subscribe: (refs: DirRef[]) => Promise<unknown>;
  unsubscribe: (refs: DirRef[]) => void;
};

let port: PreviewWatchPort | null = null;

/** Directories currently subscribed on the panel's behalf. */
let current: Set<PeKey> = new Set();

/**
 * Listeners notified when a watched directory reports changed files.
 *
 * `changedNames` are the entry names the backend flagged as modified within that
 * directory. Empty means "something happened here but no file was named" — a rename
 * or an addition — which the panel treats as affecting nothing it has open.
 */
const changeListeners = new Set<(key: PeKey, changedNames: readonly string[]) => void>();

/** Wire the store to the monitor connection. Idempotent. */
export const configurePreviewWatch = (next: PreviewWatchPort | null): void => {
  port = next;
};

/**
 * Bring subscriptions in line with what `tabs` need.
 *
 * Safe to call as often as tab state changes: the diff is computed against the
 * current set, so a repeated call with unchanged tabs performs no work. Errors from
 * the subscribe request are swallowed deliberately — a failed subscription costs the
 * user an automatic refresh signal, and the refresh button still works by hand, so
 * there is nothing worth interrupting them for.
 */
export const reconcilePreviewWatch = (tabs: readonly SubscribableTab[]): void => {
  if (!port) return;

  const want = deriveWatchTargets(tabs);
  const { toAdd, toRemove } = reconcileDiff(want, current);
  if (toAdd.length === 0 && toRemove.length === 0) return;

  // Record the new intent before awaiting anything, so a second call that arrives
  // while a subscribe is in flight diffs against the intended state rather than
  // re-requesting the same directories.
  current = want;

  if (toRemove.length > 0) port.unsubscribe(toRemove.map(keyToRef));
  if (toAdd.length > 0) {
    void port.subscribe(toAdd.map(keyToRef)).catch(() => {
      // Signal lost, manual refresh unaffected — see above.
    });
  }
};

/** Drop every subscription (used when the panel's scope goes away entirely). */
export const resetPreviewWatch = (): void => {
  if (port && current.size > 0) {
    port.unsubscribe([...current].map(keyToRef));
  }
  current = new Set();
};

/** Directories currently subscribed. Exposed for assertions. */
export const currentPreviewWatchTargets = (): ReadonlySet<PeKey> => current;

/**
 * Subscribe to "a directory the panel watches changed".
 *
 * The payload is the directory, not the file: the `fs` channel reports directory
 * deltas, and mapping a delta back to the affected tabs is the caller's job.
 */
export const onPreviewWatchChange = (listener: (key: PeKey, changedNames: readonly string[]) => void): (() => void) => {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
};

/**
 * Report a directory change to listeners.
 *
 * Changes for directories the panel is not watching are dropped: the connection is
 * shared with the explorer, which subscribes to its own set, so this store sees
 * traffic that is none of its business.
 */
export const notifyPreviewWatchChange = (key: PeKey, changedNames: readonly string[] = []): void => {
  if (!current.has(key)) return;
  for (const listener of changeListeners) listener(key, changedNames);
};
