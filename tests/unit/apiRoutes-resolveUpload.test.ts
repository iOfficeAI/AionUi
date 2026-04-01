/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import path from 'path';

// Mock dependencies before importing the module
vi.mock('@process/services/database', () => ({
  getDatabase: vi.fn(),
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
import { getDatabase } from '@process/services/database';

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
    const mockDb = {
      getConversation: vi.fn().mockReturnValue({
        success: false,
        data: null,
      }),
    };
    vi.mocked(getDatabase).mockResolvedValue(mockDb as any);

    await expect(resolveUploadWorkspace('conv-123', undefined)).rejects.toThrow('Conversation workspace not found');
  });

  it('throws error when conversation has no workspace', async () => {
    const mockDb = {
      getConversation: vi.fn().mockReturnValue({
        success: true,
        data: { extra: {} },
      }),
    };
    vi.mocked(getDatabase).mockResolvedValue(mockDb as any);

    await expect(resolveUploadWorkspace('conv-123', undefined)).rejects.toThrow('Conversation workspace not found');
  });

  it('throws workspace mismatch error when requested workspace differs', async () => {
    const mockDb = {
      getConversation: vi.fn().mockReturnValue({
        success: true,
        data: {
          extra: { workspace: '/actual/workspace' },
        },
      }),
    };
    vi.mocked(getDatabase).mockResolvedValue(mockDb as any);

    await expect(resolveUploadWorkspace('conv-123', '/different/workspace')).rejects.toThrow('Workspace mismatch');
  });

  it('returns conversation workspace when no requested workspace', async () => {
    const mockDb = {
      getConversation: vi.fn().mockReturnValue({
        success: true,
        data: {
          extra: { workspace: '/actual/workspace' },
        },
      }),
    };
    vi.mocked(getDatabase).mockResolvedValue(mockDb as any);

    const result = await resolveUploadWorkspace('conv-123', undefined);
    expect(result).toBe(path.resolve('/actual/workspace'));
  });

  it('returns resolved path when requested workspace matches conversation workspace', async () => {
    const workspace = '/home/user/workspace';
    const mockDb = {
      getConversation: vi.fn().mockReturnValue({
        success: true,
        data: {
          extra: { workspace },
        },
      }),
    };
    vi.mocked(getDatabase).mockResolvedValue(mockDb as any);

    const result = await resolveUploadWorkspace('conv-123', workspace);
    expect(result).toBe(path.resolve(workspace));
  });

  it('handles relative paths in workspace', async () => {
    const mockDb = {
      getConversation: vi.fn().mockReturnValue({
        success: true,
        data: {
          extra: { workspace: './relative/path' },
        },
      }),
    };
    vi.mocked(getDatabase).mockResolvedValue(mockDb as any);

    const result = await resolveUploadWorkspace('conv-123', undefined);
    expect(result).toBe(path.resolve('./relative/path'));
  });

  it('handles absolute paths in workspace', async () => {
    const mockDb = {
      getConversation: vi.fn().mockReturnValue({
        success: true,
        data: {
          extra: { workspace: '/absolute/path/to/workspace' },
        },
      }),
    };
    vi.mocked(getDatabase).mockResolvedValue(mockDb as any);

    const result = await resolveUploadWorkspace('conv-123', undefined);
    expect(result).toBe(path.resolve('/absolute/path/to/workspace'));
  });

  it('calls getConversation with the conversationId', async () => {
    const mockDb = {
      getConversation: vi.fn().mockReturnValue({
        success: true,
        data: {
          extra: { workspace: '/workspace' },
        },
      }),
    };
    vi.mocked(getDatabase).mockResolvedValue(mockDb as any);

    await resolveUploadWorkspace('test-conv-id', undefined);

    expect(mockDb.getConversation).toHaveBeenCalledWith('test-conv-id');
  });
});
