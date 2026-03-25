/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('mainWindowLifecycle', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    vi.doMock('@process/bridge/applicationBridge', () => ({
      setApplicationMainWindow: vi.fn(),
    }));

    vi.doMock('@process/utils/deepLink', () => ({
      setDeepLinkMainWindow: vi.fn(),
    }));

    vi.doMock('@process/utils/tray', () => ({
      setTrayMainWindow: vi.fn(),
    }));
  });

  it('should bind the same window to all main-window consumers', async () => {
    const window = {} as Electron.BrowserWindow;
    const { setApplicationMainWindow } = await import('@process/bridge/applicationBridge');
    const { setDeepLinkMainWindow } = await import('@process/utils/deepLink');
    const { setTrayMainWindow } = await import('@process/utils/tray');
    const { bindMainWindowReferences } = await import('@process/utils/mainWindowLifecycle');

    bindMainWindowReferences(window);

    expect(setTrayMainWindow).toHaveBeenCalledWith(window);
    expect(setDeepLinkMainWindow).toHaveBeenCalledWith(window);
    expect(setApplicationMainWindow).toHaveBeenCalledWith(window);
  });

  it('should show and focus the current main window instead of recreating it', async () => {
    const createWindow = vi.fn();
    const window = {
      isDestroyed: vi.fn(() => false),
      isMinimized: vi.fn(() => true),
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
    } as unknown as Electron.BrowserWindow;
    const { showOrCreateMainWindow } = await import('@process/utils/mainWindowLifecycle');

    showOrCreateMainWindow({ mainWindow: window, createWindow });

    expect(window.restore).toHaveBeenCalledOnce();
    expect(window.show).toHaveBeenCalledOnce();
    expect(window.focus).toHaveBeenCalledOnce();
    expect(createWindow).not.toHaveBeenCalled();
  });

  it('should recreate the main window when the cached window has been destroyed', async () => {
    const createWindow = vi.fn();
    const destroyedWindow = {
      isDestroyed: vi.fn(() => true),
      isMinimized: vi.fn(),
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
    } as unknown as Electron.BrowserWindow;
    const { showOrCreateMainWindow } = await import('@process/utils/mainWindowLifecycle');

    showOrCreateMainWindow({ mainWindow: destroyedWindow, createWindow });

    expect(createWindow).toHaveBeenCalledOnce();
    expect(destroyedWindow.restore).not.toHaveBeenCalled();
    expect(destroyedWindow.show).not.toHaveBeenCalled();
    expect(destroyedWindow.focus).not.toHaveBeenCalled();
  });
});
