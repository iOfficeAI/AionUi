/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const electronMocks = vi.hoisted(() => ({
  getAllWindows: vi.fn(() => []),
}));

const bridgeMocks = vi.hoisted(() => ({
  openSettings: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { name: 'AionUi' },
  BrowserWindow: { getAllWindows: electronMocks.getAllWindows },
  Menu: {
    buildFromTemplate: vi.fn(() => ({})),
    setApplicationMenu: vi.fn(),
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    application: {
      openSettings: { emit: bridgeMocks.openSettings },
    },
    update: {
      open: { emit: vi.fn() },
    },
  },
}));

import { attachApplicationShortcutsToWindow, isOpenSettingsShortcut } from '@/process/utils/appMenu';
import { attachZoomShortcutsToWindow, getZoomFactor, initializeZoomFactor } from '@/process/utils/zoom';

type NativeInput = {
  type: 'keyDown' | 'keyUp';
  key: string;
  code: string;
  isAutoRepeat: boolean;
  isComposing: boolean;
  control: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
};

const createInput = (overrides: Partial<NativeInput> = {}): NativeInput => ({
  type: 'keyDown',
  key: ',',
  code: 'Comma',
  isAutoRepeat: false,
  isComposing: false,
  control: false,
  meta: false,
  alt: false,
  shift: false,
  ...overrides,
});

const createEvent = (alreadyPrevented = false) => {
  let defaultPrevented = alreadyPrevented;
  return {
    get defaultPrevented() {
      return defaultPrevented;
    },
    preventDefault: vi.fn(() => {
      defaultPrevented = true;
    }),
  };
};

describe('native application shortcuts', () => {
  beforeEach(() => {
    initializeZoomFactor(0.95);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('captures macOS Cmd+, before page and menu accelerators receive it', () => {
    const webContents = new EventEmitter();
    const win = { webContents };
    attachApplicationShortcutsToWindow(win as never, 'darwin');
    attachZoomShortcutsToWindow(win as never, vi.fn());
    const event = createEvent();

    webContents.emit('before-input-event', event, createInput({ meta: true }));

    expect(bridgeMocks.openSettings).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(getZoomFactor()).toBe(0.95);
  });

  it('uses Ctrl+, as the non-macOS native fallback', () => {
    const webContents = new EventEmitter();
    const dispose = attachApplicationShortcutsToWindow({ webContents } as never, 'win32');
    const event = createEvent();

    webContents.emit('before-input-event', event, createInput({ control: true }));

    expect(bridgeMocks.openSettings).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    dispose();
  });

  it('matches the produced comma rather than a layout-dependent physical key', () => {
    expect(isOpenSettingsShortcut(createInput({ key: ',', code: 'KeyW', meta: true }), 'darwin')).toBe(true);
    expect(isOpenSettingsShortcut(createInput({ key: 'w', code: 'Comma', meta: true }), 'darwin')).toBe(false);
  });

  it('contains key repeat without opening settings or zooming more than once', () => {
    const webContents = new EventEmitter();
    const win = { webContents };
    attachApplicationShortcutsToWindow(win as never, 'darwin');
    attachZoomShortcutsToWindow(win as never, vi.fn());
    const firstEvent = createEvent();
    const repeatedEvent = createEvent();

    webContents.emit('before-input-event', firstEvent, createInput({ meta: true }));
    webContents.emit('before-input-event', repeatedEvent, createInput({ meta: true, isAutoRepeat: true }));

    expect(firstEvent.defaultPrevented).toBe(true);
    expect(repeatedEvent.defaultPrevented).toBe(true);
    expect(bridgeMocks.openSettings).toHaveBeenCalledTimes(1);
    expect(getZoomFactor()).toBe(0.95);
  });

  it('requires an exact primary chord and an eligible keydown', () => {
    const ineligibleInputs = [
      createInput({ meta: true, control: true }),
      createInput({ meta: true, alt: true }),
      createInput({ meta: true, shift: true }),
      createInput({ meta: true, isComposing: true }),
      createInput({ meta: true, type: 'keyUp' }),
      createInput({ meta: true, key: '.', code: 'Period' }),
    ];

    expect(ineligibleInputs.every((input) => !isOpenSettingsShortcut(input, 'darwin'))).toBe(true);
  });

  it('honors prior handlers and removes its BrowserWindow listener on dispose', () => {
    const webContents = new EventEmitter();
    const dispose = attachApplicationShortcutsToWindow({ webContents } as never, 'darwin');

    webContents.emit('before-input-event', createEvent(true), createInput({ meta: true }));
    dispose();
    webContents.emit('before-input-event', createEvent(), createInput({ meta: true }));

    expect(bridgeMocks.openSettings).not.toHaveBeenCalled();
  });
});
