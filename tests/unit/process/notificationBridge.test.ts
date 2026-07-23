/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let notificationEnabled: boolean | undefined = true;
const clickedEmit = vi.fn();
const platformSend = vi.fn();

// Defined via vi.hoisted so the hoisted vi.mock factory can reference the class
// at evaluation time without a temporal-dead-zone error.
const { FakeElectronNotification } = vi.hoisted(() => {
  class FakeElectronNotification {
    static instances: FakeElectronNotification[] = [];
    handlers: Record<string, () => void> = {};
    show = vi.fn();
    constructor(public options: { title: string; body: string; icon?: string }) {
      FakeElectronNotification.instances.push(this);
    }
    on(event: string, cb: () => void): this {
      this.handlers[event] = cb;
      return this;
    }
  }
  return { FakeElectronNotification };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    notification: {
      show: { provider: vi.fn() },
      clicked: { emit: (...args: unknown[]) => clickedEmit(...args) },
    },
  },
}));

vi.mock('@/common/platform', () => ({
  getPlatformServices: () => ({
    paths: { isPackaged: () => false },
    notification: { send: (...args: unknown[]) => platformSend(...args) },
  }),
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: { get: vi.fn(async () => notificationEnabled) },
}));

vi.mock('@/common/electronSafe', () => ({
  electronNotification: FakeElectronNotification,
}));

vi.mock('fs', () => ({ default: { existsSync: () => false }, existsSync: () => false }));

import { showNotification, setNotificationMainWindow } from '@/process/bridge/notificationBridge';

const makeWindow = (focused: boolean) => ({
  isDestroyed: () => false,
  isFocused: () => focused,
  isMinimized: () => false,
  restore: vi.fn(),
  show: vi.fn(),
  focus: vi.fn(),
});

beforeEach(() => {
  notificationEnabled = true;
  clickedEmit.mockClear();
  platformSend.mockClear();
  FakeElectronNotification.instances.length = 0;
});

describe('showNotification', () => {
  it('shows a native notification when the main window is not focused', async () => {
    setNotificationMainWindow(makeWindow(false) as never);
    await showNotification({ title: 'AionUi', body: 'done', conversation_id: 'c1' });
    expect(FakeElectronNotification.instances).toHaveLength(1);
    expect(FakeElectronNotification.instances[0].show).toHaveBeenCalledTimes(1);
  });

  it('does not notify when the main window is focused', async () => {
    setNotificationMainWindow(makeWindow(true) as never);
    await showNotification({ title: 'AionUi', body: 'done', conversation_id: 'c1' });
    expect(FakeElectronNotification.instances).toHaveLength(0);
  });

  it('does not notify when the setting is disabled', async () => {
    notificationEnabled = false;
    setNotificationMainWindow(makeWindow(false) as never);
    await showNotification({ title: 'AionUi', body: 'done', conversation_id: 'c1' });
    expect(FakeElectronNotification.instances).toHaveLength(0);
  });

  it('focuses the window and emits notification.clicked on click', async () => {
    const win = makeWindow(false);
    setNotificationMainWindow(win as never);
    await showNotification({ title: 'AionUi', body: 'done', conversation_id: 'c1' });

    FakeElectronNotification.instances[0].handlers.click?.();

    expect(win.show).toHaveBeenCalledTimes(1);
    expect(win.focus).toHaveBeenCalledTimes(1);
    expect(clickedEmit).toHaveBeenCalledWith({ conversation_id: 'c1' });
  });
});
