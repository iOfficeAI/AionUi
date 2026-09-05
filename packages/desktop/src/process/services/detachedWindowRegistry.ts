/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BrowserWindow } from 'electron';

import { buildDetachedConversationHash } from '@/common/platform/detachedWindow';
import type { WindowBounds } from '@process/utils/windowBounds';

const DETACHED_WINDOW_CASCADE_OFFSET = 24;

export type DetachedWindowRegistryDependencies = {
  createWindow: (bounds: WindowBounds) => BrowserWindow;
  loadWindow: (window: BrowserWindow, hash: string) => Promise<unknown>;
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
      await readiness.get(existing);
      revealWindow(existing);
      return existing;
    }
    if (existing) windows.delete(conversationId);

    const previousWindow = creationOrder.findLast((candidate) => !candidate.isDestroyed());
    const livePreviousBounds = previousWindow?.getBounds() ?? null;
    const window = dependencies.createWindow(cascadeBounds(dependencies.resolveBounds(), livePreviousBounds));
    windows.set(conversationId, window);
    detachedWindows.add(window);
    creationOrder.push(window);

    window.once('ready-to-show', () => revealWindow(window));
    window.once('closed', () => {
      forgetWindow(conversationId, window);
    });

    const handleSetupFailure = (error: unknown): void => {
      console.error('[AionUi] Failed to load detached conversation window:', error);
      forgetWindow(conversationId, window);
      if (!window.isDestroyed()) window.destroy();
    };

    try {
      dependencies.prepareWindow(window);
      const ready = dependencies.loadWindow(window, buildDetachedConversationHash(conversationId)).then(() => {});
      readiness.set(window, ready);
      await ready;
    } catch (error) {
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
