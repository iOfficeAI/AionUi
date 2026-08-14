/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * @vitest-environment jsdom
 */

import { BackendHttpError } from '@/common/adapter/httpBridge';
import type { AdminUser } from '@/common/types/platform/auth';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const messageMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));

const modalConfirm = vi.hoisted(() => vi.fn());

const adminUsersMocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  updateUsername: vi.fn(),
  updateRole: vi.fn(),
  updateStatus: vi.fn(),
  resetPassword: vi.fn(),
  revokeSessions: vi.fn(),
}));

const authMocks = vi.hoisted(() => ({
  user: {
    id: 'admin-1',
    username: 'admin',
    role: 'admin' as const,
    status: 'active' as const,
    must_change_password: false,
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

vi.mock('@icon-park/react', () => ({
  Copy: () => <span>copy</span>,
  Plus: () => <span>plus</span>,
  Refresh: () => <span>refresh</span>,
  EditTwo: () => <span>edit</span>,
}));

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ user: authMocks.user }),
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  adminUsers: {
    list: { invoke: adminUsersMocks.list },
    create: { invoke: adminUsersMocks.create },
    updateUsername: { invoke: adminUsersMocks.updateUsername },
    updateRole: { invoke: adminUsersMocks.updateRole },
    updateStatus: { invoke: adminUsersMocks.updateStatus },
    resetPassword: { invoke: adminUsersMocks.resetPassword },
    revokeSessions: { invoke: adminUsersMocks.revokeSessions },
  },
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  // Keep the real Modal component (create/rename dialogs) and only stub confirm.
  actual.Modal.confirm = modalConfirm as typeof actual.Modal.confirm;
  return {
    ...actual,
    Message: {
      ...actual.Message,
      success: messageMocks.success,
      error: messageMocks.error,
      warning: messageMocks.warning,
    },
  };
});

import UsersPanel from '@/renderer/pages/settings/WebuiSettings/UsersPanel';

const memberUser: AdminUser = {
  id: 'user-2',
  username: 'bob',
  role: 'member',
  status: 'active',
  must_change_password: true,
  user_type: 'local',
  created_at: 1,
  updated_at: 1,
  last_login: null,
};

const adminUser: AdminUser = {
  id: 'admin-1',
  username: 'admin',
  role: 'admin',
  status: 'active',
  must_change_password: false,
  user_type: 'local',
  created_at: 1,
  updated_at: 1,
  last_login: 2,
};

function renderPanel() {
  return render(<UsersPanel />);
}

describe('UsersPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminUsersMocks.list.mockResolvedValue({ items: [adminUser, memberUser], total: 2 });
    modalConfirm.mockImplementation(({ onOk }: { onOk?: () => unknown }) => {
      void Promise.resolve(onOk?.());
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('loads and renders the admin user table', async () => {
    renderPanel();

    await waitFor(() => {
      expect(adminUsersMocks.list).toHaveBeenCalled();
    });
    expect(await screen.findByText('admin')).toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();
    expect(screen.getByText('settings.account.users.title')).toBeInTheDocument();
  });

  it('shows feature-unavailable state when admin APIs are missing', async () => {
    adminUsersMocks.list.mockRejectedValue(
      new BackendHttpError({
        method: 'GET',
        path: '/api/admin/users',
        status: 404,
        body: { code: 'NOT_FOUND', error: 'missing' },
      })
    );

    renderPanel();

    expect(await screen.findByText('settings.account.errors.featureUnavailable')).toBeInTheDocument();
    expect(screen.queryByText('bob')).not.toBeInTheDocument();
  });

  it('surfaces load errors without toasting rate-limit failures', async () => {
    adminUsersMocks.list.mockRejectedValue(
      new BackendHttpError({
        method: 'GET',
        path: '/api/admin/users',
        status: 429,
        body: { code: 'RATE_LIMITED', error: 'slow down' },
      })
    );

    renderPanel();

    expect(await screen.findByText('settings.account.errors.rateLimited')).toBeInTheDocument();
    expect(messageMocks.error).not.toHaveBeenCalled();
  });

  it('creates a member and reveals the temporary password', async () => {
    adminUsersMocks.create.mockResolvedValue({
      user: { ...memberUser, id: 'user-3', username: 'carol' },
      temporary_password: 'temp-secret-1',
    });
    adminUsersMocks.list.mockResolvedValueOnce({ items: [adminUser, memberUser], total: 2 }).mockResolvedValueOnce({
      items: [adminUser, memberUser, { ...memberUser, id: 'user-3', username: 'carol' }],
      total: 3,
    });

    renderPanel();
    await screen.findByText('bob');

    fireEvent.click(screen.getByText('settings.account.users.add'));
    const dialog = await screen.findByRole('dialog');
    const usernameInput = within(dialog).getByPlaceholderText('settings.account.users.usernamePlaceholder');
    fireEvent.change(usernameInput, { target: { value: 'carol' } });

    const okButtons = within(dialog).getAllByRole('button');
    const confirm = okButtons.find((btn) => btn.className.includes('arco-btn-primary'));
    expect(confirm).toBeTruthy();
    fireEvent.click(confirm!);

    await waitFor(() => {
      expect(adminUsersMocks.create).toHaveBeenCalledWith({ username: 'carol', role: 'member' });
    });
    expect(await screen.findByText('temp-secret-1')).toBeInTheDocument();
    expect(messageMocks.success).toHaveBeenCalledWith('settings.account.users.createSuccess');

    fireEvent.click(screen.getByText('common.copy'));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('temp-secret-1');
    });
  });

  it('toasts create failures from the backend', async () => {
    adminUsersMocks.create.mockRejectedValue(
      new BackendHttpError({
        method: 'POST',
        path: '/api/admin/users',
        status: 409,
        body: { code: 'USERNAME_TAKEN', error: 'taken' },
      })
    );

    renderPanel();
    await screen.findByText('bob');

    fireEvent.click(screen.getByText('settings.account.users.add'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByPlaceholderText('settings.account.users.usernamePlaceholder'), {
      target: { value: 'carol' },
    });
    const confirm = within(dialog)
      .getAllByRole('button')
      .find((btn) => btn.className.includes('arco-btn-primary'));
    fireEvent.click(confirm!);

    await waitFor(() => {
      expect(messageMocks.error).toHaveBeenCalledWith('settings.account.errors.usernameTaken');
    });
  });

  it('resets another user password through the confirm modal', async () => {
    adminUsersMocks.resetPassword.mockResolvedValue({
      user: { ...memberUser, must_change_password: true },
      temporary_password: 'reset-pass',
    });

    renderPanel();
    await screen.findByText('bob');

    // Row 0 is the current admin (actions disabled); row 1 is the member target.
    fireEvent.click(screen.getAllByText('settings.account.users.resetPassword')[1]);

    await waitFor(() => {
      expect(adminUsersMocks.resetPassword).toHaveBeenCalledWith({ id: 'user-2' });
    });
    expect(await screen.findByText('reset-pass')).toBeInTheDocument();
    expect(messageMocks.success).toHaveBeenCalledWith('settings.account.users.resetSuccess');
  });

  it('revokes sessions for another user', async () => {
    adminUsersMocks.revokeSessions.mockResolvedValue({ ...memberUser, updated_at: 9 });

    renderPanel();
    await screen.findByText('bob');

    fireEvent.click(screen.getAllByText('settings.account.users.revokeSessions')[1]);

    await waitFor(() => {
      expect(adminUsersMocks.revokeSessions).toHaveBeenCalledWith({ id: 'user-2' });
    });
    expect(messageMocks.success).toHaveBeenCalledWith('settings.account.users.revokeSuccess');
  });
});
