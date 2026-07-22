/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const electronMocks = vi.hoisted(() => ({
  getAllWindows: vi.fn(() => []),
}));

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: electronMocks.getAllWindows },
}));

import { initializeZoomFactor, setupZoomForWindow } from '@/process/utils/zoom';

describe('window zoom lifecycle', () => {
  beforeEach(() => {
    initializeZoomFactor(1.05);
    vi.clearAllMocks();
  });

  it('restores the current factor after main-frame SPA navigation and disposes its listeners', () => {
    let renderedZoomFactor = 1;
    const webContents = Object.assign(new EventEmitter(), {
      setZoomFactor: vi.fn((factor: number) => {
        renderedZoomFactor = factor;
      }),
    });
    const dispose = setupZoomForWindow({ webContents } as never);

    expect(renderedZoomFactor).toBe(1.05);
    webContents.setZoomFactor.mockClear();

    renderedZoomFactor = 1;
    webContents.emit('did-navigate-in-page', {}, 'file:///index.html#/settings/agent', true);

    expect(renderedZoomFactor).toBe(1.05);
    expect(webContents.setZoomFactor).toHaveBeenCalledOnce();

    webContents.emit('did-navigate-in-page', {}, 'file:///embedded-frame.html#section', false);
    expect(webContents.setZoomFactor).toHaveBeenCalledOnce();

    dispose();
    renderedZoomFactor = 1;
    webContents.emit('did-navigate-in-page', {}, 'file:///index.html#/conversation/1', true);

    expect(renderedZoomFactor).toBe(1);
    expect(webContents.listenerCount('before-input-event')).toBe(0);
    expect(webContents.listenerCount('did-navigate-in-page')).toBe(0);
  });
});
