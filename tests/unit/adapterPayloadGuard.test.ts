/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for the IPC payload size guard in adapter/main.ts.
 * Covers the MAX_IPC_PAYLOAD_SIZE check and error notification path.
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

describe('adapter emit - payload size guard', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    await import('@/common/adapter/main');
  });

  it('should reject oversized payloads and send error notification', async () => {
    const { initMainAdapterWithWindow } = await import('@/common/adapter/main');
    const { broadcastToAll } = await import('@/common/adapter/registry');

    const win = createMockWindow(false, false);
    initMainAdapterWithWindow(win as any);

    // Create a string payload that exceeds 50MB
    const originalStringify = JSON.stringify;
    let serializedSize = 0;
    vi.spyOn(JSON, 'stringify').mockImplementation((...args: Parameters<typeof JSON.stringify>) => {
      const result = originalStringify(...args);
      if (args[0] && typeof args[0] === 'object' && 'name' in args[0] && args[0].name === 'oversized.event') {
        // Return a fake string whose length exceeds 50MB
        serializedSize = 60 * 1024 * 1024;
        return { length: serializedSize, toString: () => result } as any;
      }
      return result;
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    capturedEmit('oversized.event', { huge: true });

    // Should log error about oversized payload
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[adapter] Bridge event "oversized.event" too large')
    );

    // broadcastToAll should NOT be called — we return early
    expect(broadcastToAll).not.toHaveBeenCalled();

    // Window should receive the error notification payload
    expect(win.webContents.send).toHaveBeenCalledOnce();
    const sentPayload = JSON.parse(win.webContents.send.mock.calls[0][1]);
    expect(sentPayload.name).toBe('bridge:error');
    expect(sentPayload.data.reason).toBe('payload_too_large');
    expect(sentPayload.data.originalEvent).toBe('oversized.event');

    consoleSpy.mockRestore();
  });

  it('should skip error notification to destroyed windows on oversized payload', async () => {
    const { initMainAdapterWithWindow } = await import('@/common/adapter/main');

    const destroyedWin = createMockWindow(true, false);
    initMainAdapterWithWindow(destroyedWin as any);

    const originalStringify = JSON.stringify;
    vi.spyOn(JSON, 'stringify').mockImplementation((...args: Parameters<typeof JSON.stringify>) => {
      const result = originalStringify(...args);
      if (args[0] && typeof args[0] === 'object' && 'name' in args[0] && args[0].name === 'big.event') {
        return { length: 60 * 1024 * 1024, toString: () => result } as any;
      }
      return result;
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    capturedEmit('big.event', {});

    // Destroyed window should NOT receive the error notification
    expect(destroyedWin.webContents.send).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('should pass through normal-sized payloads unchanged', async () => {
    // Ensure JSON.stringify is restored (previous tests may have mocked it)
    vi.restoreAllMocks();
    vi.resetModules();
    await import('@/common/adapter/main');

    const { initMainAdapterWithWindow } = await import('@/common/adapter/main');
    const { broadcastToAll } = await import('@/common/adapter/registry');

    const win = createMockWindow(false, false);
    initMainAdapterWithWindow(win as any);

    capturedEmit('normal.event', { small: true });

    expect(win.webContents.send).toHaveBeenCalledOnce();
    expect(broadcastToAll).toHaveBeenCalledWith('normal.event', { small: true });
  });
});
