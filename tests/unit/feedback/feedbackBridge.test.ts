/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Node-environment tests for feedbackBridge's IPC handlers.
 * Covers the new feedback:capture-screenshot handler (main-process side).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Table of handlers registered via ipcMain.handle during module import.
const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();

type FakeWebContents = {
  capturePage?: () => Promise<{ toPNG: () => Buffer }>;
};

type FakeWindow = {
  isDestroyed: () => boolean;
  webContents: FakeWebContents;
};

let currentWindow: FakeWindow | null = null;

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, ...args: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    },
  },
  app: {
    getPath: vi.fn(() => '/tmp/aionui-test-logs-nonexistent'),
    getVersion: vi.fn(() => '0.0.0'),
  },
  BrowserWindow: {
    fromWebContents: vi.fn(() => currentWindow),
  },
}));

beforeEach(async () => {
  handlers.clear();
  currentWindow = null;
  vi.resetModules();
  // Importing registers the ipcMain.handle callbacks into our map.
  await import('@/process/bridge/feedbackBridge');
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('feedbackBridge — capture-screenshot', () => {
  it('registers the feedback:capture-screenshot channel on import', () => {
    expect(handlers.has('feedback:capture-screenshot')).toBe(true);
  });

  it('returns png bytes and a timestamped filename on success', async () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x01, 0x02, 0x03]);
    currentWindow = {
      isDestroyed: () => false,
      webContents: {
        capturePage: vi.fn(async () => ({ toPNG: () => pngBytes })),
      },
    };

    const handler = handlers.get('feedback:capture-screenshot')!;
    const result = (await handler({ sender: {} })) as { filename: string; data: number[] } | null;

    expect(result).not.toBeNull();
    expect(result!.filename).toMatch(/^screenshot-.*\.png$/);
    expect(result!.data).toEqual(Array.from(pngBytes));
  });

  it('returns null when no owning BrowserWindow is resolved', async () => {
    currentWindow = null;
    const handler = handlers.get('feedback:capture-screenshot')!;
    const result = await handler({ sender: {} });
    expect(result).toBeNull();
  });

  it('returns null when the owning BrowserWindow is destroyed', async () => {
    currentWindow = {
      isDestroyed: () => true,
      webContents: {
        capturePage: vi.fn(),
      },
    };
    const handler = handlers.get('feedback:capture-screenshot')!;
    const result = await handler({ sender: {} });
    expect(result).toBeNull();
    expect(currentWindow.webContents.capturePage).not.toHaveBeenCalled();
  });

  it('returns null when capturePage yields an empty buffer', async () => {
    currentWindow = {
      isDestroyed: () => false,
      webContents: {
        capturePage: vi.fn(async () => ({ toPNG: () => Buffer.alloc(0) })),
      },
    };

    const handler = handlers.get('feedback:capture-screenshot')!;
    const result = await handler({ sender: {} });
    expect(result).toBeNull();
  });

  it('returns null and does not throw when capturePage rejects', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    currentWindow = {
      isDestroyed: () => false,
      webContents: {
        capturePage: vi.fn(async () => {
          throw new Error('capture refused');
        }),
      },
    };

    const handler = handlers.get('feedback:capture-screenshot')!;
    const result = await handler({ sender: {} });
    expect(result).toBeNull();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
