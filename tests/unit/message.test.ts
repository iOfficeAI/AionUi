/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getConversation = vi.fn();
const createConversation = vi.fn();
const getConversationMessages = vi.fn();
const insertMessage = vi.fn();
const updateMessage = vi.fn();

vi.mock('@process/services/database/export', () => ({
  getDatabase: vi.fn(async () => ({
    getConversation,
    createConversation,
    getConversationMessages,
    insertMessage,
    updateMessage,
  })),
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessChat: {
    get: vi.fn(async () => []),
  },
}));

describe('message cache', () => {
  let storedMessages: Array<{
    id: string;
    msg_id?: string;
    type: string;
    position?: string;
    conversation_id: string;
    content: { content: string };
    createdAt: number;
  }>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T00:00:00.000Z'));
    storedMessages = [];

    getConversation.mockReset();
    getConversation.mockReturnValue({
      success: true,
      data: {
        id: 'conv-1',
        source: 'api',
      },
    });

    createConversation.mockReset();
    createConversation.mockReturnValue({
      success: true,
    });

    getConversationMessages.mockReset();
    getConversationMessages.mockImplementation(
      (_conversationId: string, page: number, pageSize: number, sort: 'ASC' | 'DESC' = 'DESC') => {
        const ordered = [...storedMessages].toSorted((left, right) => left.createdAt - right.createdAt);
        const sorted = sort === 'DESC' ? ordered.toReversed() : ordered;
        const start = page * pageSize;
        return {
          data: sorted.slice(start, start + pageSize),
          total: storedMessages.length,
        };
      }
    );

    insertMessage.mockReset();
    insertMessage.mockImplementation((message) => {
      storedMessages.push(message);
      return {
        success: true,
      };
    });

    updateMessage.mockReset();
    updateMessage.mockImplementation((id, message) => {
      const index = storedMessages.findIndex((item) => item.id === id);
      if (index !== -1) {
        storedMessages[index] = message;
      }
      return {
        success: true,
      };
    });

    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('flushes accumulated stream updates during continuous output', async () => {
    const { addOrUpdateMessage, getConversationMessageCacheStats, releaseConversationMessageCache } =
      await import('@process/utils/message');

    for (let index = 0; index < 12; index += 1) {
      addOrUpdateMessage('conv-1', {
        id: `msg-${index}`,
        msg_id: 'stream-1',
        type: 'text',
        position: 'left',
        conversation_id: 'conv-1',
        content: {
          content: `chunk-${index}|`,
        },
        createdAt: index + 1,
      });

      await vi.advanceTimersByTimeAsync(100);
    }

    const stats = getConversationMessageCacheStats();
    expect(stats.size).toBe(1);
    expect(stats.conversations[0]?.pendingOperations ?? 0).toBeLessThan(12);
    expect(insertMessage).toHaveBeenCalled();

    const releasePromise = releaseConversationMessageCache('conv-1', {
      persistPending: true,
    });
    await vi.runAllTimersAsync();
    await releasePromise;

    expect(storedMessages[0]?.content.content).toContain('chunk-0|');
    expect(storedMessages[0]?.content.content).toContain('chunk-11|');
  });

  it('persists pending updates before releasing the cache', async () => {
    const { addOrUpdateMessage, getConversationMessageCacheStats, releaseConversationMessageCache } =
      await import('@process/utils/message');

    addOrUpdateMessage('conv-1', {
      id: 'msg-1',
      msg_id: 'stream-1',
      type: 'text',
      position: 'left',
      conversation_id: 'conv-1',
      content: {
        content: 'hello world',
      },
      createdAt: 1,
    });

    expect(getConversationMessageCacheStats().conversations[0]?.pendingOperations).toBe(1);

    const releasePromise = releaseConversationMessageCache('conv-1', {
      persistPending: true,
    });
    await vi.runAllTimersAsync();
    await releasePromise;

    expect(getConversationMessageCacheStats().size).toBe(0);
    expect(storedMessages).toHaveLength(1);
    expect(storedMessages[0]?.content.content).toBe('hello world');
  });
});
