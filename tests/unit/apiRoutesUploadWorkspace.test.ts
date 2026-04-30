/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcBridge } from '@/common';

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      get: {
        invoke: vi.fn(),
      },
    },
  },
}));

vi.mock('@process/initStorage', () => ({
  getSystemDir: vi.fn(() => ({
    cacheDir: '/tmp/aion-cache',
  })),
}));

import { resolveUploadWorkspace } from '@process/webserver/routes/apiRoutes';

describe('resolveUploadWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the stored conversation workspace when requested workspace matches', async () => {
    vi.mocked(ipcBridge.conversation.get.invoke).mockResolvedValue({
      extra: {
        workspace: '/tmp/aion/workspace-1',
      },
    } as never);

    const resolved = await resolveUploadWorkspace('conv-1', '/tmp/aion/workspace-1');

    expect(resolved).toBe(path.resolve('/tmp/aion/workspace-1'));
    expect(ipcBridge.conversation.get.invoke).toHaveBeenCalledWith({ id: 'conv-1' });
  });

  it('allows uploads without a requested workspace and still uses the stored conversation workspace', async () => {
    vi.mocked(ipcBridge.conversation.get.invoke).mockResolvedValue({
      extra: {
        workspace: '/tmp/aion/workspace-2',
      },
    } as never);

    await expect(resolveUploadWorkspace('conv-2')).resolves.toBe(path.resolve('/tmp/aion/workspace-2'));
  });

  it('rejects uploads when the requested workspace does not match the conversation workspace', async () => {
    vi.mocked(ipcBridge.conversation.get.invoke).mockResolvedValue({
      extra: {
        workspace: '/tmp/aion/workspace-3',
      },
    } as never);

    await expect(resolveUploadWorkspace('conv-3', '/tmp/aion/other-workspace')).rejects.toThrow('Workspace mismatch');
  });

  it('rejects uploads when the conversation has no workspace', async () => {
    vi.mocked(ipcBridge.conversation.get.invoke).mockResolvedValue({ extra: {} } as never);

    await expect(resolveUploadWorkspace('conv-4')).rejects.toThrow('Conversation workspace not found');
  });
});
