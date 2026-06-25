/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcBridge } from '@/common';
import { useAutoTitle } from '@/renderer/hooks/chat/useAutoTitle';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import {
  loadAllConversationMessagesPaged,
  loadLatestConversationMessages,
} from '@/renderer/utils/chat/messagePagination';
import { emitter } from '@/renderer/utils/emitter';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      update: {
        invoke: vi.fn(),
      },
    },
  },
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  getConversationOrNull: vi.fn(),
}));

vi.mock('@/renderer/utils/chat/messagePagination', () => ({
  DEFAULT_MESSAGE_PAGE_LIMIT: 50,
  loadAllConversationMessagesPaged: vi.fn(),
  loadLatestConversationMessages: vi.fn(),
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: {
    emit: vi.fn(),
  },
}));

const updateConversation = vi.mocked(ipcBridge.conversation.update.invoke);
const getConversation = vi.mocked(getConversationOrNull);
const loadAllMessages = vi.mocked(loadAllConversationMessagesPaged);
const loadLatestMessages = vi.mocked(loadLatestConversationMessages);
const emit = vi.mocked(emitter.emit);

describe('useAutoTitle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getConversation.mockResolvedValue({
      id: 'conversation-1',
      name: 'conversation.welcome.newConversation',
    } as Awaited<ReturnType<typeof getConversationOrNull>>);
    loadAllMessages.mockResolvedValue([]);
    loadLatestMessages.mockResolvedValue({
      items: [],
      oldest_cursor: null,
      newest_cursor: null,
      has_more_before: false,
      has_more_after: false,
    });
    updateConversation.mockResolvedValue(true);
  });

  it('uses the default latest compact message window when syncing a default title', async () => {
    const { result } = renderHook(() => useAutoTitle());

    await act(async () => {
      await result.current.syncTitleFromHistory('conversation-1', 'Fallback title');
    });

    expect(loadLatestMessages).toHaveBeenCalledWith('conversation-1', {
      limit: 50,
      contentMode: 'compact',
    });
    expect(loadAllMessages).not.toHaveBeenCalled();
    expect(updateConversation).toHaveBeenCalledWith({
      id: 'conversation-1',
      updates: { name: 'Fallback title' },
    });
    expect(emit).toHaveBeenCalledWith('chat.history.refresh');
  });
});
