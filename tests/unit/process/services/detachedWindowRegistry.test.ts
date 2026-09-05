/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BrowserWindow, Rectangle } from 'electron';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDetachedWindowRegistry } from '@/process/services/detachedWindowRegistry';

type WindowEvent = 'close' | 'closed' | 'ready-to-show';

const makeWindow = (bounds: Rectangle) => {
  const listeners = new Map<WindowEvent, Array<() => void>>();
  let destroyed = false;
  let minimized = false;
  const win = {
    focus: vi.fn(),
    show: vi.fn(),
    restore: vi.fn(() => {
      minimized = false;
    }),
    isDestroyed: vi.fn(() => destroyed),
    isMinimized: vi.fn(() => minimized),
    getBounds: vi.fn(() => bounds),
    destroy: vi.fn(() => {
      destroyed = true;
      for (const listener of listeners.get('closed') ?? []) listener();
    }),
    once: vi.fn((event: WindowEvent, listener: () => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      return win;
    }),
  };

  return {
    win: win as unknown as BrowserWindow,
    emit(event: WindowEvent) {
      if (event === 'closed') destroyed = true;
      for (const listener of listeners.get(event) ?? []) listener();
    },
    setMinimized(value: boolean) {
      minimized = value;
    },
  };
};

describe('detached window registry', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('focuses an existing conversation window and removes it after close', async () => {
    const first = makeWindow({ x: 100, y: 120, width: 900, height: 700 });
    const second = makeWindow({ x: 124, y: 144, width: 900, height: 700 });
    const createWindow = vi.fn().mockReturnValueOnce(first.win).mockReturnValueOnce(second.win);
    const loadWindow = vi.fn(() => Promise.resolve());
    const prepareWindow = vi.fn();
    const registry = createDetachedWindowRegistry({
      createWindow,
      loadWindow,
      prepareWindow,
      resolveBounds: () => ({ x: 100, y: 120, width: 900, height: 700 }),
    });

    await expect(registry.openConversation('conversation-1')).resolves.toBe(first.win);
    first.emit('ready-to-show');
    first.setMinimized(true);
    await expect(registry.openConversation('conversation-1')).resolves.toBe(first.win);

    expect(createWindow).toHaveBeenCalledTimes(1);
    expect(first.win.restore).toHaveBeenCalledOnce();
    expect(first.win.focus).toHaveBeenCalledTimes(2);
    expect(prepareWindow).toHaveBeenCalledWith(first.win);
    expect(loadWindow).toHaveBeenCalledWith(first.win, '#/conversation/conversation-1?window=detached');

    first.emit('closed');
    expect(registry.focusConversation('conversation-1')).toBe(false);
    await expect(registry.openConversation('conversation-1')).resolves.toBe(second.win);
    expect(createWindow).toHaveBeenCalledTimes(2);
  });

  it('cascades each new conversation from the last created window', async () => {
    const first = makeWindow({ x: 240, y: 180, width: 800, height: 720 });
    const second = makeWindow({ x: 264, y: 204, width: 800, height: 720 });
    const createWindow = vi.fn().mockReturnValueOnce(first.win).mockReturnValueOnce(second.win);
    const registry = createDetachedWindowRegistry({
      createWindow,
      loadWindow: () => Promise.resolve(),
      prepareWindow: () => {},
      resolveBounds: () => ({ x: 240, y: 180, width: 800, height: 720 }),
    });

    await registry.openConversation('conversation-1');
    await registry.openConversation('conversation-2');

    expect(createWindow).toHaveBeenNthCalledWith(1, { x: 240, y: 180, width: 800, height: 720 });
    expect(createWindow).toHaveBeenNthCalledWith(2, { x: 264, y: 204, width: 800, height: 720 });
  });

  it('cascades from the newest live window and resets after all windows close', async () => {
    const first = makeWindow({ x: 240, y: 180, width: 800, height: 720 });
    const second = makeWindow({ x: 264, y: 204, width: 800, height: 720 });
    const third = makeWindow({ x: 264, y: 204, width: 800, height: 720 });
    const fourth = makeWindow({ x: 240, y: 180, width: 800, height: 720 });
    const createWindow = vi
      .fn()
      .mockReturnValueOnce(first.win)
      .mockReturnValueOnce(second.win)
      .mockReturnValueOnce(third.win)
      .mockReturnValueOnce(fourth.win);
    const registry = createDetachedWindowRegistry({
      createWindow,
      loadWindow: () => Promise.resolve(),
      prepareWindow: () => {},
      resolveBounds: () => ({ x: 240, y: 180, width: 800, height: 720 }),
    });

    await registry.openConversation('conversation-1');
    await registry.openConversation('conversation-2');
    second.emit('closed');
    await registry.openConversation('conversation-3');
    first.emit('closed');
    third.emit('closed');
    await registry.openConversation('conversation-4');

    expect(createWindow).toHaveBeenNthCalledWith(3, { x: 264, y: 204, width: 800, height: 720 });
    expect(createWindow).toHaveBeenNthCalledWith(4, { x: 240, y: 180, width: 800, height: 720 });
  });

  it('destroys and unregisters a window whose renderer fails to load', async () => {
    const failedWindow = makeWindow({ x: 0, y: 0, width: 800, height: 720 });
    const replacementWindow = makeWindow({ x: 0, y: 0, width: 800, height: 720 });
    const error = new Error('renderer unavailable');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const loadWindow = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(undefined);
    const registry = createDetachedWindowRegistry({
      createWindow: vi.fn().mockReturnValueOnce(failedWindow.win).mockReturnValueOnce(replacementWindow.win),
      loadWindow,
      prepareWindow: () => {},
      resolveBounds: () => ({ width: 800, height: 720 }),
    });

    await expect(registry.openConversation('conversation-1')).rejects.toBe(error);

    expect(errorSpy).toHaveBeenCalledWith('[AionUi] Failed to load detached conversation window:', error);
    expect(failedWindow.win.destroy).toHaveBeenCalledOnce();
    expect(registry.focusConversation('conversation-1')).toBe(false);
    await expect(registry.openConversation('conversation-1')).resolves.toBe(replacementWindow.win);
  });

  it('destroys and unregisters a window when synchronous preparation fails', async () => {
    const failedWindow = makeWindow({ x: 0, y: 0, width: 800, height: 720 });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('adapter setup failed');
    const registry = createDetachedWindowRegistry({
      createWindow: () => failedWindow.win,
      loadWindow: () => Promise.resolve(),
      prepareWindow: () => {
        throw error;
      },
      resolveBounds: () => ({ width: 800, height: 720 }),
    });

    await expect(registry.openConversation('conversation-1')).rejects.toBe(error);

    expect(errorSpy).toHaveBeenCalledWith('[AionUi] Failed to load detached conversation window:', error);
    expect(failedWindow.win.destroy).toHaveBeenCalledOnce();
    expect(registry.focusConversation('conversation-1')).toBe(false);
  });

  it('shares a pending load failure with repeated open requests', async () => {
    const pendingWindow = makeWindow({ x: 0, y: 0, width: 800, height: 720 });
    const error = new Error('renderer unavailable');
    let rejectLoad: ((reason: Error) => void) | undefined;
    const loadWindow = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectLoad = reject;
        })
    );
    const registry = createDetachedWindowRegistry({
      createWindow: () => pendingWindow.win,
      loadWindow,
      prepareWindow: () => {},
      resolveBounds: () => ({ width: 800, height: 720 }),
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const firstOpen = registry.openConversation('conversation-1');
    const repeatedOpen = registry.openConversation('conversation-1');
    rejectLoad?.(error);

    await expect(firstOpen).rejects.toBe(error);
    await expect(repeatedOpen).rejects.toBe(error);
    expect(loadWindow).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalledOnce();
  });

  it('reveals an existing window while its initial renderer load is still pending', async () => {
    const pendingWindow = makeWindow({ x: 0, y: 0, width: 800, height: 720 });
    let resolveLoad: (() => void) | undefined;
    const registry = createDetachedWindowRegistry({
      createWindow: () => pendingWindow.win,
      loadWindow: () =>
        new Promise<void>((resolve) => {
          resolveLoad = resolve;
        }),
      prepareWindow: () => {},
      resolveBounds: () => ({ width: 800, height: 720 }),
    });

    const initialOpen = registry.openConversation('conversation-1');
    const repeatedOpen = registry.openConversation('conversation-1');

    expect(pendingWindow.win.show).toHaveBeenCalledOnce();
    expect(pendingWindow.win.focus).toHaveBeenCalledOnce();
    resolveLoad?.();
    await expect(Promise.all([initialOpen, repeatedOpen])).resolves.toEqual([pendingWindow.win, pendingWindow.win]);
  });

  it('fails a renderer load that exceeds the bounded readiness deadline', async () => {
    vi.useFakeTimers();
    const pendingWindow = makeWindow({ x: 0, y: 0, width: 800, height: 720 });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const registry = createDetachedWindowRegistry({
      createWindow: () => pendingWindow.win,
      loadWindow: () => new Promise<void>(() => {}),
      loadTimeoutMs: 10,
      prepareWindow: () => {},
      resolveBounds: () => ({ width: 800, height: 720 }),
    });

    const openExpectation = expect(registry.openConversation('conversation-1')).rejects.toThrow(
      'Detached conversation window timed out while loading'
    );
    await vi.advanceTimersByTimeAsync(10);

    await openExpectation;
    expect(pendingWindow.win.destroy).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('keeps a visible window alive when its load exceeds the readiness deadline', async () => {
    vi.useFakeTimers();
    const shownWindow = makeWindow({ x: 0, y: 0, width: 800, height: 720 });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const registry = createDetachedWindowRegistry({
      createWindow: () => shownWindow.win,
      loadWindow: () => new Promise<void>(() => {}),
      loadTimeoutMs: 10,
      prepareWindow: () => {},
      resolveBounds: () => ({ width: 800, height: 720 }),
    });

    const open = registry.openConversation('conversation-1');
    shownWindow.emit('ready-to-show');
    await vi.advanceTimersByTimeAsync(10);

    await expect(open).resolves.toBe(shownWindow.win);
    expect(shownWindow.win.destroy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledOnce();
    // The soft failure must not poison later requests for the same conversation.
    await expect(registry.openConversation('conversation-1')).resolves.toBe(shownWindow.win);
    vi.useRealTimers();
  });

  it('treats any load rejection during a user close as cancellation', async () => {
    const closingWindow = makeWindow({ x: 0, y: 0, width: 800, height: 720 });
    const replacementWindow = makeWindow({ x: 0, y: 0, width: 800, height: 720 });
    let rejectLoad: ((reason: Error) => void) | undefined;
    const createWindow = vi.fn().mockReturnValueOnce(closingWindow.win).mockReturnValueOnce(replacementWindow.win);
    const registry = createDetachedWindowRegistry({
      createWindow,
      loadWindow: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<void>((_resolve, reject) => {
              rejectLoad = reject;
            })
        )
        .mockResolvedValueOnce(undefined),
      prepareWindow: () => {},
      resolveBounds: () => ({ width: 800, height: 720 }),
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const open = registry.openConversation('conversation-1');

    closingWindow.emit('close');
    rejectLoad?.(Object.assign(new Error('ERR_CONNECTION_REFUSED'), { code: -102 }));

    await expect(open).resolves.toBe(closingWindow.win);
    expect(errorSpy).not.toHaveBeenCalled();
    // Even when the close never completes, the cancelled entry must not block a
    // fresh pop-out of the same conversation.
    await expect(registry.openConversation('conversation-1')).resolves.toBe(replacementWindow.win);
    expect(createWindow).toHaveBeenCalledTimes(2);
  });

  it('clears the readiness deadline when loading throws synchronously', async () => {
    vi.useFakeTimers();
    const failedWindow = makeWindow({ x: 0, y: 0, width: 800, height: 720 });
    const error = new Error('invalid renderer URL');
    const registry = createDetachedWindowRegistry({
      createWindow: () => failedWindow.win,
      loadWindow: () => {
        throw error;
      },
      prepareWindow: () => {},
      resolveBounds: () => ({ width: 800, height: 720 }),
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(registry.openConversation('conversation-1')).rejects.toBe(error);

    expect(vi.getTimerCount()).toBe(0);
  });

  it('treats a user closing the window during load as cancellation instead of failure', async () => {
    const closingWindow = makeWindow({ x: 0, y: 0, width: 800, height: 720 });
    let rejectLoad: ((reason: Error & { code: number }) => void) | undefined;
    const registry = createDetachedWindowRegistry({
      createWindow: () => closingWindow.win,
      loadWindow: () =>
        new Promise<void>((_resolve, reject) => {
          rejectLoad = reject;
        }),
      prepareWindow: () => {},
      resolveBounds: () => ({ width: 800, height: 720 }),
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const open = registry.openConversation('conversation-1');
    const abortedError = Object.assign(new Error('ERR_ABORTED'), { code: -3 });

    closingWindow.emit('close');
    rejectLoad?.(abortedError);

    await expect(open).resolves.toBe(closingWindow.win);
    closingWindow.emit('closed');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('reports an unexpected destroyed window as a load failure', async () => {
    const failedWindow = makeWindow({ x: 0, y: 0, width: 800, height: 720 });
    const registry = createDetachedWindowRegistry({
      createWindow: () => failedWindow.win,
      loadWindow: () => new Promise<void>(() => {}),
      prepareWindow: () => {},
      resolveBounds: () => ({ width: 800, height: 720 }),
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const open = registry.openConversation('conversation-1');

    failedWindow.emit('closed');

    await expect(open).rejects.toThrow('Detached conversation window closed before loading');
  });
});
