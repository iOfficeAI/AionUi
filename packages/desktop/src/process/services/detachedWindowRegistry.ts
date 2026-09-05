/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BrowserWindow } from 'electron';

import { buildDetachedConversationHash } from '@/common/platform/detachedWindow';
import type { WindowBounds } from '@process/utils/windowBounds';

const DETACHED_WINDOW_CASCADE_OFFSET = 24;
const DETACHED_WINDOW_LOAD_TIMEOUT_MS = 30_000;

export type DetachedWindowRegistryDependencies = {
  createWindow: (bounds: WindowBounds) => BrowserWindow;
  loadWindow: (window: BrowserWindow, hash: string) => Promise<unknown>;
  loadTimeoutMs?: number;
  prepareWindow: (window: BrowserWindow) => void;
  resolveBounds: () => WindowBounds;
};

export type DetachedWindowRegistry = {
  openConversation: (conversationId: string) => Promise<BrowserWindow>;
  focusConversation: (conversationId: string) => boolean;
  isDetachedWindow: (window: BrowserWindow) => boolean;
};

const revealWindow = (window: BrowserWindow): void => {
  if (window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
};

const cascadeBounds = (bounds: WindowBounds, previous: Electron.Rectangle | null): WindowBounds => {
  if (!previous) return bounds;
  return {
    ...bounds,
    x: previous.x + DETACHED_WINDOW_CASCADE_OFFSET,
    y: previous.y + DETACHED_WINDOW_CASCADE_OFFSET,
  };
};

/**
 * Owns the one-window-per-conversation rule. BrowserWindow construction and
 * app-specific wiring stay injected so the bookkeeping is independently testable.
 */
export const createDetachedWindowRegistry = (
  dependencies: DetachedWindowRegistryDependencies
): DetachedWindowRegistry => {
  const windows = new Map<string, BrowserWindow>();
  const detachedWindows = new WeakSet<BrowserWindow>();
  const creationOrder: BrowserWindow[] = [];
  const readiness = new WeakMap<BrowserWindow, Promise<void>>();

  const forgetWindow = (conversationId: string, window: BrowserWindow): void => {
    if (windows.get(conversationId) === window) windows.delete(conversationId);
    const index = creationOrder.indexOf(window);
    if (index !== -1) creationOrder.splice(index, 1);
  };

  const focusConversation = (conversationId: string): boolean => {
    const existing = windows.get(conversationId);
    if (!existing) return false;
    if (existing.isDestroyed()) {
      windows.delete(conversationId);
      return false;
    }
    revealWindow(existing);
    return true;
  };

  const openConversation = async (conversationId: string): Promise<BrowserWindow> => {
    const existing = windows.get(conversationId);
    if (existing && !existing.isDestroyed()) {
      revealWindow(existing);
      const pending = readiness.get(existing);
      if (!pending) return existing;
      try {
        await pending;
        return existing;
      } catch (error) {
        // A genuine load failure destroys its window, so repeated requests must
        // still fail loudly. A rejected readiness on a window that is still
        // alive is stale bookkeeping (cancelled or soft-timed-out open): drop it
        // and build a replacement instead of poisoning every later request.
        if (existing.isDestroyed()) throw error;
        readiness.delete(existing);
        forgetWindow(conversationId, existing);
      }
    }
    if (existing) windows.delete(conversationId);

    const previousWindow = creationOrder.findLast((candidate) => !candidate.isDestroyed());
    const livePreviousBounds = previousWindow?.getBounds() ?? null;
    const window = dependencies.createWindow(cascadeBounds(dependencies.resolveBounds(), livePreviousBounds));
    windows.set(conversationId, window);
    detachedWindows.add(window);
    creationOrder.push(window);

    let userCloseRequested = false;
    let shown = false;
    let resolveClosed: (() => void) | undefined;
    let rejectClosed: ((error: Error) => void) | undefined;
    const closed = new Promise<void>((resolve, reject) => {
      resolveClosed = resolve;
      rejectClosed = reject;
    });
    void closed.catch(() => {});
    window.once('ready-to-show', () => {
      shown = true;
      revealWindow(window);
    });
    window.once('close', () => {
      userCloseRequested = true;
    });
    window.once('closed', () => {
      forgetWindow(conversationId, window);
      if (userCloseRequested) {
        resolveClosed?.();
      } else {
        rejectClosed?.(new Error('Detached conversation window closed before loading'));
      }
    });

    const handleSetupFailure = (error: unknown): void => {
      console.error('[AionUi] Failed to load detached conversation window:', error);
      forgetWindow(conversationId, window);
      if (!window.isDestroyed()) window.destroy();
    };

    try {
      dependencies.prepareWindow(window);
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const timedOut = new Promise<void>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Detached conversation window timed out while loading')),
          dependencies.loadTimeoutMs ?? DETACHED_WINDOW_LOAD_TIMEOUT_MS
        );
      });
      let load: Promise<unknown>;
      try {
        load = dependencies.loadWindow(window, buildDetachedConversationHash(conversationId));
      } catch (error) {
        if (timeout !== undefined) clearTimeout(timeout);
        throw error;
      }
      const ready = Promise.race([load.then(() => {}), closed, timedOut]).finally(() => {
        if (timeout !== undefined) clearTimeout(timeout);
      });
      readiness.set(window, ready);
      await ready;
    } catch (error) {
      readiness.delete(window);
      if (userCloseRequested) {
        // The user asked for this window to go away, so how the pending load
        // settled is irrelevant: an abort, a renderer that died with the window,
        // or the deadline are all cancellation, never a reportable failure.
        forgetWindow(conversationId, window);
        return window;
      }
      if (shown && !window.isDestroyed()) {
        // The window already painted and the user may be typing in it. A load
        // that is merely slow to settle (a hung subresource, a cold dev
        // compile) must never destroy visible work; report it and keep going.
        console.warn('[AionUi] Detached conversation window is still loading:', error);
        return window;
      }
      handleSetupFailure(error);
      throw error;
    }
    return window;
  };

  return {
    openConversation,
    focusConversation,
    isDetachedWindow: (window) => detachedWindows.has(window),
  };
};

let configuredRegistry: DetachedWindowRegistry | null = null;

export const setDetachedWindowRegistry = (registry: DetachedWindowRegistry): void => {
  configuredRegistry = registry;
};

export const getDetachedWindowRegistry = (): DetachedWindowRegistry => {
  if (!configuredRegistry) throw new Error('Detached window registry is not configured');
  return configuredRegistry;
};
