/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  appOnMock,
  accessMock,
  browserWindowConstructorMock,
  chmodMock,
  destroyPetWindowMock,
  execFileMock,
  ipcHandleMock,
  isPetSupportedMock,
  mkdirMock,
  processConfigStore,
  screenGetCursorScreenPointMock,
  screenGetPrimaryDisplayMock,
  spawnMock,
  statMock,
} = vi.hoisted(() => ({
  appOnMock: vi.fn(),
  accessMock: vi.fn(),
  browserWindowConstructorMock: vi.fn(),
  chmodMock: vi.fn(),
  destroyPetWindowMock: vi.fn(),
  execFileMock: vi.fn(),
  ipcHandleMock: vi.fn(),
  isPetSupportedMock: vi.fn(),
  mkdirMock: vi.fn(),
  processConfigStore: new Map<string, unknown>(),
  screenGetCursorScreenPointMock: vi.fn(),
  screenGetPrimaryDisplayMock: vi.fn(),
  spawnMock: vi.fn(),
  statMock: vi.fn(),
}));

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn(() => '/tmp/aionui-test-user-data'),
    on: appOnMock,
  },
  BrowserWindow: browserWindowConstructorMock,
  ipcMain: {
    handle: ipcHandleMock,
  },
  screen: {
    getCursorScreenPoint: screenGetCursorScreenPointMock,
    getPrimaryDisplay: screenGetPrimaryDisplayMock,
  },
}));

vi.mock('node:fs/promises', () => ({
  default: {
    access: accessMock,
    mkdir: mkdirMock,
    stat: statMock,
    chmod: chmodMock,
  },
  access: accessMock,
  mkdir: mkdirMock,
  stat: statMock,
  chmod: chmodMock,
}));

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
  spawn: spawnMock,
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

type FakeChild = {
  killed: boolean;
  kill: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  unref: ReturnType<typeof vi.fn>;
};

type FakeWindow = {
  destroyed: boolean;
  destroy: ReturnType<typeof vi.fn>;
  getBounds: ReturnType<typeof vi.fn>;
  isDestroyed: () => boolean;
  loadFile: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
  setAlwaysOnTop: ReturnType<typeof vi.fn>;
  setBounds: ReturnType<typeof vi.fn>;
  showInactive: ReturnType<typeof vi.fn>;
  webContents: { send: ReturnType<typeof vi.fn> };
};

const originalPlatform = process.platform;
const originalResourcesPath = process.resourcesPath;

const normalizePath = (value: string) => value.replace(/\\/g, '/');

const createChild = (): FakeChild => {
  const handlers = new Map<string, () => void>();
  const child: FakeChild = {
    killed: false,
    kill: vi.fn(() => {
      child.killed = true;
      handlers.get('exit')?.();
      return true;
    }),
    on: vi.fn((event: string, handler: () => void) => {
      handlers.set(event, handler);
      return child;
    }),
    unref: vi.fn(),
  };
  return child;
};

const createWindow = (): FakeWindow => {
  const handlers = new Map<string, () => void>();
  const win: FakeWindow = {
    destroyed: false,
    destroy: vi.fn(() => {
      win.destroyed = true;
      handlers.get('closed')?.();
    }),
    getBounds: vi.fn(() => ({ x: 436, y: 0, width: 408, height: 40 })),
    isDestroyed: () => win.destroyed,
    loadFile: vi.fn(() => Promise.resolve()),
    on: vi.fn((event: string, handler: () => void) => {
      handlers.set(event, handler);
      return win;
    }),
    once: vi.fn((event: string, handler: () => void) => {
      handlers.set(event, handler);
      if (event === 'ready-to-show') handler();
      return win;
    }),
    setAlwaysOnTop: vi.fn(),
    setBounds: vi.fn(),
    showInactive: vi.fn(),
    webContents: { send: vi.fn() },
  };
  return win;
};

describe('notchTaskboxWindowManager', () => {
  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    vi.resetModules();
    vi.clearAllMocks();
    processConfigStore.clear();
    (globalThis as typeof globalThis & { __backendPort?: number }).__backendPort = 25809;

    mkdirMock.mockResolvedValue(undefined);
    accessMock.mockRejectedValue(new Error('missing packaged helper'));
    statMock.mockImplementation((target: string) => {
      if (target.endsWith('AionUiNotchTaskbox.swift')) return Promise.resolve({ mtimeMs: 2000 });
      return Promise.reject(new Error('missing helper binary'));
    });
    chmodMock.mockResolvedValue(undefined);
    execFileMock.mockImplementation((_cmd: string, _args: string[], callback: (error: Error | null) => void) => {
      callback(null);
    });
    spawnMock.mockImplementation(() => createChild());
    browserWindowConstructorMock.mockImplementation(function BrowserWindowMock() {
      return createWindow();
    });
    screenGetPrimaryDisplayMock.mockReturnValue({ workArea: { x: 0, y: 0, width: 1280, height: 720 } });
    screenGetCursorScreenPointMock.mockReturnValue({ x: -100, y: -100 });
    isPetSupportedMock.mockReturnValue(true);
  });

  afterAll(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    Object.defineProperty(process, 'resourcesPath', { configurable: true, value: originalResourcesPath });
  });

  it('starts the native helper against the backend and disables the desktop pet', async () => {
    const { setNotchTaskboxEnabled } = await import('@/process/notchTaskbox/notchTaskboxWindowManager');

    const status = await setNotchTaskboxEnabled(true);

    expect(status).toEqual({ enabled: true, open: true, hardwareNotch: false });
    expect(processConfigStore.get('notchTaskbox.enabled')).toBe(true);
    expect(processConfigStore.get('pet.enabled')).toBe(false);
    expect(destroyPetWindowMock).toHaveBeenCalled();
    const [helperPath, args, options] = spawnMock.mock.calls[0] as [string, string[], { stdio: string }];
    expect(normalizePath(helperPath)).toBe('/tmp/aionui-test-user-data/helpers/AionUiNotchTaskbox');
    expect(args).toEqual(['--api', 'http://127.0.0.1:25809', '--parent-pid', String(process.pid)]);
    expect(options).toEqual({ stdio: 'ignore' });
    expect(execFileMock).toHaveBeenCalledWith(
      '/usr/bin/swiftc',
      expect.arrayContaining(['-framework', 'AppKit', '-framework', 'WebKit']),
      expect.any(Function)
    );
  });

  it('keeps the switch off when the platform does not support the taskbox', async () => {
    isPetSupportedMock.mockReturnValue(false);
    const { setNotchTaskboxEnabled } = await import('@/process/notchTaskbox/notchTaskboxWindowManager');

    const status = await setNotchTaskboxEnabled(true);

    expect(status).toEqual({ enabled: false, open: false, hardwareNotch: false });
    expect(processConfigStore.get('notchTaskbox.enabled')).toBe(false);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('restarts the helper with hardware notch spacing enabled', async () => {
    const { setNotchTaskboxEnabled, setNotchTaskboxHardwareNotch } =
      await import('@/process/notchTaskbox/notchTaskboxWindowManager');
    await setNotchTaskboxEnabled(true);
    const firstChild = spawnMock.mock.results[0]?.value as FakeChild;
    spawnMock.mockClear();

    const status = await setNotchTaskboxHardwareNotch(true);

    expect(status).toEqual({ enabled: true, open: true, hardwareNotch: true });
    expect(firstChild.kill).toHaveBeenCalled();
    const [helperPath, args, options] = spawnMock.mock.calls[0] as [string, string[], { stdio: string }];
    expect(normalizePath(helperPath)).toBe('/tmp/aionui-test-user-data/helpers/AionUiNotchTaskbox');
    expect(args).toEqual(['--api', 'http://127.0.0.1:25809', '--parent-pid', String(process.pid), '--hardware-notch']);
    expect(options).toEqual({ stdio: 'ignore' });
  });

  it('kills the helper when disabled', async () => {
    const { setNotchTaskboxEnabled } = await import('@/process/notchTaskbox/notchTaskboxWindowManager');
    await setNotchTaskboxEnabled(true);
    const child = spawnMock.mock.results[0]?.value as FakeChild;

    const status = await setNotchTaskboxEnabled(false);

    expect(status).toEqual({ enabled: false, open: false, hardwareNotch: false });
    expect(child.kill).toHaveBeenCalled();
  });

  it('creates a top-center taskbox window on Windows', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const { setNotchTaskboxEnabled } = await import('@/process/notchTaskbox/notchTaskboxWindowManager');

    const status = await setNotchTaskboxEnabled(true);
    const win = browserWindowConstructorMock.mock.results[0]?.value as FakeWindow;

    expect(status).toEqual({ enabled: true, open: true, hardwareNotch: false });
    expect(spawnMock).not.toHaveBeenCalled();
    expect(ipcHandleMock).toHaveBeenCalledWith('notch-taskbox:request', expect.any(Function));
    expect(browserWindowConstructorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        x: 436,
        y: 0,
        width: 408,
        height: 40,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
      })
    );
    expect(normalizePath(win.loadFile.mock.calls[0][0])).toContain('resources/notch-taskbox-helper/taskbox.html');

    const nextStatus = await setNotchTaskboxEnabled(false);
    expect(nextStatus.open).toBe(false);
    expect(win.destroy).toHaveBeenCalled();
  });

  it('uses the cached native helper binary when it is newer than the source', async () => {
    statMock.mockImplementation((target: string) => {
      if (target.endsWith('AionUiNotchTaskbox.swift')) return Promise.resolve({ mtimeMs: 2000 });
      if (target.endsWith('AionUiNotchTaskbox')) return Promise.resolve({ mtimeMs: 3000 });
      return Promise.reject(new Error('missing'));
    });
    const { setNotchTaskboxEnabled } = await import('@/process/notchTaskbox/notchTaskboxWindowManager');

    await setNotchTaskboxEnabled(true);

    const [helperPath] = spawnMock.mock.calls[0] as [string];
    expect(normalizePath(helperPath)).toBe('/tmp/aionui-test-user-data/helpers/AionUiNotchTaskbox');
    expect(execFileMock).not.toHaveBeenCalled();
    expect(chmodMock).not.toHaveBeenCalled();
  });

  it('uses a packaged helper binary when it is available', async () => {
    Object.defineProperty(process, 'resourcesPath', {
      configurable: true,
      value: '/Applications/AionUi.app/Contents/Resources',
    });
    const { app } = await import('electron');
    vi.mocked(app).isPackaged = true;
    accessMock.mockResolvedValue(undefined);
    const { setNotchTaskboxEnabled } = await import('@/process/notchTaskbox/notchTaskboxWindowManager');

    await setNotchTaskboxEnabled(true);

    const [helperPath] = spawnMock.mock.calls[0] as [string];
    expect(normalizePath(helperPath)).toBe(
      '/Applications/AionUi.app/Contents/Resources/notch-taskbox-helper/AionUiNotchTaskbox'
    );
    expect(mkdirMock).not.toHaveBeenCalled();
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('surfaces a clear error when the backend port is not ready', async () => {
    delete (globalThis as typeof globalThis & { __backendPort?: number }).__backendPort;
    const { setNotchTaskboxEnabled } = await import('@/process/notchTaskbox/notchTaskboxWindowManager');

    await expect(setNotchTaskboxEnabled(true)).rejects.toThrow('aioncore is not running');
  });

  it('handles Windows taskbox IPC requests safely', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ data: { ok: true } })),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { setNotchTaskboxEnabled } = await import('@/process/notchTaskbox/notchTaskboxWindowManager');

    await setNotchTaskboxEnabled(true);
    const handler = ipcHandleMock.mock.calls[0][1];
    const result = await handler({}, { path: '/api/conversations', options: { method: 'GET' } });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:25809/api/conversations', { method: 'GET' });
    await expect(handler({}, { path: '/not-api' })).rejects.toThrow('Only local /api requests are allowed');
    vi.unstubAllGlobals();
  });

  it('expands and collapses the Windows taskbox from global pointer movement', async () => {
    vi.useFakeTimers();
    Object.defineProperty(process, 'platform', { value: 'win32' });
    screenGetCursorScreenPointMock.mockReturnValueOnce({ x: 500, y: 20 }).mockReturnValue({ x: -100, y: -100 });
    const { setNotchTaskboxEnabled } = await import('@/process/notchTaskbox/notchTaskboxWindowManager');

    await setNotchTaskboxEnabled(true);
    const win = browserWindowConstructorMock.mock.results[0]?.value as FakeWindow;
    vi.advanceTimersByTime(60);

    expect(win.setBounds).toHaveBeenCalledWith({ x: 360, y: 0, width: 560, height: 392 }, true);
    expect(win.webContents.send).toHaveBeenCalledWith('notch-taskbox:expanded', true);
    vi.advanceTimersByTime(60);
    expect(win.setBounds).toHaveBeenCalledWith({ x: 436, y: 0, width: 408, height: 40 }, true);

    await setNotchTaskboxEnabled(false);
    vi.useRealTimers();
  });
});
