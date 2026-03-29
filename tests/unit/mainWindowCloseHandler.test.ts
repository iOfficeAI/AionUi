/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';

/**
 * Tests for the main window close handler logic (src/index.ts).
 *
 * The close handler guards against calling .hide() on a destroyed BrowserWindow.
 * Reproduces Sentry ELECTRON-ET: TypeError: Object has been destroyed.
 */
describe('mainWindow close handler', () => {
  // Simulate the close handler from src/index.ts:343-348
  function simulateCloseHandler(
    mainWindow: { isDestroyed: () => boolean; hide: () => void },
    closeToTrayEnabled: boolean,
    isQuitting: boolean
  ): { defaultPrevented: boolean } {
    const event = { defaultPrevented: false, preventDefault: () => (event.defaultPrevented = true) };
    // Matches the guarded handler in src/index.ts
    if (mainWindow.isDestroyed()) return event;
    if (closeToTrayEnabled && !isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return event;
  }

  it('should hide window when close-to-tray is enabled and not quitting', () => {
    const mainWindow = { isDestroyed: vi.fn(() => false), hide: vi.fn() };
    const event = simulateCloseHandler(mainWindow, true, false);
    expect(event.defaultPrevented).toBe(true);
    expect(mainWindow.hide).toHaveBeenCalledOnce();
  });

  it('should not hide window when close-to-tray is disabled', () => {
    const mainWindow = { isDestroyed: vi.fn(() => false), hide: vi.fn() };
    const event = simulateCloseHandler(mainWindow, false, false);
    expect(event.defaultPrevented).toBe(false);
    expect(mainWindow.hide).not.toHaveBeenCalled();
  });

  it('should not hide window when app is quitting', () => {
    const mainWindow = { isDestroyed: vi.fn(() => false), hide: vi.fn() };
    const event = simulateCloseHandler(mainWindow, true, true);
    expect(event.defaultPrevented).toBe(false);
    expect(mainWindow.hide).not.toHaveBeenCalled();
  });

  it('should skip hide when window is already destroyed (Sentry ELECTRON-ET)', () => {
    const mainWindow = { isDestroyed: vi.fn(() => true), hide: vi.fn() };
    const event = simulateCloseHandler(mainWindow, true, false);
    expect(event.defaultPrevented).toBe(false);
    expect(mainWindow.hide).not.toHaveBeenCalled();
  });
});
