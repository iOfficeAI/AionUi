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
});
