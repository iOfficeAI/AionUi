/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridgeMocks = vi.hoisted(() => ({
  createQrSession: vi.fn(),
  logout: vi.fn(),
  pollQrSession: vi.fn(),
  status: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    larkAuth: {
      createQrSession: { invoke: bridgeMocks.createQrSession },
      logout: { invoke: bridgeMocks.logout },
      pollQrSession: { invoke: bridgeMocks.pollQrSession },
      status: { invoke: bridgeMocks.status },
    },
  },
}));

import { AuthProvider, useAuth } from '@renderer/hooks/context/AuthContext';

const Probe = () => {
  const { logout, pollLarkQrLogin, startLarkQrLogin, status, user } = useAuth();
  const [qrcodeId, setQrcodeId] = useState('');
  const [logoutFailed, setLogoutFailed] = useState(false);

  return (
    <div>
      <span>{status}</span>
      <span>{user?.realname}</span>
      <span>{qrcodeId}</span>
      <button
        onClick={() => {
          void startLarkQrLogin().then((result) => {
            if (result.success) setQrcodeId(result.data.qrcodeId);
          });
        }}
      >
        start
      </button>
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
