/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendHttpError } from '@/common/adapter/httpBridge';
import { restoreDesktopWebUIFromPreferences, stopDesktopWebUI } from '@/process/utils/webuiConfig';

const { httpRequestMock, startWebHostMock } = vi.hoisted(() => ({
  httpRequestMock: vi.fn(),
  startWebHostMock: vi.fn(),
}));

vi.mock('electron', () => ({
  app: {
    getAppPath: () => '/mock/app',
    getPath: () => '/mock/user-data',
    getVersion: () => '1.0.0',
    isPackaged: false,
  },
}));

vi.mock('@/common/adapter/httpBridge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/common/adapter/httpBridge')>()),
  httpRequest: httpRequestMock,
}));

vi.mock('@/process/utils/initStorage', () => ({
  getSystemDir: () => ({ cacheDir: '/mock/cache', workDir: '/mock/work', logDir: '/mock/log' }),
}));

vi.mock('@/process/utils/utils', () => ({
  getDataPath: () => '/mock/data',
}));

vi.mock('@aionui/web-host', () => ({
  startWebHost: startWebHostMock,
}));

describe('restoreDesktopWebUIFromPreferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as { __backendPort?: number }).__backendPort = 25800;
    startWebHostMock.mockImplementation(async () => ({
      port: 25808,
      allowRemote: true,
      localUrl: 'http://localhost:25808',
      networkUrl: 'http://192.168.1.2:25808',
      lanIP: '192.168.1.2',
      stop: vi.fn(),
    }));
  });

  afterEach(async () => {
    await stopDesktopWebUI();
    vi.useRealTimers();
    delete (globalThis as { __backendPort?: number }).__backendPort;
  });

  it('restores persisted WebUI after the backend session becomes available', async () => {
    const calls: string[] = [];
    httpRequestMock
      .mockImplementationOnce(async () => {
        calls.push('before-session');
        throw new BackendHttpError({ method: 'GET', path: '/api/settings/client', status: 401, body: {} });
      })
      .mockImplementationOnce(async () => {
        calls.push('after-session');
        return {
          'webui.desktop.enabled': true,
          'webui.desktop.allowRemote': true,
          'webui.desktop.port': 25808,
        };
      });
    startWebHostMock.mockImplementationOnce(async () => {
      calls.push('start-webui');
      return {
        port: 25808,
        allowRemote: true,
        localUrl: 'http://localhost:25808',
        networkUrl: 'http://192.168.1.2:25808',
        lanIP: '192.168.1.2',
        stop: vi.fn(),
      };
    });

    await restoreDesktopWebUIFromPreferences();

    expect(calls).toEqual(['before-session', 'after-session', 'start-webui']);
    expect(httpRequestMock).toHaveBeenCalledWith('GET', '/api/settings/client', undefined, { silentStatuses: [401] });
    expect(startWebHostMock).toHaveBeenCalledWith(expect.objectContaining({ port: 25808, allowRemote: true }));
  });

  it('does not treat repeated authentication failures as a disabled preference', async () => {
    vi.useFakeTimers();
    httpRequestMock.mockRejectedValue(
      new BackendHttpError({ method: 'GET', path: '/api/settings/client', status: 401, body: {} })
    );

    const restore = restoreDesktopWebUIFromPreferences();
    await vi.runAllTimersAsync();
    await restore;

    expect(httpRequestMock).toHaveBeenCalledTimes(6);
    expect(httpRequestMock).toHaveBeenCalledWith('GET', '/api/settings/client', undefined, { silentStatuses: [401] });
    expect(
      httpRequestMock.mock.calls.filter(([method, path]) => method === 'PUT' && path === '/api/settings/client')
    ).toHaveLength(0);
    expect(startWebHostMock).not.toHaveBeenCalled();
  });

  it('does not retry non-authentication backend errors', async () => {
    httpRequestMock.mockRejectedValue(
      new BackendHttpError({
        method: 'GET',
        path: '/api/settings/client',
        status: 500,
        body: {
          success: false,
          error: 'Internal server error',
          code: 'INTERNAL_ERROR',
        },
      })
    );

    await restoreDesktopWebUIFromPreferences();

    expect(httpRequestMock).toHaveBeenCalledTimes(1);
    expect(httpRequestMock).toHaveBeenCalledWith('GET', '/api/settings/client', undefined, { silentStatuses: [401] });
    expect(
      httpRequestMock.mock.calls.filter(([method, path]) => method === 'PUT' && path === '/api/settings/client')
    ).toHaveLength(0);
    expect(startWebHostMock).not.toHaveBeenCalled();
  });

  it('does not retry non-backend errors', async () => {
    httpRequestMock.mockRejectedValue(new Error('Network error'));

    await restoreDesktopWebUIFromPreferences();

    expect(httpRequestMock).toHaveBeenCalledTimes(1);
    expect(startWebHostMock).not.toHaveBeenCalled();
    expect(
      httpRequestMock.mock.calls.filter(([method, path]) => method === 'PUT' && path === '/api/settings/client')
    ).toHaveLength(0);
  });

  it('does not start WebUI when the persisted preference is disabled', async () => {
    httpRequestMock.mockResolvedValue({
      'webui.desktop.enabled': false,
      'webui.desktop.allowRemote': true,
      'webui.desktop.port': 25808,
    });

    await restoreDesktopWebUIFromPreferences();

    expect(startWebHostMock).not.toHaveBeenCalled();
  });
});
