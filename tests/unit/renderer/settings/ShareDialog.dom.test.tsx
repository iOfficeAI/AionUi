/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * @vitest-environment jsdom
 */

import { BackendHttpError } from '@/common/adapter/httpBridge';
import type { ShareRecord } from '@/common/types/platform/share';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const messageMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

const modalConfirm = vi.hoisted(() => vi.fn());

const shareMocks = vi.hoisted(() => ({
  listForResource: vi.fn(),
  create: vi.fn(),
  revoke: vi.fn(),
}));

const directoryMocks = vi.hoisted(() => ({
  list: vi.fn(),
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
  useTranslation: () => ({ t: (key: string, opts?: { name?: string }) => (opts?.name ? `${key}:${opts.name}` : key) }),
}));

vi.mock('@icon-park/react', () => ({
  Delete: () => <span>delete</span>,
  Refresh: () => <span>refresh</span>,
}));

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ user: authMocks.user }),
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  shares: {
    listForResource: { invoke: shareMocks.listForResource },
    create: { invoke: shareMocks.create },
    revoke: { invoke: shareMocks.revoke },
  },
  userDirectory: {
    list: { invoke: directoryMocks.list },
  },
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  actual.Modal.confirm = modalConfirm as typeof actual.Modal.confirm;
  return {
    ...actual,
    Message: {
      ...actual.Message,
      success: messageMocks.success,
      error: messageMocks.error,
    },
  };
});

import ShareDialog from '@/renderer/pages/settings/WebuiSettings/ShareDialog';

const existingShare: ShareRecord = {
  id: 'share-1',
  resource_type: 'conversation',
  resource_id: 'conv-1',
  resource_name: 'Plan',
  permission: 'view',
  owner_user_id: 'admin-1',
  owner_username: 'admin',
  grantee_user_id: 'user-2',
  grantee_username: 'bob',
  created_at: 1,
};

function renderDialog(onChanged = vi.fn(), onClose = vi.fn()) {
  return render(
    <ShareDialog
      visible
      resourceType='conversation'
      resourceId='conv-1'
      resourceName='Plan'
      onClose={onClose}
      onChanged={onChanged}
    />
  );
}

describe('ShareDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    directoryMocks.list.mockResolvedValue({
      items: [
        { id: 'admin-1', username: 'admin' },
        { id: 'user-2', username: 'bob' },
        { id: 'user-3', username: 'carol' },
      ],
    });
    shareMocks.listForResource.mockResolvedValue({ items: [existingShare] });
    modalConfirm.mockImplementation(({ onOk }: { onOk?: () => unknown }) => {
      void Promise.resolve(onOk?.());
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('loads directory users and existing grants, excluding the current user', async () => {
    renderDialog();

    await waitFor(() => {
      expect(directoryMocks.list).toHaveBeenCalled();
      expect(shareMocks.listForResource).toHaveBeenCalledWith({
        resource_type: 'conversation',
        resource_id: 'conv-1',
      });
    });

    expect(await screen.findByText('bob')).toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    // Permission label appears in both the grant form Select and the existing-shares table.
    expect(within(dialog).getAllByText('settings.account.collaboration.permissions.view').length).toBeGreaterThan(0);
    expect(within(dialog).getByText('settings.account.collaboration.shareDialog.existing')).toBeInTheDocument();
  });

  it('shows feature unavailable when share APIs are missing', async () => {
    shareMocks.listForResource.mockRejectedValue(
      new BackendHttpError({
        method: 'GET',
        path: '/api/shares',
        status: 404,
        body: { code: 'NOT_FOUND', error: 'missing' },
      })
    );

    renderDialog();

    expect(await screen.findByText('settings.account.collaboration.errors.featureUnavailable')).toBeInTheDocument();
  });

  it('grants a share and notifies the parent', async () => {
    const onChanged = vi.fn();
    shareMocks.create.mockResolvedValue(existingShare);
    shareMocks.listForResource.mockResolvedValueOnce({ items: [] }).mockResolvedValueOnce({ items: [existingShare] });

    renderDialog(onChanged);
    await waitFor(() => expect(directoryMocks.list).toHaveBeenCalled());

    // Open the user select and pick carol.
    const dialog = screen.getByRole('dialog');
    const selects = within(dialog).getAllByRole('combobox');
    fireEvent.click(selects[0]);
    const carolOption = await screen.findByText('carol');
    fireEvent.click(carolOption);

    fireEvent.click(within(dialog).getByText('settings.account.collaboration.shareDialog.grant'));

    await waitFor(() => {
      expect(shareMocks.create).toHaveBeenCalledWith({
        resource_type: 'conversation',
        resource_id: 'conv-1',
        grantee_username: 'carol',
        permission: 'view',
      });
    });
    expect(messageMocks.success).toHaveBeenCalledWith('settings.account.collaboration.shareDialog.grantSuccess');
    expect(onChanged).toHaveBeenCalled();
  });

  it('toasts grant failures from the backend', async () => {
    shareMocks.create.mockRejectedValue(
      new BackendHttpError({
        method: 'POST',
        path: '/api/shares',
        status: 409,
        body: { code: 'SHARE_EXISTS', error: 'exists' },
      })
    );
    shareMocks.listForResource.mockResolvedValue({ items: [] });

    renderDialog();
    await waitFor(() => expect(directoryMocks.list).toHaveBeenCalled());

    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getAllByRole('combobox')[0]);
    fireEvent.click(await screen.findByText('carol'));
    fireEvent.click(within(dialog).getByText('settings.account.collaboration.shareDialog.grant'));

    await waitFor(() => {
      expect(messageMocks.error).toHaveBeenCalledWith('settings.account.collaboration.errors.alreadyShared');
    });
  });

  it('revokes an existing share through the confirm path', async () => {
    const onChanged = vi.fn();
    shareMocks.revoke.mockResolvedValue(undefined);
    shareMocks.listForResource.mockResolvedValueOnce({ items: [existingShare] }).mockResolvedValueOnce({ items: [] });

    renderDialog(onChanged);
    const bobCell = await screen.findByText('bob');
    const row = bobCell.closest('tr');
    expect(row).toBeTruthy();
    fireEvent.click(within(row as HTMLElement).getByText('settings.account.collaboration.revoke'));

    await waitFor(() => {
      expect(shareMocks.revoke).toHaveBeenCalledWith({ id: 'share-1' });
    });
    expect(messageMocks.success).toHaveBeenCalledWith('settings.account.collaboration.revokeSuccess');
    expect(onChanged).toHaveBeenCalled();
  });
});
