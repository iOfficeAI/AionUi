/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mocks ---

const { mockBrowserWindow, mockStartLogin } = vi.hoisted(() => {
  const mockWebContents = {
    executeJavaScript: vi.fn(),
    on: vi.fn(),
    send: vi.fn(),
  };

  const mockBrowserWindow = {
    instance: {
      webContents: mockWebContents,
      destroy: vi.fn(),
      isDestroyed: vi.fn(() => false),
      loadURL: vi.fn(() => Promise.resolve()),
    },
    constructorMock: vi.fn(),
  };

  const mockStartLogin = vi.fn();

  return { mockBrowserWindow, mockStartLogin };
});

vi.mock('electron', () => ({
  BrowserWindow: class {
    webContents = mockBrowserWindow.instance.webContents;
    destroy = mockBrowserWindow.instance.destroy;
    isDestroyed = mockBrowserWindow.instance.isDestroyed;
    loadURL = mockBrowserWindow.instance.loadURL;
    constructor(...args: any[]) {
      mockBrowserWindow.constructorMock(...args);
    }
  },
}));

vi.mock('@process/channels/plugins/weixin/WeixinLogin', () => ({
  startLogin: mockStartLogin,
}));

import { WeixinLoginHandler } from '@process/channels/plugins/weixin/WeixinLoginHandler';

describe('WeixinLoginHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('renderQRPage — timeout cleanup', () => {
    it('clears poll interval on timeout so destroyed window is not accessed', async () => {
      // Simulate executeJavaScript always returning null (no canvas found)
      mockBrowserWindow.instance.webContents.executeJavaScript.mockResolvedValue(null);

      const getWindow = vi.fn(() => null);
      const handler = new WeixinLoginHandler(getWindow);

      // Capture the onQR callback when startLogin is called
      let onQR!: (pageUrl: string) => void;
      mockStartLogin.mockImplementation((callbacks: any) => {
        onQR = callbacks.onQR;
        return { abort: vi.fn() };
      });

      // Start login to trigger renderQRPage via onQR
      void handler.startLogin();
      expect(onQR).toBeDefined();

      // Trigger QR rendering
      onQR('https://example.com/qr');

      // Let a few poll ticks fire (300ms interval)
      await vi.advanceTimersByTimeAsync(900);
      const callsBefore = mockBrowserWindow.instance.webContents.executeJavaScript.mock.calls.length;
      expect(callsBefore).toBeGreaterThan(0);

      // Now simulate the window being destroyed after timeout
      mockBrowserWindow.instance.isDestroyed.mockReturnValue(true);

      // Advance past the 10s timeout
      await vi.advanceTimersByTimeAsync(10_000);

      // Verify destroy was called (by the timeout handler)
      expect(mockBrowserWindow.instance.destroy).toHaveBeenCalled();

      // After timeout, poll should stop — no more executeJavaScript calls
      const callsAtTimeout = mockBrowserWindow.instance.webContents.executeJavaScript.mock.calls.length;
      await vi.advanceTimersByTimeAsync(1000);
      const callsAfter = mockBrowserWindow.instance.webContents.executeJavaScript.mock.calls.length;

      expect(callsAfter).toBe(callsAtTimeout);
    });

    it('stops polling immediately when isDestroyed returns true', async () => {
      mockBrowserWindow.instance.webContents.executeJavaScript.mockResolvedValue(null);

      const getWindow = vi.fn(() => null);
      const handler = new WeixinLoginHandler(getWindow);

      let onQR!: (pageUrl: string) => void;
      mockStartLogin.mockImplementation((callbacks: any) => {
        onQR = callbacks.onQR;
        return { abort: vi.fn() };
      });

      void handler.startLogin();
      onQR('https://example.com/qr');

      // Let a few polls fire
      await vi.advanceTimersByTimeAsync(600);
      const callsBefore = mockBrowserWindow.instance.webContents.executeJavaScript.mock.calls.length;

      // Mark window as destroyed (e.g., by external close)
      mockBrowserWindow.instance.isDestroyed.mockReturnValue(true);

      // Advance more time — poll should detect destroyed and stop
      await vi.advanceTimersByTimeAsync(600);
      const callsAfter = mockBrowserWindow.instance.webContents.executeJavaScript.mock.calls.length;

      // No new calls since the window was marked as destroyed
      expect(callsAfter).toBe(callsBefore);
    });
  });
});
