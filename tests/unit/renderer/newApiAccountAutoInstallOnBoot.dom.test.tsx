/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const { installInvoke, configGet } = vi.hoisted(() => ({
  installInvoke: vi.fn(),
  configGet: vi.fn(() => undefined),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    newApiAccount: {
      getStatus: {
        invoke: vi.fn().mockResolvedValue({
          success: true,
          data: { loggedIn: true, baseUrl: 'https://api.mxou.cn', models: ['MiniMax-M2.7-highspeed'], updatedAt: 1 },
        }),
      },
      login: { invoke: vi.fn() },
      logout: { invoke: vi.fn() },
    },
    managedCliInstaller: {
      install: { invoke: installInvoke },
    },
  },
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: configGet,
    setLocal: vi.fn(),
  },
}));

vi.mock('swr', async () => {
  const React = await import('react');
  return {
    __esModule: true,
    default: (_key: string, fetcher: () => Promise<unknown>) => {
      const [data, setData] = React.useState<unknown>(undefined);
      React.useEffect(() => {
        void fetcher().then(setData);
      }, []);
      return { data, mutate: vi.fn() };
    },
    mutate: vi.fn(),
  };
});

vi.mock('@arco-design/web-react', () => ({
  Message: {
    warning: vi.fn(),
  },
}));

import { NewApiAccountProvider } from '@/renderer/hooks/context/NewApiAccountContext';

describe('NewApiAccountProvider boot auto install', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configGet.mockReturnValue(undefined);
    installInvoke.mockResolvedValue({ success: true, status: 'installed' });
  });

  it('auto-installs hermes and openclaw for an already logged-in desktop user on boot', async () => {
    render(
      <NewApiAccountProvider>
        <div>boot</div>
      </NewApiAccountProvider>
    );

    await waitFor(() => {
      expect(installInvoke).toHaveBeenCalledTimes(2);
      expect(installInvoke).toHaveBeenNthCalledWith(1, { target: 'hermes' });
      expect(installInvoke).toHaveBeenNthCalledWith(2, { target: 'openclaw' });
    });
  });
});
