/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Where viewers that render their own content register how to reload it.
 *
 * Most tabs reload by re-reading the file and replacing `content`. A pdf cannot: it
 * renders from a stream URL that is derived from the file's identity and carries no
 * timestamp, so the address after a change is byte-identical to the address before —
 * assigning it again is a no-op and the viewer keeps showing the stale document. The
 * only way to get fresh bytes is to tell that webview to reload itself.
 *
 * A small registry rather than a ref threaded down through the panel: the panel does
 * not otherwise know or care that a viewer holds a webview, and passing a ref through
 * would put that detail in every layer between. Viewers opt in from their own effect
 * and clean up on unmount.
 *
 * Keyed by tab id so switching tabs cannot reload the wrong document.
 */
const reloaders = new Map<string, () => void>();

/**
 * Register how to reload the given tab, returning the cleanup.
 *
 * ```ts
 * useEffect(() => registerTabReloader(tabId, () => webviewRef.current?.reload()), [tabId]);
 * ```
 */
export const registerTabReloader = (tabId: string, reload: () => void): (() => void) => {
  reloaders.set(tabId, reload);
  return () => {
    // Only remove our own entry: a remount may already have replaced it.
    if (reloaders.get(tabId) === reload) reloaders.delete(tabId);
  };
};

/**
 * Ask a tab's viewer to reload itself.
 *
 * Returns false when nothing is registered — the tab either reloads through the
 * ordinary content path or has no way to refresh at all, and the caller decides which.
 */
export const reloadViaViewer = (tabId: string): boolean => {
  const reload = reloaders.get(tabId);
  if (!reload) return false;
  reload();
  return true;
};

/** Test hook: drop every registration. */
export const resetTabReloadersForTest = (): void => {
  reloaders.clear();
};
