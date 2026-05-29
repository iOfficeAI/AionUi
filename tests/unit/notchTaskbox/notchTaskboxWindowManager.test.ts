/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  appOnMock,
  browserWindowConstructorMock,
  destroyPetWindowMock,
  getApplicationMainWindowMock,
  ipcHandleMock,
  isPetSupportedMock,
  processConfigStore,
  screenGetPrimaryDisplayMock,
  setNotchTaskboxNotifyHookMock,
} = vi.hoisted(() => ({
  appOnMock: vi.fn(),
  browserWindowConstructorMock: vi.fn(),
  destroyPetWindowMock: vi.fn(),
  getApplicationMainWindowMock: vi.fn(),
  ipcHandleMock: vi.fn(),
  isPetSupportedMock: vi.fn(),
  processConfigStore: new Map<string, unknown>(),
  screenGetPrimaryDisplayMock: vi.fn(),
  setNotchTaskboxNotifyHookMock: vi.fn(),
}));

type FakeWindow = {
  destroyed: boolean;
  destroy: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
  isDestroyed: () => boolean;
  isMinimized: ReturnType<typeof vi.fn>;
  loadFile: ReturnType<typeof vi.fn>;
  loadURL: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  setAlwaysOnTop: ReturnType<typeof vi.fn>;
  setBounds: ReturnType<typeof vi.fn>;
  show: ReturnType<typeof vi.fn>;
  showInactive: ReturnType<typeof vi.fn>;
  webContents: {
    isLoading: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
  };
};

const originalPlatform = process.platform;

const createWindow = (): FakeWindow => {
  const handlers = new Map<string, () => void>();
  const webContentsHandlers = new Map<string, () => void>();
  const win: FakeWindow = {
    destroyed: false,
    destroy: vi.fn(() => {
      win.destroyed = true;
      handlers.get('closed')?.();
    }),
    focus: vi.fn(),
    isDestroyed: () => win.destroyed,
    isMinimized: vi.fn(() => false),
    loadFile: vi.fn(() => Promise.resolve()),
    loadURL: vi.fn(() => Promise.resolve()),
    on: vi.fn((event: string, handler: () => void) => {
      handlers.set(event, handler);
      return win;
    }),
    once: vi.fn((event: string, handler: () => void) => {
      handlers.set(event, handler);
      if (event === 'ready-to-show') handler();
      return win;
    }),
    restore: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    setBounds: vi.fn(),
    show: vi.fn(),
    showInactive: vi.fn(),
    webContents: {
      isLoading: vi.fn(() => false),
      send: vi.fn(),
      on: vi.fn((event: string, handler: () => void) => {
        webContentsHandlers.set(event, handler);
        if (event === 'did-finish-load') handler();
      }),
    },
  };
  return win;
};

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    on: appOnMock,
  },
  BrowserWindow: browserWindowConstructorMock,
  ipcMain: {
    handle: ipcHandleMock,
  },
  screen: {
    getPrimaryDisplay: screenGetPrimaryDisplayMock,
  },
}));

vi.mock('@/common/adapter/main', () => ({
  setNotchTaskboxNotifyHook: setNotchTaskboxNotifyHookMock,
}));

vi.mock('@process/bridge/applicationBridge', () => ({
  getApplicationMainWindow: getApplicationMainWindowMock,
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: {
    get: vi.fn((key: string) => Promise.resolve(processConfigStore.get(key))),
    set: vi.fn((key: string, value: unknown) => {
      processConfigStore.set(key, value);
      return Promise.resolve();
    }),
  },
}));

vi.mock('@process/pet/petManager', () => ({
  destroyPetWindow: destroyPetWindowMock,
  isPetSupported: isPetSupportedMock,
}));

describe('notchTaskboxWindowManager', () => {
  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    vi.resetModules();
    vi.clearAllMocks();
    processConfigStore.clear();
    screenGetPrimaryDisplayMock.mockReturnValue({ workArea: { x: 0, y: 24, width: 1440, height: 900 } });
    browserWindowConstructorMock.mockImplementation(function BrowserWindowMock() {
      return createWindow();
    });
    isPetSupportedMock.mockReturnValue(true);
  });

  afterAll(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('reports a disabled closed taskbox by default', async () => {
    const { getNotchTaskboxStatus } = await import('@/process/notchTaskbox/notchTaskboxWindowManager');

    await expect(getNotchTaskboxStatus()).resolves.toEqual({
      enabled: false,
      open: false,
      hardwareNotch: false,
    });
  });

  it('opens a top centered taskbox and turns off the desktop pet when enabled', async () => {
    const { setNotchTaskboxEnabled } = await import('@/process/notchTaskbox/notchTaskboxWindowManager');

    const status = await setNotchTaskboxEnabled(true);
    const win = browserWindowConstructorMock.mock.results[0]?.value as FakeWindow;

    expect(status).toEqual({ enabled: true, open: true, hardwareNotch: false });
    expect(processConfigStore.get('notchTaskbox.enabled')).toBe(true);
    expect(processConfigStore.get('pet.enabled')).toBe(false);
    expect(destroyPetWindowMock).toHaveBeenCalled();
    expect(browserWindowConstructorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        x: 380,
        y: 24,
        width: 680,
        height: 44,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
      })
    );
    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver');
    expect(win.showInactive).toHaveBeenCalled();
  });

  it('keeps the setting off when the platform is unsupported', async () => {
    isPetSupportedMock.mockReturnValue(false);
    const { setNotchTaskboxEnabled } = await import('@/process/notchTaskbox/notchTaskboxWindowManager');

    const status = await setNotchTaskboxEnabled(true);

    expect(status).toEqual({ enabled: false, open: false, hardwareNotch: false });
    expect(processConfigStore.get('notchTaskbox.enabled')).toBe(false);
    expect(browserWindowConstructorMock).not.toHaveBeenCalled();
  });

  it('resizes the compact window when hardware notch spacing is enabled', async () => {
    const { setNotchTaskboxEnabled, setNotchTaskboxHardwareNotch } =
      await import('@/process/notchTaskbox/notchTaskboxWindowManager');
    await setNotchTaskboxEnabled(true);
    const win = browserWindowConstructorMock.mock.results[0]?.value as FakeWindow;

    const status = await setNotchTaskboxHardwareNotch(true);

    expect(status).toEqual({ enabled: true, open: true, hardwareNotch: true });
    expect(win.setBounds).toHaveBeenCalledWith({ x: 340, y: 24, width: 760, height: 44 }, true);
    expect(win.webContents.send).toHaveBeenCalledWith('notch-taskbox:status', status);
  });

  it('expands and collapses through the renderer IPC channel', async () => {
    const { setNotchTaskboxEnabled } = await import('@/process/notchTaskbox/notchTaskboxWindowManager');
    await setNotchTaskboxEnabled(true);
    const win = browserWindowConstructorMock.mock.results[0]?.value as FakeWindow;
    const setExpandedHandler = ipcHandleMock.mock.calls.find(
      ([channel]) => channel === 'notch-taskbox:set-expanded'
    )?.[1];

    await setExpandedHandler({}, true);
    await setExpandedHandler({}, false);

    expect(win.setBounds).toHaveBeenCalledWith({ x: 340, y: 24, width: 760, height: 520 }, true);
    expect(win.setBounds).toHaveBeenCalledWith({ x: 380, y: 24, width: 680, height: 44 }, true);
    expect(win.webContents.send).toHaveBeenCalledWith('notch-taskbox:expanded', true);
    expect(win.webContents.send).toHaveBeenCalledWith('notch-taskbox:expanded', false);
  });

  it('proxies only local API requests from the taskbox renderer', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ data: { ok: true } })),
    });
    vi.stubGlobal('fetch', fetchMock);
    (globalThis as typeof globalThis & { __backendPort?: number }).__backendPort = 25809;
    const { setNotchTaskboxEnabled } = await import('@/process/notchTaskbox/notchTaskboxWindowManager');
    await setNotchTaskboxEnabled(true);
    const requestHandler = ipcHandleMock.mock.calls.find(([channel]) => channel === 'notch-taskbox:request')?.[1];

    const result = await requestHandler({}, { path: '/api/conversations', options: { method: 'GET' } });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:25809/api/conversations', { method: 'GET' });
    await expect(requestHandler({}, { path: 'https://example.com/api/conversations' })).rejects.toThrow(
      'Only local /api requests are allowed'
    );
    vi.unstubAllGlobals();
  });

  it('opens the main window from the taskbox action', async () => {
    const mainWindow = createWindow();
    mainWindow.isMinimized.mockReturnValue(true);
    getApplicationMainWindowMock.mockReturnValue(mainWindow);
    const { setNotchTaskboxEnabled } = await import('@/process/notchTaskbox/notchTaskboxWindowManager');
    await setNotchTaskboxEnabled(true);
    const openMainWindowHandler = ipcHandleMock.mock.calls.find(
      ([channel]) => channel === 'notch-taskbox:open-main-window'
    )?.[1];

    openMainWindowHandler();

    expect(mainWindow.restore).toHaveBeenCalled();
    expect(mainWindow.show).toHaveBeenCalled();
    expect(mainWindow.focus).toHaveBeenCalled();
  });
});
