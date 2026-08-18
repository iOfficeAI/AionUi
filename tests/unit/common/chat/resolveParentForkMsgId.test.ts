/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getConversationMessages = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    database: {
      getConversationMessages: { invoke: (...a: unknown[]) => getConversationMessages(...a) },
    },
  },
}));

import { resolveParentForkMsgId, resolveParentForkMsgIdFromMessages } from '@/common/chat/resolveParentForkMsgId';
import type { TMessage } from '@/common/chat/chatLib';

const message = (id: string, created_at: number): TMessage => ({ id, msg_id: id, created_at }) as unknown as TMessage;

beforeEach(() => {
  getConversationMessages.mockReset();
});

describe('resolveParentForkMsgIdFromMessages', () => {
  it('picks the newest message by created_at', () => {
    const messages = [message('old', 1), message('newest', 5), message('mid', 3)];
    expect(resolveParentForkMsgIdFromMessages(messages)).toBe('newest');
  });

  it('falls back to the row id when msg_id is absent', () => {
    const messages = [{ id: 'row-id', created_at: 1 } as unknown as TMessage];
    expect(resolveParentForkMsgIdFromMessages(messages)).toBe('row-id');
  });

  it('returns undefined for an empty list', () => {
    expect(resolveParentForkMsgIdFromMessages([])).toBeUndefined();
  });
});

describe('resolveParentForkMsgId', () => {
  it('reads the latest window (limit 1) and anchors on its last row', async () => {
    getConversationMessages.mockResolvedValue({
      items: [{ id: 'm1', msg_id: 'm1' }],
      oldest_cursor: null,
      newest_cursor: 'c1',
      has_more_before: true,
      has_more_after: false,
    });
    await expect(resolveParentForkMsgId('p1')).resolves.toBe('m1');
    expect(getConversationMessages).toHaveBeenCalledWith({
      conversation_id: 'p1',
      limit: 1,
      content_mode: 'compact',
    });
  });

  it('returns undefined when the parent has no messages yet', async () => {
    getConversationMessages.mockResolvedValue({
      items: [],
      oldest_cursor: null,
      newest_cursor: null,
      has_more_before: false,
      has_more_after: false,
    });
    await expect(resolveParentForkMsgId('p1')).resolves.toBeUndefined();
  });
});
