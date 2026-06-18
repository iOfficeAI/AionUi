/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tracks fire-and-forget persistence writes so they can finish flushing to
 * disk before the app exits. Without this, the last write triggered by an
 * action right before quit (e.g. ⌘Q immediately after a window resize or
 * a ⌘+ zoom shortcut) routinely loses the race against process teardown,
 * which manifests to the user as the setting "not being remembered".
 */

import { app } from 'electron';

const pending = new Set<Promise<unknown>>();
let installed = false;
let flushing = false;

const ensureHandlerInstalled = (): void => {
  if (installed) return;
  installed = true;
  app.on('before-quit', (event) => {
    if (flushing) {
      if (pending.size > 0) {
        event.preventDefault();
      }
      return;
    }
    if (pending.size === 0) return;
    flushing = true;
    event.preventDefault();
    Promise.allSettled(pending).finally(() => {
      app.quit();
    });
  });
};

/**
 * Register a write so the app waits for it on quit. Errors are swallowed —
 * persistence callers are expected to log their own failures; the only role
 * here is to keep the process alive long enough for the write to land.
 */
export const trackPersistedWrite = (promise: Promise<unknown>): Promise<unknown> => {
  ensureHandlerInstalled();
  const tracked = promise.catch(() => {});
  pending.add(tracked);
  tracked.finally(() => pending.delete(tracked));
  return promise;
};

/** Test-only helper to reset module state between cases. */
export const __resetPersistOnQuitForTests = (): void => {
  pending.clear();
  installed = false;
  flushing = false;
};
