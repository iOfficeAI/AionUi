/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * @vitest-environment jsdom
 */

import { BackendHttpError } from '@/common/adapter/httpBridge';
import type { AdminAuditEntry } from '@/common/types/platform/auth';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const messageError = vi.hoisted(() => vi.fn());
const adminAuditMocks = vi.hoisted(() => ({
  list: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

vi.mock('@icon-park/react', () => ({
  Refresh: () => <span>refresh</span>,
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  adminAudit: {
    list: { invoke: adminAuditMocks.list },
  },
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: {
      ...actual.Message,
      error: messageError,
    },
  };
});

import AuditPanel from '@/renderer/pages/settings/WebuiSettings/AuditPanel';

const entryA: AdminAuditEntry = {
  id: 'audit-1',
  occurred_at: Date.UTC(2026, 0, 2, 12, 0, 0),
  actor_user_id: 'admin-1',
  actor_username: 'admin',
  action: 'user.created',
  target_user_id: 'user-2',
  target_username: 'bob',
  details: {},
};

const entryB: AdminAuditEntry = {
  id: 'audit-2',
  occurred_at: Date.UTC(2026, 0, 3, 12, 0, 0),
  actor_user_id: null,
  actor_username: null,
  action: 'bootstrap.credentials_set',
  target_user_id: null,
  target_username: null,
  details: {},
};

describe('AuditPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminAuditMocks.list.mockResolvedValue({ items: [entryA], next_cursor: 'cursor-2' });
  });

  afterEach(() => {
    cleanup();
  });

  it('loads audit rows and maps known action labels', async () => {
    render(<AuditPanel />);

    await waitFor(() => {
      expect(adminAuditMocks.list).toHaveBeenCalledWith({ cursor: undefined, limit: 50 });
    });
    expect(await screen.findByText('admin')).toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();
    expect(screen.getByText('settings.account.audit.actions.userCreated')).toBeInTheDocument();
  });

  it('appends the next page when load more is clicked', async () => {
    adminAuditMocks.list
      .mockResolvedValueOnce({ items: [entryA], next_cursor: 'cursor-2' })
      .mockResolvedValueOnce({ items: [entryB], next_cursor: null });

    render(<AuditPanel />);
    await screen.findByText('bob');

    fireEvent.click(screen.getByText('settings.account.audit.loadMore'));

    await waitFor(() => {
      expect(adminAuditMocks.list).toHaveBeenLastCalledWith({ cursor: 'cursor-2', limit: 50 });
    });
    expect(await screen.findByText('settings.account.audit.actions.bootstrapCredentialsSet')).toBeInTheDocument();
    expect(screen.getByText('common.system')).toBeInTheDocument();
    expect(screen.queryByText('settings.account.audit.loadMore')).not.toBeInTheDocument();
  });

  it('shows feature unavailable when the audit API is missing', async () => {
    adminAuditMocks.list.mockRejectedValue(
      new BackendHttpError({
        method: 'GET',
        path: '/api/admin/audit',
        status: 404,
        body: { code: 'NOT_FOUND', error: 'missing' },
      })
    );

    render(<AuditPanel />);

    expect(await screen.findByText('settings.account.errors.featureUnavailable')).toBeInTheDocument();
  });

  it('shows load errors and toasts non-rate-limit failures', async () => {
    adminAuditMocks.list.mockRejectedValue(
      new BackendHttpError({
        method: 'GET',
        path: '/api/admin/audit',
        status: 500,
        body: { code: 'FAILED', error: 'boom' },
      })
    );

    render(<AuditPanel />);

    expect(await screen.findByText('settings.account.errors.failed')).toBeInTheDocument();
    expect(messageError).toHaveBeenCalledWith('settings.account.errors.failed');
  });
});
