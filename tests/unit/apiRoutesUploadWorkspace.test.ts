/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDatabase } from '@process/services/database';

vi.mock('@process/services/database', () => ({
  getDatabase: vi.fn(),
}));

vi.mock('@process/initStorage', () => ({
  getSystemDir: vi.fn(() => ({
    cacheDir: '/tmp/aion-cache',
  })),
}));

import { resolveUploadWorkspace } from '@process/webserver/routes/apiRoutes';

describe('resolveUploadWorkspace', () => {
  const getConversation = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDatabase).mockResolvedValue({ getConversation } as never);
  });

  it('returns the stored conversation workspace when requested workspace matches', async () => {
    getConversation.mockReturnValue({
      success: true,
      data: {
        extra: {
          workspace: '/tmp/aion/workspace-1',
        },
      },
    });

    const resolved = await resolveUploadWorkspace('conv-1', '/tmp/aion/workspace-1');

    expect(resolved).toBe(path.resolve('/tmp/aion/workspace-1'));
    expect(getConversation).toHaveBeenCalledWith('conv-1');
  });

  it('allows uploads without a requested workspace and still uses the stored conversation workspace', async () => {
    getConversation.mockReturnValue({
      success: true,
      data: {
        extra: {
          workspace: '/tmp/aion/workspace-2',
        },
      },
    });

    await expect(resolveUploadWorkspace('conv-2')).resolves.toBe(path.resolve('/tmp/aion/workspace-2'));
  });

  it('rejects uploads when the requested workspace does not match the conversation workspace', async () => {
    getConversation.mockReturnValue({
      success: true,
      data: {
        extra: {
          workspace: '/tmp/aion/workspace-3',
        },
      },
    });

    await expect(resolveUploadWorkspace('conv-3', '/tmp/aion/other-workspace')).rejects.toThrow('Workspace mismatch');
  });

  it('rejects uploads when the conversation has no workspace', async () => {
    getConversation.mockReturnValue({
      success: true,
      data: {
        extra: {},
      },
    });

    await expect(resolveUploadWorkspace('conv-4')).rejects.toThrow('Conversation workspace not found');
  });
});
