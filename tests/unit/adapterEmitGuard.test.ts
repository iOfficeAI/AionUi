/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture the emit function from bridge.adapter() call
let capturedEmit: (name: string, data: unknown) => void;

vi.mock('@office-ai/platform', () => ({
  bridge: {
    adapter: vi.fn(({ emit, on }: { emit: typeof capturedEmit; on: (emitter: unknown) => void }) => {
      capturedEmit = emit;
      const fakeEmitter = { emit: vi.fn() };
      on(fakeEmitter);
    }),
  },
}));

vi.mock('@/common/adapter/registry', () => ({
  broadcastToAll: vi.fn(),
  setBridgeEmitter: vi.fn(),
  getBridgeEmitter: vi.fn(),
  registerWebSocketBroadcaster: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}));

// Helper to create a mock BrowserWindow
function createMockWindow(destroyed = false, webContentsDestroyed = false) {
  return {
    isDestroyed: vi.fn(() => destroyed),
    webContents: {
      isDestroyed: vi.fn(() => webContentsDestroyed),
      send: vi.fn(),
    },
    on: vi.fn(),
  };
}

describe('adapter emit - isDestroyed guard', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    // Re-import to re-run the bridge.adapter() setup
    await import('@/common/adapter/main');
  });

  it('should send to healthy windows', async () => {
    const { initMainAdapterWithWindow } = await import('@/common/adapter/main');
    const win = createMockWindow(false, false);
    initMainAdapterWithWindow(win as any);

    capturedEmit('test.event', { foo: 'bar' });

    expect(win.webContents.send).toHaveBeenCalledOnce();
  });

  it('should skip destroyed windows and remove them from list', async () => {
    const { initMainAdapterWithWindow } = await import('@/common/adapter/main');

    const destroyedWin = createMockWindow(true, false);
    const healthyWin = createMockWindow(false, false);
    initMainAdapterWithWindow(destroyedWin as any);
    initMainAdapterWithWindow(healthyWin as any);

    capturedEmit('test.event', { data: 1 });

    // Destroyed window should NOT receive the message
    expect(destroyedWin.webContents.send).not.toHaveBeenCalled();
    // Healthy window should receive it
    expect(healthyWin.webContents.send).toHaveBeenCalledOnce();
  });

  it('should skip windows with destroyed webContents', async () => {
    const { initMainAdapterWithWindow } = await import('@/common/adapter/main');

    const badWin = createMockWindow(false, true); // window alive, webContents dead
    initMainAdapterWithWindow(badWin as any);

    capturedEmit('test.event', { data: 1 });

    expect(badWin.webContents.send).not.toHaveBeenCalled();
  });

  it('should handle all windows destroyed gracefully', async () => {
    const { initMainAdapterWithWindow } = await import('@/common/adapter/main');

    const win1 = createMockWindow(true, false);
    const win2 = createMockWindow(true, false);
    initMainAdapterWithWindow(win1 as any);
    initMainAdapterWithWindow(win2 as any);

    // Should not throw
    expect(() => capturedEmit('test.event', {})).not.toThrow();
  });

  it('should not throw when data is too large to serialize (ELECTRON-D9)', async () => {
    const { initMainAdapterWithWindow } = await import('@/common/adapter/main');
    const { broadcastToAll } = await import('@/common/adapter/registry');

    const win = createMockWindow(false, false);
    initMainAdapterWithWindow(win as any);

    // Create an object that causes JSON.stringify to throw RangeError
    const circularFreeHugeData = { payload: '' };
    const originalStringify = JSON.stringify;
    vi.spyOn(JSON, 'stringify').mockImplementation((...args: Parameters<typeof JSON.stringify>) => {
      // Only throw for our oversized data, not for other calls
      if (args[0] && typeof args[0] === 'object' && 'name' in args[0] && args[0].name === 'huge.event') {
        throw new RangeError('Invalid string length');
      }
      return originalStringify(...args);
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Should not throw — the error is caught internally
    expect(() => capturedEmit('huge.event', circularFreeHugeData)).not.toThrow();

    // Window should NOT receive the message since serialization failed
    expect(win.webContents.send).not.toHaveBeenCalled();
    // broadcastToAll should NOT be called since we return early
    expect(broadcastToAll).not.toHaveBeenCalled();
    // Error should be logged
    expect(consoleSpy).toHaveBeenCalledWith(
      '[adapter] Failed to serialize bridge event:',
      'huge.event',
      expect.any(RangeError)
    );

    consoleSpy.mockRestore();
  });
});
