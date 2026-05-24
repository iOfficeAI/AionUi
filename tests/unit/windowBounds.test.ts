/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for process/utils/windowBounds — covers the "should I use saved
 * bounds or fall back to defaults?" decision tree and the debounce/suppression
 * behavior of attachWindowBoundsPersistence.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type DisplayStub = {
  workArea: { x: number; y: number; width: number; height: number };
  workAreaSize: { width: number; height: number };
};
const displays: DisplayStub[] = [];
let primaryDisplay: DisplayStub = {
  workArea: { x: 0, y: 0, width: 1920, height: 1080 },
  workAreaSize: { width: 1920, height: 1080 },
};

vi.mock('electron', () => ({
  app: { on: vi.fn() },
  screen: {
    getPrimaryDisplay: () => primaryDisplay,
    getAllDisplays: () => displays,
  },
}));

import {
  MIN_WINDOW_WIDTH,
  MIN_WINDOW_HEIGHT,
  attachWindowBoundsPersistence,
  loadSavedWindowBounds,
  resolveInitialBounds,
} from '@/process/utils/windowBounds';

const setDisplays = (list: DisplayStub[]) => {
  displays.length = 0;
  displays.push(...list);
  primaryDisplay = list[0];
};

describe('resolveInitialBounds', () => {
  beforeEach(() => {
    loadSavedWindowBounds(undefined);
    setDisplays([
      {
        workArea: { x: 0, y: 0, width: 1920, height: 1080 },
        workAreaSize: { width: 1920, height: 1080 },
      },
    ]);
  });

  it('returns proportion-of-screen defaults when no saved bounds exist', () => {
    const bounds = resolveInitialBounds();
    expect(bounds.width).toBe(Math.floor(1920 * 0.8));
    expect(bounds.height).toBe(Math.floor(1080 * 0.95));
    expect(bounds.x).toBeUndefined();
    expect(bounds.y).toBeUndefined();
  });

  it('uses saved bounds when they fit on a connected display', () => {
    loadSavedWindowBounds({ x: 100, y: 100, width: 1200, height: 800 });
    const bounds = resolveInitialBounds();
    expect(bounds).toEqual({ x: 100, y: 100, width: 1200, height: 800 });
  });

  it('falls back to defaults when saved width is below the minimum', () => {
    loadSavedWindowBounds({ x: 0, y: 0, width: MIN_WINDOW_WIDTH - 1, height: 800 });
    const bounds = resolveInitialBounds();
    expect(bounds.width).toBe(Math.floor(1920 * 0.8));
    expect(bounds.x).toBeUndefined();
  });

  it('falls back to defaults when saved height is below the minimum', () => {
    loadSavedWindowBounds({ x: 0, y: 0, width: 1200, height: MIN_WINDOW_HEIGHT - 1 });
    const bounds = resolveInitialBounds();
    expect(bounds.height).toBe(Math.floor(1080 * 0.95));
  });

  it('falls back to defaults when saved position is entirely off all displays', () => {
    setDisplays([
      {
        workArea: { x: 0, y: 0, width: 1920, height: 1080 },
        workAreaSize: { width: 1920, height: 1080 },
      },
    ]);
    loadSavedWindowBounds({ x: 5000, y: 5000, width: 1200, height: 800 });
    const bounds = resolveInitialBounds();
    // off-screen → defaults (no x/y)
    expect(bounds.x).toBeUndefined();
  });

  it('accepts saved bounds that partially overlap a connected display', () => {
    setDisplays([
      {
        workArea: { x: 0, y: 0, width: 1920, height: 1080 },
        workAreaSize: { width: 1920, height: 1080 },
      },
    ]);
    // Window straddles right edge of the display — still reachable.
    loadSavedWindowBounds({ x: 1800, y: 100, width: 1200, height: 800 });
    const bounds = resolveInitialBounds();
    expect(bounds).toEqual({ x: 1800, y: 100, width: 1200, height: 800 });
  });

  it('accepts saved bounds that overlap a secondary display', () => {
    setDisplays([
      {
        workArea: { x: 0, y: 0, width: 1920, height: 1080 },
        workAreaSize: { width: 1920, height: 1080 },
      },
      {
        workArea: { x: 1920, y: 0, width: 2560, height: 1440 },
        workAreaSize: { width: 2560, height: 1440 },
      },
    ]);
    loadSavedWindowBounds({ x: 3000, y: 200, width: 1200, height: 800 });
    const bounds = resolveInitialBounds();
    expect(bounds).toEqual({ x: 3000, y: 200, width: 1200, height: 800 });
  });

  it('keeps saved size-only (no x/y) and does not reject for missing position', () => {
    loadSavedWindowBounds({ width: 1000, height: 700 });
    const bounds = resolveInitialBounds();
    expect(bounds.width).toBe(1000);
    expect(bounds.height).toBe(700);
    expect(bounds.x).toBeUndefined();
    expect(bounds.y).toBeUndefined();
  });

  it('reflects bounds written by attachWindowBoundsPersistence in the same session', async () => {
    vi.useFakeTimers();
    try {
      loadSavedWindowBounds({ x: 0, y: 0, width: 800, height: 600 });
      const handlers: Record<string, Array<() => void>> = {};
      const win = {
        isDestroyed: () => false,
        isMaximized: () => false,
        isFullScreen: () => false,
        isMinimized: () => false,
        getNormalBounds: () => ({ x: 100, y: 100, width: 1400, height: 900 }),
        on: (event: string, fn: () => void) => {
          (handlers[event] ??= []).push(fn);
        },
      };
      const fire = (event: string) => {
        for (const fn of handlers[event] ?? []) fn();
      };

      const { attachWindowBoundsPersistence } = await import('@/process/utils/windowBounds');
      attachWindowBoundsPersistence(win as never, () => Promise.resolve());

      fire('resize');
      vi.advanceTimersByTime(300);

      // Reopening the window in the same session must observe the latest
      // bounds, not the boot-time snapshot.
      const bounds = resolveInitialBounds();
      expect(bounds).toEqual({ x: 100, y: 100, width: 1400, height: 900 });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('attachWindowBoundsPersistence', () => {
  type WinStub = {
    isDestroyed: () => boolean;
    isMaximized: () => boolean;
    isFullScreen: () => boolean;
    isMinimized: () => boolean;
    getNormalBounds: () => { x: number; y: number; width: number; height: number };
    on: (event: string, fn: () => void) => void;
    _fire: (event: string) => void;
  };

  const makeWin = (overrides: Partial<WinStub> = {}): WinStub => {
    const handlers: Record<string, Array<() => void>> = {};
    return {
      isDestroyed: () => false,
      isMaximized: () => false,
      isFullScreen: () => false,
      isMinimized: () => false,
      getNormalBounds: () => ({ x: 50, y: 60, width: 1000, height: 700 }),
      on: (event, fn) => {
        (handlers[event] ??= []).push(fn);
      },
      _fire: (event) => {
        for (const fn of handlers[event] ?? []) fn();
      },
      ...overrides,
    };
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces resize events and persists after the timeout', () => {
    const persist = vi.fn();
    const win = makeWin();
    attachWindowBoundsPersistence(win as never, persist);

    win._fire('resize');
    win._fire('resize');
    win._fire('resize');
    expect(persist).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith({ x: 50, y: 60, width: 1000, height: 700 });
  });

  it('flushes immediately on close, even without the debounce timeout', () => {
    const persist = vi.fn();
    const win = makeWin();
    attachWindowBoundsPersistence(win as never, persist);

    win._fire('resize');
    win._fire('close');
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('does not persist while maximized', () => {
    const persist = vi.fn();
    const win = makeWin({ isMaximized: () => true });
    attachWindowBoundsPersistence(win as never, persist);

    win._fire('resize');
    vi.advanceTimersByTime(300);
    expect(persist).not.toHaveBeenCalled();
  });

  it('does not persist while fullscreen', () => {
    const persist = vi.fn();
    const win = makeWin({ isFullScreen: () => true });
    attachWindowBoundsPersistence(win as never, persist);

    win._fire('resize');
    vi.advanceTimersByTime(300);
    expect(persist).not.toHaveBeenCalled();
  });

  it('does not persist while minimized', () => {
    const persist = vi.fn();
    const win = makeWin({ isMinimized: () => true });
    attachWindowBoundsPersistence(win as never, persist);

    win._fire('resize');
    vi.advanceTimersByTime(300);
    expect(persist).not.toHaveBeenCalled();
  });

  it('does not persist after the window is destroyed', () => {
    const persist = vi.fn();
    const win = makeWin({ isDestroyed: () => true });
    attachWindowBoundsPersistence(win as never, persist);

    win._fire('resize');
    vi.advanceTimersByTime(300);
    win._fire('close');
    expect(persist).not.toHaveBeenCalled();
  });

  it('swallows rejections from the persist callback without crashing', async () => {
    const persist = vi.fn(() => Promise.reject(new Error('disk full')));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const win = makeWin();
    attachWindowBoundsPersistence(win as never, persist);

    win._fire('resize');
    vi.advanceTimersByTime(300);
    await Promise.resolve();
    await Promise.resolve();
    expect(persist).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
