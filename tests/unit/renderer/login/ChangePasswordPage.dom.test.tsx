/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * @vitest-environment jsdom
 */

import { BackendHttpError } from '@/common/adapter/httpBridge';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const navigate = vi.hoisted(() => vi.fn());
const logout = vi.hoisted(() => vi.fn(async () => undefined));
const changePassword = vi.hoisted(() => vi.fn());
const messageMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

const authState = vi.hoisted(() => ({
  status: 'authenticated' as 'checking' | 'authenticated' | 'unauthenticated',
  user: {
    id: 'u1',
    username: 'alice',
    role: 'member' as const,
    status: 'active' as const,
    must_change_password: true,
  } as null | {
    id: string;
    username: string;
    role: 'admin' | 'member';
    status: 'active' | 'disabled';
    must_change_password: boolean;
  },
}));

const locationState = vi.hoisted(() => ({
  state: null as null | { returnTo?: string },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
  useLocation: () => ({ state: locationState.state }),
  Navigate: ({ to }: { to: string }) => <div data-testid='navigate' data-to={to} />,
}));

vi.mock('@renderer/assets/logos/brand/app.png', () => ({ default: 'logo.png' }));

vi.mock('@renderer/components/layout/AppLoader', () => ({
  default: () => <div data-testid='app-loader'>loading</div>,
}));

vi.mock('@icon-park/react', () => ({
  Lock: () => <span>lock</span>,
}));

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({
    status: authState.status,
    user: authState.user,
    changePassword,
    logout,
  }),
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: {
      ...actual.Message,
      useMessage: () => [
        {
          success: messageMocks.success,
          error: messageMocks.error,
        },
        null,
      ],
    },
  };
});

import ChangePasswordPage from '@/renderer/pages/login/ChangePasswordPage';

describe('ChangePasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    locationState.state = null;
    authState.status = 'authenticated';
    authState.user = {
      id: 'u1',
      username: 'alice',
      role: 'member',
      status: 'active',
      must_change_password: true,
    };
    changePassword.mockResolvedValue({
      id: 'u1',
      username: 'alice',
      role: 'member',
      status: 'active',
      must_change_password: false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('shows the loader while auth is checking', () => {
    authState.status = 'checking';
    render(<ChangePasswordPage />);
    expect(screen.getByTestId('app-loader')).toBeInTheDocument();
  });

  it('redirects unauthenticated visitors to login', () => {
    authState.status = 'unauthenticated';
    authState.user = null;
    render(<ChangePasswordPage />);
    expect(screen.getByTestId('navigate')).toHaveAttribute('data-to', '/login');
  });

  it('shows the forced password-change notice for admin-created members', () => {
    render(<ChangePasswordPage />);
    expect(screen.getByText('login.changePassword.forcedNotice')).toBeInTheDocument();
    expect(screen.getByText('login.changePassword.signOut')).toBeInTheDocument();
  });

  it('submits a password change and navigates to the default return path', async () => {
    render(<ChangePasswordPage />);

    fireEvent.change(screen.getByPlaceholderText('login.changePassword.currentPasswordPlaceholder'), {
      target: { value: 'old-pass-1' },
    });
    fireEvent.change(screen.getByPlaceholderText('login.changePassword.newPasswordPlaceholder'), {
      target: { value: 'new-pass-12' },
    });
    fireEvent.change(screen.getByPlaceholderText('login.changePassword.confirmPasswordPlaceholder'), {
      target: { value: 'new-pass-12' },
    });
    fireEvent.click(screen.getByText('login.changePassword.submit'));

    await waitFor(() => {
      expect(changePassword).toHaveBeenCalledWith({
        currentPassword: 'old-pass-1',
        newPassword: 'new-pass-12',
      });
    });
    expect(messageMocks.success).toHaveBeenCalledWith('login.changePassword.success');
    expect(navigate).toHaveBeenCalledWith('/guid', { replace: true });
  });

  it('honors a safe returnTo path from location state', async () => {
    authState.user = { ...authState.user!, must_change_password: false };
    locationState.state = { returnTo: '/settings/webui' };

    render(<ChangePasswordPage />);
    fireEvent.change(screen.getByPlaceholderText('login.changePassword.currentPasswordPlaceholder'), {
      target: { value: 'old-pass-1' },
    });
    fireEvent.change(screen.getByPlaceholderText('login.changePassword.newPasswordPlaceholder'), {
      target: { value: 'new-pass-12' },
    });
    fireEvent.change(screen.getByPlaceholderText('login.changePassword.confirmPasswordPlaceholder'), {
      target: { value: 'new-pass-12' },
    });
    fireEvent.click(screen.getByText('login.changePassword.submit'));

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/settings/webui', { replace: true });
    });
  });

  it('maps known backend password errors', async () => {
    changePassword.mockRejectedValue(
      new BackendHttpError({
        method: 'POST',
        path: '/api/auth/change-password',
        status: 400,
        body: { code: 'INVALID_CURRENT_PASSWORD', error: 'bad' },
      })
    );

    render(<ChangePasswordPage />);
    fireEvent.change(screen.getByPlaceholderText('login.changePassword.currentPasswordPlaceholder'), {
      target: { value: 'old-pass-1' },
    });
    fireEvent.change(screen.getByPlaceholderText('login.changePassword.newPasswordPlaceholder'), {
      target: { value: 'new-pass-12' },
    });
    fireEvent.change(screen.getByPlaceholderText('login.changePassword.confirmPasswordPlaceholder'), {
      target: { value: 'new-pass-12' },
    });
    fireEvent.click(screen.getByText('login.changePassword.submit'));

    await waitFor(() => {
      expect(messageMocks.error).toHaveBeenCalledWith('login.changePassword.errors.invalidCurrent');
    });
  });

  it('signs out from the forced-change screen', async () => {
    render(<ChangePasswordPage />);
    fireEvent.click(screen.getByText('login.changePassword.signOut'));
    await waitFor(() => {
      expect(logout).toHaveBeenCalled();
    });
  });
});
