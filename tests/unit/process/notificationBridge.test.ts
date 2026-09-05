/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let notificationEnabled: boolean | undefined = true;
const clickedEmit = vi.fn();
const platformSend = vi.fn();

// Defined via vi.hoisted so the hoisted vi.mock factory can reference the class
// at evaluation time without a temporal-dead-zone error.
const { FakeElectronNotification, focusDetachedConversation, openDetachedConversation } = vi.hoisted(() => {
  class FakeElectronNotification {
    static instances: FakeElectronNotification[] = [];
    static isSupported = vi.fn(() => true);
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
  return {
    FakeElectronNotification,
    focusDetachedConversation: vi.fn(() => false),
    openDetachedConversation: vi.fn(() => Promise.resolve()),
  };
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

vi.mock('@process/services/detachedWindowRegistry', () => ({
  getDetachedWindowRegistry: () => ({
    focusConversation: focusDetachedConversation,
    openConversation: openDetachedConversation,
  }),
}));

vi.mock('fs', () => ({ default: { existsSync: () => false }, existsSync: () => false }));

import {
  registerNotificationAppWindow,
  resetNotificationAppWindowsForTest,
  setNotificationMainWindow,
  showNotification,
} from '@/process/bridge/notificationBridge';

const makeWindow = (focused: boolean, id = 1) => {
  let closedHandler: (() => void) | undefined;
  let destroyed = false;
  return {
    webContents: { id },
    isDestroyed: () => destroyed,
    isFocused: () => focused,
    once: vi.fn((_event: string, handler: () => void) => {
      closedHandler = handler;
    }),
    emitClosed: () => {
      destroyed = true;
      closedHandler?.();
    },
    isMinimized: () => false,
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
  };
};

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetNotificationAppWindowsForTest();
  notificationEnabled = true;
  clickedEmit.mockClear();
  focusDetachedConversation.mockReset();
  focusDetachedConversation.mockReturnValue(false);
  openDetachedConversation.mockReset();
  openDetachedConversation.mockResolvedValue(undefined);
  platformSend.mockClear();
  FakeElectronNotification.instances.length = 0;
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
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

  /**
   * A second app window (a detached conversation) is a place the user reads
   * replies, so its focus has to suppress the notification too — the gate used
   * to ask only the main window.
   */
  it('does not notify when a second app window is focused', async () => {
    setNotificationMainWindow(makeWindow(false) as never);
    registerNotificationAppWindow(makeWindow(true) as never);
    await showNotification({ title: 'AionUi', body: 'done', conversation_id: 'c1' });
    expect(FakeElectronNotification.instances).toHaveLength(0);
  });

  it('still notifies when every registered app window is unfocused', async () => {
    setNotificationMainWindow(makeWindow(false) as never);
    registerNotificationAppWindow(makeWindow(false) as never);
    await showNotification({ title: 'AionUi', body: 'done', conversation_id: 'c1' });
    expect(FakeElectronNotification.instances).toHaveLength(1);
  });

  it('registers the same app window idempotently', () => {
    const win = makeWindow(false);

    registerNotificationAppWindow(win as never);
    registerNotificationAppWindow(win as never);

    expect(win.once).toHaveBeenCalledOnce();
  });

  it('uses one producer while allowing a detached window to take over after the main closes', async () => {
    const main = makeWindow(false, 1);
    const detached = makeWindow(false, 2);
    setNotificationMainWindow(main as never);
    registerNotificationAppWindow(detached as never);

    await showNotification({
      title: 'AionUi',
      body: 'duplicate',
      source_web_contents_id: 2,
    });
    expect(FakeElectronNotification.instances).toHaveLength(0);

    main.emitClosed();
    await showNotification({
      title: 'AionUi',
      body: 'only detached remains',
      source_web_contents_id: 2,
    });
    expect(FakeElectronNotification.instances).toHaveLength(1);
  });

  it('returns notification production to a recreated main window', async () => {
    const originalMain = makeWindow(false, 1);
    const detached = makeWindow(false, 2);
    const recreatedMain = makeWindow(false, 3);
    setNotificationMainWindow(originalMain as never);
    registerNotificationAppWindow(detached as never);
    originalMain.emitClosed();
    setNotificationMainWindow(recreatedMain as never);

    await showNotification({ title: 'AionUi', body: 'main', source_web_contents_id: 3 });
    await showNotification({ title: 'AionUi', body: 'detached', source_web_contents_id: 2 });

    expect(FakeElectronNotification.instances).toHaveLength(1);
    expect(FakeElectronNotification.instances[0].options.body).toBe('main');
  });

  it('ignores a destroyed app window when deciding whether the app is focused', async () => {
    setNotificationMainWindow(makeWindow(false) as never);
    registerNotificationAppWindow({ ...makeWindow(true), isDestroyed: () => true } as never);
    await showNotification({ title: 'AionUi', body: 'done', conversation_id: 'c1' });
    expect(FakeElectronNotification.instances).toHaveLength(1);
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

  it('focuses an owning detached window without flashing the main window', async () => {
    const main = makeWindow(false);
    focusDetachedConversation.mockReturnValue(true);
    setNotificationMainWindow(main as never);
    await showNotification({ title: 'AionUi', body: 'done', conversation_id: 'c1' });

    FakeElectronNotification.instances[0].handlers.click?.();

    expect(focusDetachedConversation).toHaveBeenCalledWith('c1');
    expect(main.show).not.toHaveBeenCalled();
    expect(main.focus).not.toHaveBeenCalled();
    expect(clickedEmit).not.toHaveBeenCalled();
  });

  it('focuses the detached conversation when the main window has closed', async () => {
    const main = makeWindow(false, 1);
    const detached = makeWindow(false, 2);
    setNotificationMainWindow(main as never);
    registerNotificationAppWindow(detached as never);
    main.emitClosed();
    await showNotification({
      title: 'AionUi',
      body: 'done',
      conversation_id: 'c1',
      source_web_contents_id: 2,
    });
    focusDetachedConversation.mockReturnValue(true);

    FakeElectronNotification.instances[0].handlers.click?.();

    expect(focusDetachedConversation).toHaveBeenCalledWith('c1');
    expect(main.show).not.toHaveBeenCalled();
    expect(clickedEmit).not.toHaveBeenCalled();
  });

  it('opens the target conversation when no main or owning detached window remains', async () => {
    const main = makeWindow(false, 1);
    const producer = makeWindow(false, 2);
    setNotificationMainWindow(main as never);
    registerNotificationAppWindow(producer as never);
    main.emitClosed();
    await showNotification({
      title: 'AionUi',
      body: 'done',
      conversation_id: 'c2',
      source_web_contents_id: 2,
    });

    FakeElectronNotification.instances[0].handlers.click?.();

    expect(openDetachedConversation).toHaveBeenCalledWith('c2');
    expect(producer.show).not.toHaveBeenCalled();
    expect(clickedEmit).not.toHaveBeenCalled();
  });

  it('never raises an unrelated conversation when the notification open fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    openDetachedConversation.mockRejectedValueOnce(new Error('renderer failed to load'));
    const main = makeWindow(false, 1);
    const otherConversationWindow = makeWindow(false, 2);
    setNotificationMainWindow(main as never);
    registerNotificationAppWindow(otherConversationWindow as never);
    main.emitClosed();
    await showNotification({
      title: 'AionUi',
      body: 'done',
      conversation_id: 'c2',
      source_web_contents_id: 2,
    });

    FakeElectronNotification.instances[0].handlers.click?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(openDetachedConversation).toHaveBeenCalledWith('c2');
    expect(otherConversationWindow.show).not.toHaveBeenCalled();
    expect(clickedEmit).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      '[Notification] Failed to open notification conversation:',
      expect.any(Error)
    );
    errorSpy.mockRestore();
  });

  it('logs when skipping because notifications are disabled in settings', async () => {
    notificationEnabled = false;
    setNotificationMainWindow(makeWindow(false) as never);
    await showNotification({ title: 'AionUi', body: 'done', conversation_id: 'c1' });
    expect(logSpy).toHaveBeenCalledWith('[Notification] Skipped: notifications are disabled in settings');
  });

  it('logs when skipping because an app window is focused', async () => {
    setNotificationMainWindow(makeWindow(true) as never);
    await showNotification({ title: 'AionUi', body: 'done', conversation_id: 'c1' });
    expect(logSpy).toHaveBeenCalledWith('[Notification] Skipped: an app window is focused');
  });

  it('logs after calling show() including the isSupported result', async () => {
    setNotificationMainWindow(makeWindow(false) as never);
    await showNotification({ title: 'AionUi', body: 'done', conversation_id: 'c1' });
    expect(FakeElectronNotification.instances[0].show).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('[Notification] show() called (isSupported=true)');
  });
});
