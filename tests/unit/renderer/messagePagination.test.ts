/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcBridge } from '@/common';
import {
  loadAllConversationMessagesPaged,
  loadConversationAnchorWindow,
  loadLatestConversationMessages,
} from '@/renderer/utils/chat/messagePagination';

vi.mock('@/common', () => ({
  ipcBridge: {
    database: {
      getConversationMessages: {
        invoke: vi.fn(),
      },
    },
  },
}));

const invoke = vi.mocked(ipcBridge.database.getConversationMessages.invoke);

describe('message pagination helpers', () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it('loads the latest compact page with cursor params', async () => {
    invoke.mockResolvedValue({
      items: [],
      oldest_cursor: null,
      newest_cursor: null,
      has_more_before: false,
      has_more_after: false,
    });

    await loadLatestConversationMessages('conversation-1', { limit: 25, contentMode: 'compact' });

    expect(invoke).toHaveBeenCalledWith({
      conversation_id: 'conversation-1',
      limit: 25,
      content_mode: 'compact',
    });
  });

  it('walks older pages and returns all messages in display order', async () => {
    invoke
      .mockResolvedValueOnce({
        items: [{ id: 'm3' }, { id: 'm4' }],
        oldest_cursor: 'c3',
        newest_cursor: 'c4',
        has_more_before: true,
        has_more_after: false,
      })
      .mockResolvedValueOnce({
        items: [{ id: 'm1' }, { id: 'm2' }],
        oldest_cursor: 'c1',
        newest_cursor: 'c2',
        has_more_before: false,
        has_more_after: true,
      });

    const messages = await loadAllConversationMessagesPaged('conversation-1', { limit: 2 });

    expect(messages.map((message) => message.id)).toEqual(['m1', 'm2', 'm3', 'm4']);
    expect(invoke).toHaveBeenNthCalledWith(1, {
      conversation_id: 'conversation-1',
      limit: 2,
      content_mode: 'full',
    });
    expect(invoke).toHaveBeenNthCalledWith(2, {
      conversation_id: 'conversation-1',
      limit: 2,
      before: 'c3',
      content_mode: 'full',
    });
  });

  it('loads an anchor window by message id', async () => {
    invoke.mockResolvedValue({
      items: [{ id: 'target' }],
      oldest_cursor: 'c1',
      newest_cursor: 'c1',
      has_more_before: true,
      has_more_after: true,
    });

    const page = await loadConversationAnchorWindow('conversation-1', 'target', { limit: 31 });

    expect(page.items).toEqual([{ id: 'target' }]);
    expect(invoke).toHaveBeenCalledWith({
      conversation_id: 'conversation-1',
      limit: 31,
      anchor_message_id: 'target',
      content_mode: 'compact',
    });
  });
});
