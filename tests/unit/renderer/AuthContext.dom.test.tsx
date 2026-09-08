/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridgeMocks = vi.hoisted(() => ({
  createQrSession: vi.fn(),
  logout: vi.fn(),
  pollQrSession: vi.fn(),
  status: vi.fn(),
  updateEnvironment: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    larkAuth: {
      createQrSession: { invoke: bridgeMocks.createQrSession },
      logout: { invoke: bridgeMocks.logout },
      pollQrSession: { invoke: bridgeMocks.pollQrSession },
      status: { invoke: bridgeMocks.status },
      updateEnvironment: { invoke: bridgeMocks.updateEnvironment },
    },
  },
}));

import { AuthProvider, resetAuthSessionEpochForTests, useAuth } from '@renderer/hooks/context/AuthContext';

const Probe = () => {
  const { authSessionEpoch, logout, pollLarkQrLogin, startLarkQrLogin, updateGeaEnvironment, status, user } = useAuth();
  const [qrcodeId, setQrcodeId] = useState('');
  const [logoutFailed, setLogoutFailed] = useState(false);

  return (
    <div>
      <span>{status}</span>
      <span>{user?.realname}</span>
      <span>{qrcodeId}</span>
      <span data-testid='auth-session-epoch'>{authSessionEpoch}</span>
      <button
        onClick={() => {
          void startLarkQrLogin().then((result) => {
            if (result.success) setQrcodeId(result.data.qrcodeId);
          });
        }}
      >
        start
      </button>
      <button onClick={() => void updateGeaEnvironment('https://new.example/gea-boot')}>switch</button>
      <button onClick={() => void pollLarkQrLogin('QRCODELOGIN:1')}>poll</button>
      <button onClick={() => void logout().catch(() => setLogoutFailed(true))}>logout</button>
      {logoutFailed && <span>logout failed</span>}
    </div>
  );
};

const renderProbe = () =>
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );

describe('desktop AuthProvider', () => {
  beforeEach(() => {
    act(() => resetAuthSessionEpochForTests());
    bridgeMocks.status.mockReset().mockResolvedValue({ success: true, data: { authenticated: false } });
    bridgeMocks.createQrSession.mockReset().mockResolvedValue({
      success: true,
      data: { expiresIn: 300, loginUrl: 'https://gea.example/login', qrcodeId: 'QRCODELOGIN:1' },
    });
    bridgeMocks.pollQrSession.mockReset().mockResolvedValue({
      success: true,
      data: {
        status: 'authenticated',
        user: { id: '10086', username: 'zhangsan', realname: '张三' },
      },
    });
    bridgeMocks.updateEnvironment.mockReset().mockResolvedValue({
      success: true,
      data: {
        changed: true,
        environment: {
          baseUrl: 'https://new.example/gea-boot',
          editable: true,
          environmentId: 'new',
          source: 'profile',
        },
      },
    });
    bridgeMocks.logout.mockReset().mockResolvedValue({ success: true, data: { authenticated: false } });
  });

  it('starts unauthenticated instead of bypassing desktop login', async () => {
    renderProbe();

    await waitFor(() => expect(screen.getByText('unauthenticated')).toBeInTheDocument());
    expect(bridgeMocks.status).toHaveBeenCalledTimes(1);
  });

  it('exposes the QR session returned by the main process', async () => {
    renderProbe();
    await waitFor(() => expect(screen.getByText('unauthenticated')).toBeInTheDocument());

    fireEvent.click(screen.getByText('start'));

    await waitFor(() => expect(screen.getByText('QRCODELOGIN:1')).toBeInTheDocument());
  });

  it('publishes the GEA user after polling succeeds and clears it on logout', async () => {
    renderProbe();
    await waitFor(() => expect(screen.getByText('unauthenticated')).toBeInTheDocument());

    fireEvent.click(screen.getByText('poll'));
    await waitFor(() => expect(screen.getByText('张三')).toBeInTheDocument());
    expect(screen.getByText('authenticated')).toBeInTheDocument();

    fireEvent.click(screen.getByText('logout'));
    await waitFor(() => expect(screen.getByText('unauthenticated')).toBeInTheDocument());
    expect(screen.queryByText('张三')).toBeNull();
  });

  it('advances the auth session epoch when the authenticated external user changes', async () => {
    renderProbe();
    await waitFor(() => expect(screen.getByText('unauthenticated')).toBeInTheDocument());
    const unauthenticatedEpoch = Number(screen.getByTestId('auth-session-epoch').textContent);

    fireEvent.click(screen.getByText('poll'));
    await waitFor(() => expect(screen.getByText('张三')).toBeInTheDocument());
    const userAEpoch = Number(screen.getByTestId('auth-session-epoch').textContent);
    expect(userAEpoch).toBeGreaterThan(unauthenticatedEpoch);

    bridgeMocks.pollQrSession.mockResolvedValueOnce({
      success: true,
      data: {
        status: 'authenticated',
        user: { id: '10010', username: 'lisi', realname: '李四' },
      },
    });
    fireEvent.click(screen.getByText('poll'));
    await waitFor(() => expect(screen.getByText('李四')).toBeInTheDocument());
    expect(Number(screen.getByTestId('auth-session-epoch').textContent)).toBeGreaterThan(userAEpoch);
  });

  it('discards a late login poll after switching environments', async () => {
    let release!: (result: unknown) => void;
    bridgeMocks.pollQrSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    renderProbe();
    await waitFor(() => expect(screen.getByText('unauthenticated')).toBeInTheDocument());
    fireEvent.click(screen.getByText('poll'));
    fireEvent.click(screen.getByText('switch'));
    await waitFor(() =>
      expect(bridgeMocks.updateEnvironment).toHaveBeenCalledWith({ baseUrl: 'https://new.example/gea-boot' })
    );
    await act(async () => {
      release({
        success: true,
        data: { status: 'authenticated', user: { id: 'old', username: 'old', realname: 'Old Environment User' } },
      });
    });
    expect(screen.getByText('unauthenticated')).toBeInTheDocument();
    expect(screen.queryByText('Old Environment User')).not.toBeInTheDocument();
  });

  it('keeps the authenticated user when persistent logout fails', async () => {
    bridgeMocks.logout.mockResolvedValue({ success: false, code: 'serverError' });
    renderProbe();
    await waitFor(() => expect(screen.getByText('unauthenticated')).toBeInTheDocument());

    fireEvent.click(screen.getByText('poll'));
    await waitFor(() => expect(screen.getByText('张三')).toBeInTheDocument());

    fireEvent.click(screen.getByText('logout'));

    await waitFor(() => expect(screen.getByText('logout failed')).toBeInTheDocument());
    expect(screen.getByText('authenticated')).toBeInTheDocument();
    expect(screen.getByText('张三')).toBeInTheDocument();
  });
});
