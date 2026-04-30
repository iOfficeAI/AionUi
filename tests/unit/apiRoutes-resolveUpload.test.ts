/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import path from 'path';

// Mock dependencies before importing the module
vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      get: {
        invoke: vi.fn(),
      },
    },
  },
}));

vi.mock('@process/utils/initStorage', () => ({
  getSystemDir: vi.fn().mockReturnValue({ cacheDir: '/tmp/cache' }),
  ProcessConfig: {
    get: vi.fn().mockResolvedValue(false),
    set: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@process/webserver/auth/middleware/TokenMiddleware', () => ({
  TokenMiddleware: {
    validateToken: vi.fn().mockReturnValue((req: any, res: any, next: any) => next()),
  },
}));

// Import actual functions after mocks
import { resolveUploadWorkspace } from '../../src/process/webserver/routes/apiRoutes';
import { ipcBridge } from '@/common';

describe('apiRoutes - resolveUploadWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws error when conversationId is empty', async () => {
    await expect(resolveUploadWorkspace('', '/workspace')).rejects.toThrow('Missing conversation id');
  });

  it('throws error when conversationId is undefined-like', async () => {
    await expect(resolveUploadWorkspace('' as string, undefined)).rejects.toThrow('Missing conversation id');
  });

  it('throws error when conversation workspace not found', async () => {
    vi.mocked(ipcBridge.conversation.get.invoke).mockResolvedValue(null as never);

    await expect(resolveUploadWorkspace('conv-123', undefined)).rejects.toThrow('Conversation workspace not found');
  });

  it('throws error when conversation has no workspace', async () => {
    vi.mocked(ipcBridge.conversation.get.invoke).mockResolvedValue({ extra: {} } as never);

    await expect(resolveUploadWorkspace('conv-123', undefined)).rejects.toThrow('Conversation workspace not found');
  });

  it('throws workspace mismatch error when requested workspace differs', async () => {
    vi.mocked(ipcBridge.conversation.get.invoke).mockResolvedValue({
      extra: { workspace: '/actual/workspace' },
    } as never);

    await expect(resolveUploadWorkspace('conv-123', '/different/workspace')).rejects.toThrow('Workspace mismatch');
  });

  it('returns conversation workspace when no requested workspace', async () => {
    vi.mocked(ipcBridge.conversation.get.invoke).mockResolvedValue({
      extra: { workspace: '/actual/workspace' },
    } as never);

    const result = await resolveUploadWorkspace('conv-123', undefined);
    expect(result).toBe(path.resolve('/actual/workspace'));
  });

  it('returns resolved path when requested workspace matches conversation workspace', async () => {
    const workspace = '/home/user/workspace';
    vi.mocked(ipcBridge.conversation.get.invoke).mockResolvedValue({
      extra: { workspace },
    } as never);

    const result = await resolveUploadWorkspace('conv-123', workspace);
    expect(result).toBe(path.resolve(workspace));
  });

  it('handles relative paths in workspace', async () => {
    vi.mocked(ipcBridge.conversation.get.invoke).mockResolvedValue({
      extra: { workspace: './relative/path' },
    } as never);

    const result = await resolveUploadWorkspace('conv-123', undefined);
    expect(result).toBe(path.resolve('./relative/path'));
  });

  it('handles absolute paths in workspace', async () => {
    vi.mocked(ipcBridge.conversation.get.invoke).mockResolvedValue({
      extra: { workspace: '/absolute/path/to/workspace' },
    } as never);

    const result = await resolveUploadWorkspace('conv-123', undefined);
    expect(result).toBe(path.resolve('/absolute/path/to/workspace'));
  });

  it('calls getConversation with the conversationId', async () => {
    vi.mocked(ipcBridge.conversation.get.invoke).mockResolvedValue({
      extra: { workspace: '/workspace' },
    } as never);

    await resolveUploadWorkspace('test-conv-id', undefined);

    expect(ipcBridge.conversation.get.invoke).toHaveBeenCalledWith({ id: 'test-conv-id' });
  });
});
