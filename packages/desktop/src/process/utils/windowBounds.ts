/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Window bounds persistence: restore the last-known size and position when a
 * window re-opens, and write back the user's adjustments as they resize or
 * move it.
 *
 * Bounds are kept per window kind. The main window uses `'main'` and the config
 * key it always has; a second kind (a detached conversation window, say) keeps
 * its own cache entry and supplies its own `persist`, so two windows cannot
 * overwrite each other's remembered geometry.
 *
 * Mirrors the shape of process/utils/zoom.ts so there is one
 * load-at-startup + attach-per-window pattern per persisted window property.
 */

import { screen } from 'electron';
import type { BrowserWindow } from 'electron';
import { trackPersistedWrite } from './persistOnQuit';

export type WindowBounds = {
  x?: number;
  y?: number;
  width: number;
  height: number;
};

export const MIN_WINDOW_WIDTH = 400;
export const MIN_WINDOW_HEIGHT = 600;

// Default window fills 80% of the primary display horizontally and 95%
// vertically. The tall aspect ratio favors chat / long-form content and
// avoids the cramped strip shape that a square would have on ultrawide
// monitors.
const DEFAULT_WIDTH_RATIO = 0.8;
const DEFAULT_HEIGHT_RATIO = 0.95;

// Disk writes are debounced so dragging the window doesn't trigger dozens
// of ProcessConfig.set calls per second.
const PERSIST_DEBOUNCE_MS = 300;

/**
 * Identifies which window's bounds are being read or written. The main window
 * keeps the historic value so nothing changes for existing users.
 */
export type WindowBoundsKind = string;

export const MAIN_WINDOW_BOUNDS_KIND: WindowBoundsKind = 'main';

const cachedBoundsByKind = new Map<WindowBoundsKind, WindowBounds | undefined>();

/** Load persisted bounds once at startup. Safe to call even if config is empty. */
export const loadSavedWindowBounds = (
  saved: WindowBounds | undefined,
  kind: WindowBoundsKind = MAIN_WINDOW_BOUNDS_KIND
): void => {
  cachedBoundsByKind.set(kind, saved);
};

/** Compute the bounds to apply to a new BrowserWindow of this kind. */
export const resolveInitialBounds = (kind: WindowBoundsKind = MAIN_WINDOW_BOUNDS_KIND): WindowBounds => {
  const primary = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primary.workAreaSize;
  const defaults: WindowBounds = {
    width: Math.floor(screenWidth * DEFAULT_WIDTH_RATIO),
    height: Math.floor(screenHeight * DEFAULT_HEIGHT_RATIO),
  };

  const cachedBounds = cachedBoundsByKind.get(kind);
  if (!cachedBounds) return defaults;
  if (cachedBounds.width < MIN_WINDOW_WIDTH || cachedBounds.height < MIN_WINDOW_HEIGHT) return defaults;
  if (!boundsOverlapAnyDisplay(cachedBounds)) return defaults;
  return cachedBounds;
};

/**
 * Returns true if at least part of the rectangle overlaps a currently-connected
 * display, ensuring the window is reachable for the user. More permissive than
 * requiring full containment (windows legitimately straddle displays).
 */
const boundsOverlapAnyDisplay = (bounds: WindowBounds): boolean => {
  if (bounds.x === undefined || bounds.y === undefined) return true;
  const x1 = bounds.x;
  const y1 = bounds.y;
  const x2 = bounds.x + bounds.width;
  const y2 = bounds.y + bounds.height;
  return screen.getAllDisplays().some((d) => {
    const wa = d.workArea;
    const ox1 = wa.x;
    const oy1 = wa.y;
    const ox2 = wa.x + wa.width;
    const oy2 = wa.y + wa.height;
    return x1 < ox2 && x2 > ox1 && y1 < oy2 && y2 > oy1;
  });
};

/**
 * Wire up resize/move/close listeners on a window so its size and position
 * round-trip through ProcessConfig. Skips persisting while the window is
 * maximized, fullscreen, or minimized — those are transient states whose
 * bounds would misrepresent the user's preferred "normal" size.
 *
 * Each write is registered with persistOnQuit so a resize immediately
 * followed by ⌘Q still flushes to disk before the app exits — otherwise the
 * window would reset to the default size on next launch.
 *
 * `persist` owns the storage key and `kind` owns the in-memory cache entry;
 * both must be unique per window kind.
 */
export const attachWindowBoundsPersistence = (
  win: BrowserWindow,
  persist: (bounds: WindowBounds) => void | Promise<unknown>,
  kind: WindowBoundsKind = MAIN_WINDOW_BOUNDS_KIND
): void => {
  let saveTimer: NodeJS.Timeout | null = null;

  const fireWrite = (bounds: WindowBounds): void => {
    // Update the in-memory cache synchronously so a subsequent
    // resolveInitialBounds() (e.g. user closes the window then reopens it
    // without quitting the app) sees the latest bounds rather than the
    // boot-time snapshot. Scoped to this window kind so another window's
    // resize cannot move it.
    cachedBoundsByKind.set(kind, bounds);
    const op = Promise.resolve(persist(bounds)).catch((error) => {
      console.error('[AionUi] Failed to persist window bounds:', error);
    });
    trackPersistedWrite(op);
  };

  const saveNow = (): void => {
    if (win.isDestroyed()) return;
    if (win.isMaximized() || win.isFullScreen() || win.isMinimized()) return;
    fireWrite(win.getNormalBounds());
  };

  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, PERSIST_DEBOUNCE_MS);
  };

  win.on('resize', scheduleSave);
  win.on('move', scheduleSave);
  win.on('close', () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    saveNow();
  });
};
