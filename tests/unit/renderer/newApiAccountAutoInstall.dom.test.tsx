/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';

const { installInvoke, loginInvoke, configGet, configSetLocal, swrMutate } = vi.hoisted(() => ({
  installInvoke: vi.fn(),
  loginInvoke: vi.fn(),
  configGet: vi.fn(() => undefined),
  swrMutate: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    newApiAccount: {
      getStatus: { invoke: vi.fn().mockResolvedValue({ success: false }) },
      login: { invoke: loginInvoke },
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
  },
}));

vi.mock('swr', () => ({
  __esModule: true,
  default: () => ({ data: undefined, mutate: swrMutate }),
  mutate: vi.fn(),
}));

vi.mock('@arco-design/web-react', () => ({
  Message: {
    warning: vi.fn(),
  },
}));

import { NewApiAccountProvider, useNewApiAccount } from '@/renderer/hooks/context/NewApiAccountContext';

function TestComponent() {
  const { login, prepStatus } = useNewApiAccount();
  return (
    <>
      <button onClick={() => void login({ username: 'u', password: 'p' })}>login</button>
      <div data-testid='prep-stage'>{prepStatus.stage}</div>
      <div data-testid='prep-percent'>{prepStatus.percent}</div>
    </>
  );
}

describe('NewApiAccountProvider auto install', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configGet.mockReturnValue(undefined);
    loginInvoke.mockResolvedValue({
      success: true,
      data: { status: { loggedIn: true, baseUrl: 'https://api.mxou.cn', models: [], updatedAt: 1 } },
    });
    installInvoke.mockResolvedValue({ success: true, status: 'installed' });
    swrMutate.mockResolvedValue(undefined);
  });

  it('auto-installs hermes and openclaw after successful login', async () => {
    const { getByText } = render(
      <NewApiAccountProvider>
        <TestComponent />
      </NewApiAccountProvider>
    );

    fireEvent.click(getByText('login'));

    await waitFor(() => {
      expect(installInvoke).toHaveBeenCalledTimes(2);
      expect(installInvoke).toHaveBeenNthCalledWith(1, { target: 'hermes' });
      expect(installInvoke).toHaveBeenNthCalledWith(2, { target: 'openclaw' });
      expect(getByText('completed')).toBeInTheDocument();
      expect(getByText('100')).toBeInTheDocument();
    });
  });
});
