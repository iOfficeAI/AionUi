import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => {
  return {
    startExternalLoginInvoke: vi.fn(),
    completeExternalLogin: vi.fn(),
    navigate: vi.fn(),
  };
});

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({
    ready: true,
    user: null,
    status: 'unauthenticated',
    completeExternalLogin: mocks.completeExternalLogin,
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    auth: {
      startExternalLogin: {
        invoke: mocks.startExternalLoginInvoke,
      },
    },
  },
}));

import LoginPage from '@/renderer/pages/login/index';

const successResult = {
  success: true as const,
  token: 'tok-1',
  user: { id: 'u1', username: 'alice' },
};

beforeEach(() => {
  mocks.startExternalLoginInvoke.mockReset();
  mocks.completeExternalLogin.mockReset();
  mocks.navigate.mockReset();
  mocks.startExternalLoginInvoke.mockResolvedValue(successResult);
});

describe('LoginPage (BrowserWindow flow)', () => {
  it('calls ipcBridge.auth.startExternalLogin once on mount', async () => {
    render(<LoginPage />);
    await waitFor(() => {
      expect(mocks.startExternalLoginInvoke).toHaveBeenCalledTimes(1);
    });
  });

  it('calls completeExternalLogin with token+user on success', async () => {
    render(<LoginPage />);
    await waitFor(() => {
      expect(mocks.completeExternalLogin).toHaveBeenCalledWith('tok-1', { id: 'u1', username: 'alice' });
    });
  });

  it('navigates to /guid on success', async () => {
    render(<LoginPage />);
    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith('/guid', { replace: true });
    });
  });

  it('does not call completeExternalLogin when IPC rejects', async () => {
    mocks.startExternalLoginInvoke.mockRejectedValue(new Error('window closed'));
    render(<LoginPage />);
    await new Promise((r) => setTimeout(r, 50));
    expect(mocks.completeExternalLogin).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('does not call completeExternalLogin when result.success is false', async () => {
    mocks.startExternalLoginInvoke.mockResolvedValue({ success: false, code: 'loadFailed', message: '502' });
    render(<LoginPage />);
    await new Promise((r) => setTimeout(r, 50));
    expect(mocks.completeExternalLogin).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});