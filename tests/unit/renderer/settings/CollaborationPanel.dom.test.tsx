/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * @vitest-environment jsdom
 */

import { BackendHttpError } from '@/common/adapter/httpBridge';
import type { ShareRecord } from '@/common/types/platform/share';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const messageMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));

const modalConfirm = vi.hoisted(() => vi.fn());

const shareMocks = vi.hoisted(() => ({
  listReceived: vi.fn(),
  listGranted: vi.fn(),
  revoke: vi.fn(),
}));

const modeMocks = vi.hoisted(() => ({
  listProviders: vi.fn(),
}));

const httpRequest = vi.hoisted(() => vi.fn());

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { name?: string; username?: string }) => {
      if (opts?.name) return `${key}:${opts.name}`;
      if (opts?.username) return `${key}:${opts.username}`;
      return key;
    },
  }),
}));

vi.mock('@icon-park/react', () => ({
  Refresh: () => <span>refresh</span>,
  Share: () => <span>share</span>,
  Delete: () => <span>delete</span>,
}));

vi.mock('@/common/adapter/httpBridge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/common/adapter/httpBridge')>();
  return {
    ...actual,
    httpRequest,
  };
});

vi.mock('@/common/adapter/ipcBridge', () => ({
  shares: {
    listReceived: { invoke: shareMocks.listReceived },
    listGranted: { invoke: shareMocks.listGranted },
    revoke: { invoke: shareMocks.revoke },
    listForResource: { invoke: vi.fn(async () => ({ items: [] })) },
    create: { invoke: vi.fn() },
  },
  mode: {
    listProviders: { invoke: modeMocks.listProviders },
  },
  userDirectory: {
    list: { invoke: vi.fn(async () => ({ items: [] })) },
  },
}));

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'admin-1', username: 'admin', role: 'admin', status: 'active', must_change_password: false },
  }),
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
      warning: messageMocks.warning,
    },
  };
});

import CollaborationPanel from '@/renderer/pages/settings/WebuiSettings/CollaborationPanel';

const receivedShare: ShareRecord = {
  id: 'recv-1',
  resource_type: 'conversation',
  resource_id: 'conv-9',
  resource_name: 'Shared chat',
  permission: 'view',
  owner_user_id: 'user-9',
  owner_username: 'alice',
  grantee_user_id: 'admin-1',
  grantee_username: 'admin',
  created_at: 1,
};

const grantedShare: ShareRecord = {
  id: 'grant-1',
  resource_type: 'provider',
  resource_id: 'prov-1',
  resource_name: 'OpenAI',
  permission: 'edit',
  owner_user_id: 'admin-1',
  owner_username: 'admin',
  grantee_user_id: 'user-2',
  grantee_username: 'bob',
  created_at: 2,
};

describe('CollaborationPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shareMocks.listReceived.mockResolvedValue({ items: [receivedShare] });
    shareMocks.listGranted.mockResolvedValue({ items: [grantedShare] });
    modeMocks.listProviders.mockResolvedValue([{ id: 'prov-1', name: 'OpenAI', platform: 'openai' }]);
    httpRequest.mockResolvedValue({
      items: [
        { id: 'conv-1', name: 'My chat', project_id: 'proj-1' },
        { id: 'conv-2', name: 'Other', project_id: 'proj-1' },
      ],
    });
    modalConfirm.mockImplementation(({ onOk }: { onOk?: () => unknown }) => {
      void Promise.resolve(onOk?.());
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('loads received shares and resource pickers on mount', async () => {
    render(<CollaborationPanel />);

    expect(await screen.findByText('Shared chat')).toBeInTheDocument();
    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(shareMocks.listReceived).toHaveBeenCalled();
    expect(shareMocks.listGranted).toHaveBeenCalled();
    expect(httpRequest).toHaveBeenCalledWith('GET', '/api/conversations?limit=100');
  });

  it('shows granted shares when switching tabs', async () => {
    render(<CollaborationPanel />);
    await screen.findByText('Shared chat');

    fireEvent.click(screen.getByText('settings.account.collaboration.tabs.granted'));

    expect(await screen.findByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();
    expect(screen.getByText('settings.account.collaboration.permissions.edit')).toBeInTheDocument();
  });

  it('warns when sharing without a selected resource', async () => {
    render(<CollaborationPanel />);
    await screen.findByText('Shared chat');

    fireEvent.click(screen.getByText('settings.account.collaboration.shareWithUser'));

    expect(messageMocks.warning).toHaveBeenCalledWith('settings.account.collaboration.pickResource');
  });

  it('opens the share dialog after a resource is selected', async () => {
    render(<CollaborationPanel />);
    await screen.findByText('Shared chat');

    const comboboxes = screen.getAllByRole('combobox');
    // Second select is the resource picker.
    fireEvent.click(comboboxes[1]);
    fireEvent.click(await screen.findByText('My chat'));

    fireEvent.click(screen.getByText('settings.account.collaboration.shareWithUser'));

    expect(await screen.findByText('settings.account.collaboration.shareDialog.title:My chat')).toBeInTheDocument();
  });

  it('revokes a granted share from the granted table', async () => {
    shareMocks.revoke.mockResolvedValue(undefined);
    shareMocks.listGranted.mockResolvedValueOnce({ items: [grantedShare] }).mockResolvedValueOnce({ items: [] });

    render(<CollaborationPanel />);
    await screen.findByText('Shared chat');
    fireEvent.click(screen.getByText('settings.account.collaboration.tabs.granted'));
    await screen.findByText('bob');

    fireEvent.click(screen.getByText('settings.account.collaboration.revoke'));

    await waitFor(() => {
      expect(shareMocks.revoke).toHaveBeenCalledWith({ id: 'grant-1' });
    });
    expect(messageMocks.success).toHaveBeenCalledWith('settings.account.collaboration.revokeSuccess');
  });

  it('shows feature unavailable when share endpoints are missing', async () => {
    shareMocks.listReceived.mockRejectedValue(
      new BackendHttpError({
        method: 'GET',
        path: '/api/shares/received',
        status: 404,
        body: { code: 'NOT_FOUND', error: 'missing' },
      })
    );

    render(<CollaborationPanel />);

    expect(await screen.findByText('settings.account.collaboration.errors.featureUnavailable')).toBeInTheDocument();
  });

  it('surfaces non-unavailable load errors', async () => {
    shareMocks.listReceived.mockRejectedValue(
      new BackendHttpError({
        method: 'GET',
        path: '/api/shares/received',
        status: 500,
        body: { code: 'FAILED', error: 'boom' },
      })
    );

    render(<CollaborationPanel />);

    expect(await screen.findByText('settings.account.collaboration.errors.failed')).toBeInTheDocument();
  });
});
