/**
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nativeInvoke = vi.hoisted(() => vi.fn(async () => ['/native/path']));

vi.mock('@/common/platform/bridge', () => ({
  bridge: {
    buildProvider: vi.fn(() => ({
      provider: vi.fn(),
      invoke: nativeInvoke,
    })),
    buildEmitter: vi.fn(() => ({
      on: vi.fn(() => vi.fn()),
      emit: vi.fn(),
    })),
  },
}));

vi.mock('@/common/adapter/httpBridge', () => {
  const provider = () => () => ({ provider: vi.fn(), invoke: vi.fn() });
  const emitter = () => ({ on: vi.fn(() => vi.fn()), emit: vi.fn() });
  return {
    httpGet: provider(),
    httpPost: provider(),
    httpPut: provider(),
    httpPatch: provider(),
    httpDelete: provider(),
    httpRequest: vi.fn(),
    getBaseUrl: vi.fn(() => ''),
    stubProvider: vi.fn(() => ({ provider: vi.fn(), invoke: vi.fn() })),
    withResponseMap: vi.fn((inner: unknown) => inner),
    wsEmitter: vi.fn(emitter),
    wsMappedEmitter: vi.fn(emitter),
    stubEmitter: vi.fn(emitter),
  };
});

type WindowWithElectron = { electronAPI?: unknown };

const setElectron = (present: boolean): void => {
  const win = globalThis as unknown as { window?: WindowWithElectron };
  if (!win.window) win.window = {};
  if (present) win.window.electronAPI = { emit: vi.fn(), on: vi.fn() };
  else delete win.window.electronAPI;
};

describe('ipcBridge dialog.showOpen platform dispatch', () => {
  beforeEach(() => {
    nativeInvoke.mockClear();
    setElectron(false);
  });

  afterEach(async () => {
    const { registerWebShowOpenHandler } = await import('@/common/adapter/ipcBridge');
    registerWebShowOpenHandler(null);
    const win = globalThis as unknown as { window?: WindowWithElectron };
    delete win.window;
  });

  it('falls back to the native IPC channel when no web handler is registered', async () => {
    const { dialog } = await import('@/common/adapter/ipcBridge');

    await expect(dialog.showOpen.invoke({ properties: ['openDirectory'] })).resolves.toEqual(['/native/path']);
    expect(nativeInvoke).toHaveBeenCalledTimes(1);
  });

  it('routes to the registered web handler outside Electron', async () => {
    const { dialog, registerWebShowOpenHandler } = await import('@/common/adapter/ipcBridge');
    const webHandler = vi.fn(async () => ['/data/project']);
    registerWebShowOpenHandler(webHandler);

    const options = { properties: ['openDirectory' as const], defaultPath: '/data' };
    await expect(dialog.showOpen.invoke(options)).resolves.toEqual(['/data/project']);

    expect(webHandler).toHaveBeenCalledWith(options);
    expect(nativeInvoke).not.toHaveBeenCalled();
  });

  it('keeps using the native dialog inside Electron even when a handler is registered', async () => {
    const { dialog, registerWebShowOpenHandler } = await import('@/common/adapter/ipcBridge');
    const webHandler = vi.fn(async () => ['/data/project']);
    registerWebShowOpenHandler(webHandler);
    setElectron(true);

    await expect(dialog.showOpen.invoke({ properties: ['openFile'] })).resolves.toEqual(['/native/path']);

    expect(webHandler).not.toHaveBeenCalled();
    expect(nativeInvoke).toHaveBeenCalledTimes(1);
  });

  it('restores native dispatch when the handler is unregistered', async () => {
    const { dialog, registerWebShowOpenHandler } = await import('@/common/adapter/ipcBridge');
    const webHandler = vi.fn(async () => ['/data/project']);

    registerWebShowOpenHandler(webHandler);
    await dialog.showOpen.invoke({ properties: ['openDirectory'] });
    expect(webHandler).toHaveBeenCalledTimes(1);

    registerWebShowOpenHandler(null);
    await expect(dialog.showOpen.invoke({ properties: ['openDirectory'] })).resolves.toEqual(['/native/path']);
    expect(webHandler).toHaveBeenCalledTimes(1);
    expect(nativeInvoke).toHaveBeenCalledTimes(1);
  });

  it('propagates a cancelled picker as undefined', async () => {
    const { dialog, registerWebShowOpenHandler } = await import('@/common/adapter/ipcBridge');
    registerWebShowOpenHandler(vi.fn(async () => undefined));

    await expect(dialog.showOpen.invoke({ properties: ['openDirectory'] })).resolves.toBeUndefined();
  });
});
