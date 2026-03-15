/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const providerMock = vi.fn();
const removeHandlerMock = vi.fn();
const handleMock = vi.fn();
const fromWebContentsMock = vi.fn();
const getFocusedWindowMock = vi.fn();
const getAllWindowsMock = vi.fn();

vi.mock('@office-ai/platform', () => ({
  bridge: {
    buildProvider: vi.fn(() => ({
      provider: providerMock,
      invoke: vi.fn(),
    })),
    buildEmitter: vi.fn(() => ({
      emit: vi.fn(),
      on: vi.fn(),
    })),
  },
}));

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: fromWebContentsMock,
    getFocusedWindow: getFocusedWindowMock,
    getAllWindows: getAllWindowsMock,
  },
  dialog: {
    showOpenDialog: vi.fn(),
  },
  ipcMain: {
    removeHandler: removeHandlerMock,
    handle: handleMock,
  },
}));

import { initDialogBridge, normalizeShowOpenOptions, resolveDialogParentWindow } from '@/process/bridge/dialogBridge';

describe('dialogBridge helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should preserve filters and trim empty defaultPath', () => {
    const options = normalizeShowOpenOptions({
      defaultPath: '   ',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png'] }],
    });

    expect(options).toEqual({
      defaultPath: undefined,
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png'] }],
    });
  });

  it('should prefer sender window over focused fallback', () => {
    const senderWindow = { isDestroyed: () => false };
    fromWebContentsMock.mockReturnValue(senderWindow);

    const result = resolveDialogParentWindow({} as never);

    expect(result).toBe(senderWindow);
    expect(fromWebContentsMock).toHaveBeenCalledTimes(1);
    expect(getFocusedWindowMock).not.toHaveBeenCalled();
  });

  it('should fall back to first alive window when sender and focused window are unavailable', () => {
    fromWebContentsMock.mockReturnValue(null);
    getFocusedWindowMock.mockReturnValue(null);
    const aliveWindow = { isDestroyed: () => false };
    getAllWindowsMock.mockReturnValue([{ isDestroyed: () => true }, aliveWindow]);

    const result = resolveDialogParentWindow(null);

    expect(result).toBe(aliveWindow);
  });
});

describe('initDialogBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should register direct IPC handler for dialog open', () => {
    initDialogBridge();

    expect(providerMock).toHaveBeenCalledTimes(1);
    expect(removeHandlerMock).toHaveBeenCalledWith('dialog-direct-show-open');
    expect(handleMock).toHaveBeenCalledWith('dialog-direct-show-open', expect.any(Function));
  });
});
