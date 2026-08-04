/**
 * @vitest-environment jsdom
 */

import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type AuthModule = typeof import('@renderer/hooks/context/AuthContext');

let AuthProvider: AuthModule['AuthProvider'];
let useAuth: AuthModule['useAuth'];
const originalElectronApi = window.electronAPI;

beforeAll(async () => {
  delete window.electronAPI;
  vi.resetModules();
  ({ AuthProvider, useAuth } = await import('@renderer/hooks/context/AuthContext'));
});

afterAll(() => {
  window.electronAPI = originalElectronApi;
});

const Probe = () => {
  const { logout, pollLarkQrLogin, startLarkQrLogin, status, user } = useAuth();
  const [qrcodeId, setQrcodeId] = useState('');

  return (
    <div>
      <span>{status}</span>
      <span>{user?.realname}</span>
      <span>{qrcodeId}</span>
      <button
        onClick={() =>
          void startLarkQrLogin().then((result) => {
            if (result.success) setQrcodeId(result.data.qrcodeId);
          })
        }
      >
        start
      </button>
      <button onClick={() => void pollLarkQrLogin('qr-1')}>poll</button>
      <button onClick={() => void logout()}>logout</button>
    </div>
  );
};

describe('WebUI AuthProvider', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset().mockImplementation(async (input, init) => {
      const path = String(input);
      if (path === '/api/auth/user') {
        return new Response(JSON.stringify({ success: false }), { status: 401 });
      }
      if (path === '/api/lark-auth/qr-session') {
        return Response.json({
          success: true,
          data: { expiresIn: 300, loginUrl: 'https://gea.example/login', qrcodeId: 'qr-1' },
        });
      }
      if (path === '/api/lark-auth/poll') {
        expect(init?.credentials).toBe('include');
        return Response.json({
          success: true,
          data: {
            status: 'authenticated',
            user: { id: 'user-1', username: 'zhangsan', realname: '张三' },
          },
        });
      }
      if (path === '/api/lark-auth/logout') {
        return Response.json({ success: true, data: { authenticated: false } });
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  it('uses Lark QR endpoints and publishes the Feishu user', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText('unauthenticated')).toBeInTheDocument());
    fireEvent.click(screen.getByText('start'));
    await waitFor(() => expect(screen.getByText('qr-1')).toBeInTheDocument());

    fireEvent.click(screen.getByText('poll'));
    await waitFor(() => expect(screen.getByText('张三')).toBeInTheDocument());
    expect(screen.getByText('authenticated')).toBeInTheDocument();

    fireEvent.click(screen.getByText('logout'));
    await waitFor(() => expect(screen.getByText('unauthenticated')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/lark-auth/logout',
      expect.objectContaining({ method: 'POST', credentials: 'include' })
    );
  });
});
