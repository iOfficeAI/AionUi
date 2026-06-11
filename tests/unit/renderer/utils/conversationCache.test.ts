/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendHttpError } from '@/common/adapter/httpBridge';
import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import { mutate } from 'swr';
import { getConversationOrNull, refreshConversationCache } from '@/renderer/pages/conversation/utils/conversationCache';

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      get: {
        invoke: vi.fn(),
      },
    },
  },
}));

vi.mock('swr', () => ({
  mutate: vi.fn(),
}));

const mockConversation = {
  id: 'conv-1',
  name: 'Test conversation',
  type: 'acp',
  status: 'finished',
  extra: {},
} as TChatConversation;

describe('conversationCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getConversationOrNull', () => {
    it('returns null when the backend reports a missing conversation', async () => {
      const error = new BackendHttpError({
        method: 'GET',
        path: '/api/conversations/missing',
        status: 404,
        body: {
          success: false,
          error: 'Not found: Conversation missing not found',
          code: 'NOT_FOUND',
        },
      });
      vi.mocked(ipcBridge.conversation.get.invoke).mockRejectedValue(error);

      await expect(getConversationOrNull('missing')).resolves.toBeNull();
    });

    it('returns the conversation when the backend lookup succeeds', async () => {
      vi.mocked(ipcBridge.conversation.get.invoke).mockResolvedValue(mockConversation);

      await expect(getConversationOrNull('conv-1')).resolves.toBe(mockConversation);
    });

    it('rethrows non-404 backend errors so database failures remain visible', async () => {
      const error = new BackendHttpError({
        method: 'GET',
        path: '/api/conversations/conv-1',
        status: 500,
        body: {
          success: false,
          error: 'Internal error: Database error: no such table: conversations',
          code: 'INTERNAL_ERROR',
        },
      });
      vi.mocked(ipcBridge.conversation.get.invoke).mockRejectedValue(error);

      await expect(getConversationOrNull('conv-1')).rejects.toBe(error);
    });
  });

  describe('refreshConversationCache', () => {
    it('skips cache mutation when the conversation is missing', async () => {
      const error = new BackendHttpError({
        method: 'GET',
        path: '/api/conversations/missing',
        status: 404,
        body: {
          success: false,
          error: 'Not found: Conversation missing not found',
          code: 'NOT_FOUND',
        },
      });
      vi.mocked(ipcBridge.conversation.get.invoke).mockRejectedValue(error);

      await expect(refreshConversationCache('missing')).resolves.toBeUndefined();

      expect(mutate).not.toHaveBeenCalled();
    });

    it('rethrows non-404 backend errors instead of hiding them', async () => {
      const error = new BackendHttpError({
        method: 'GET',
        path: '/api/conversations/conv-1',
        status: 500,
        body: {
          success: false,
          error: 'Internal error: Database error: no such table: conversations',
          code: 'INTERNAL_ERROR',
        },
      });
      vi.mocked(ipcBridge.conversation.get.invoke).mockRejectedValue(error);

      await expect(refreshConversationCache('conv-1')).rejects.toBe(error);

      expect(mutate).not.toHaveBeenCalled();
    });
  });
});
