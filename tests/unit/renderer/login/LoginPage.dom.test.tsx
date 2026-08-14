/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const navigate = vi.hoisted(() => vi.fn());
const login = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({
  status: 'unauthenticated' as 'checking' | 'authenticated' | 'unauthenticated',
  user: null as null | {
    id: string;
    username: string;
    role: 'admin' | 'member';
    status: 'active' | 'disabled';
    must_change_password: boolean;
  },
}));

const storageMocks = vi.hoisted(() => ({
  readRememberedLogin: vi.fn(() => ({ username: '', remember: false })),
  writeRememberedLogin: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}));

vi.mock('@renderer/assets/logos/brand/app.png', () => ({ default: 'logo.png' }));

vi.mock('@renderer/components/layout/AppLoader', () => ({
  default: () => <div data-testid='app-loader'>loading</div>,
}));

vi.mock('@renderer/components/settings/LanguageSwitcher', () => ({
  default: () => <div data-testid='language-switcher'>lang</div>,
}));

vi.mock('@icon-park/react', () => ({
  Lock: () => <span>lock</span>,
  User: () => <span>user</span>,
}));

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({
    status: authState.status,
    user: authState.user,
    login,
  }),
}));

vi.mock('@/renderer/hooks/context/AuthContext/authStorage', () => ({
  readRememberedLogin: storageMocks.readRememberedLogin,
  writeRememberedLogin: storageMocks.writeRememberedLogin,
}));

import LoginPage from '@/renderer/pages/login';

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.status = 'unauthenticated';
    authState.user = null;
    storageMocks.readRememberedLogin.mockReturnValue({ username: '', remember: false });
    login.mockResolvedValue({
      success: true,
      user: {
        id: 'u1',
        username: 'alice',
        role: 'member',
        status: 'active',
        must_change_password: false,
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('shows the app loader while auth status is checking', () => {
    authState.status = 'checking';
    render(<LoginPage />);
    expect(screen.getByTestId('app-loader')).toBeInTheDocument();
  });

  it('redirects authenticated users to the app shell', async () => {
    authState.status = 'authenticated';
    authState.user = {
      id: 'u1',
      username: 'alice',
      role: 'member',
      status: 'active',
      must_change_password: false,
    };

    render(<LoginPage />);

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/guid', { replace: true });
    });
  });

  it('redirects authenticated users who must change password', async () => {
    authState.status = 'authenticated';
    authState.user = {
      id: 'u1',
      username: 'alice',
      role: 'member',
      status: 'active',
      must_change_password: true,
    };

    render(<LoginPage />);

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/login/change-password', { replace: true });
    });
  });

  it('submits credentials and remembers the username on success', async () => {
    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText('login.usernamePlaceholder'), { target: { value: ' alice ' } });
    fireEvent.change(screen.getByPlaceholderText('login.passwordPlaceholder'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('login.submit'));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith({ username: 'alice', password: 'secret', remember: true });
    });
    expect(storageMocks.writeRememberedLogin).toHaveBeenCalledWith('alice', true);
    expect(navigate).toHaveBeenCalledWith('/guid', { replace: true });
  });

  it('routes first login password changes after a successful auth', async () => {
    login.mockResolvedValue({
      success: true,
      user: {
        id: 'u1',
        username: 'alice',
        role: 'member',
        status: 'active',
        must_change_password: true,
      },
    });

    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText('login.usernamePlaceholder'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByPlaceholderText('login.passwordPlaceholder'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByText('login.submit'));

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/login/change-password', { replace: true });
    });
  });

  it('maps invalid credentials to a visible error', async () => {
    login.mockResolvedValue({ success: false, code: 'invalidCredentials' });

    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText('login.usernamePlaceholder'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByPlaceholderText('login.passwordPlaceholder'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByText('login.submit'));

    expect(await screen.findByText('login.errors.invalidCredentials')).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('maps rate-limit and network failure codes', async () => {
    login.mockResolvedValueOnce({ success: false, code: 'tooManyAttempts' });

    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText('login.usernamePlaceholder'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByPlaceholderText('login.passwordPlaceholder'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByText('login.submit'));
    expect(await screen.findByText('login.errors.tooManyAttempts')).toBeInTheDocument();

    cleanup();
    login.mockResolvedValueOnce({ success: false, code: 'networkError' });
    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText('login.usernamePlaceholder'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByPlaceholderText('login.passwordPlaceholder'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByText('login.submit'));
    expect(await screen.findByText('login.errors.networkError')).toBeInTheDocument();
  });

  it('prefills the remembered username', async () => {
    storageMocks.readRememberedLogin.mockReturnValue({ username: 'remembered', remember: true });
    render(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('login.usernamePlaceholder')).toHaveValue('remembered');
    });
  });
});
