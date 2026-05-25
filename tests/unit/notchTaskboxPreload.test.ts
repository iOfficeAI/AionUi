/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { exposeInMainWorldMock, ipcInvokeMock, ipcOffMock, ipcOnMock } = vi.hoisted(() => ({
  exposeInMainWorldMock: vi.fn(),
  ipcInvokeMock: vi.fn(),
  ipcOffMock: vi.fn(),
  ipcOnMock: vi.fn(),
}));

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: exposeInMainWorldMock,
  },
  ipcRenderer: {
    invoke: ipcInvokeMock,
    off: ipcOffMock,
    on: ipcOnMock,
  },
}));

type TaskboxApi = {
  request: (path: string, options?: { method?: string; body?: string }) => Promise<unknown>;
  onExpandedChange: (callback: (expanded: boolean) => void) => () => void;
};

const loadApi = async (): Promise<TaskboxApi> => {
  vi.resetModules();
  await import('@/preload/notchTaskboxPreload');
  const call = exposeInMainWorldMock.mock.calls.at(-1);
  if (!call) throw new Error('Taskbox API was not exposed');
  return call[1] as TaskboxApi;
};

describe('notchTaskboxPreload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ipcInvokeMock.mockResolvedValue({ ok: true });
  });

  it('exposes a request helper backed by the taskbox IPC channel', async () => {
    const api = await loadApi();

    const result = await api.request('/api/conversations', { method: 'GET' });

    expect(result).toEqual({ ok: true });
    expect(exposeInMainWorldMock).toHaveBeenCalledWith('aionuiTaskbox', expect.any(Object));
    expect(ipcInvokeMock).toHaveBeenCalledWith('notch-taskbox:request', {
      path: '/api/conversations',
      options: { method: 'GET' },
    });
  });

  it('subscribes and unsubscribes expanded state changes', async () => {
    const api = await loadApi();
    const callback = vi.fn();

    const unsubscribe = api.onExpandedChange(callback);
    const handler = ipcOnMock.mock.calls[0][1];
    handler({}, true);
    unsubscribe();

    expect(callback).toHaveBeenCalledWith(true);
    expect(ipcOnMock).toHaveBeenCalledWith('notch-taskbox:expanded', expect.any(Function));
    expect(ipcOffMock).toHaveBeenCalledWith('notch-taskbox:expanded', handler);
  });
});
