/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

const getConversationMessages = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    database: {
      getConversationMessages: { invoke: (...a: unknown[]) => getConversationMessages(...a) },
    },
  },
}));

import { loadParentReferenceTranscript } from '@/common/chat/loadParentReferenceTranscript';
import type { TMessage } from '@/common/chat/chatLib';

const textMessage = (id: string, position: 'left' | 'right', content: unknown): TMessage =>
  ({ id, msg_id: id, type: 'text', position, content }) as unknown as TMessage;

beforeEach(() => {
  getConversationMessages.mockReset();
});

describe('loadParentReferenceTranscript', () => {
  it('maps positions to user/assistant roles and keeps only text messages', async () => {
    getConversationMessages.mockResolvedValue({
      items: [
        textMessage('u1', 'right', { content: 'fix the bug' }),
        { id: 't1', type: 'tool_call', position: 'left', content: {} } as unknown as TMessage,
        textMessage('a1', 'left', { content: 'done' }),
      ],
      oldest_cursor: null,
      newest_cursor: 'c',
      has_more_before: false,
      has_more_after: false,
    });

    await expect(loadParentReferenceTranscript('p1')).resolves.toBe('[user] fix the bug\n\n[assistant] done');
    expect(getConversationMessages).toHaveBeenCalledWith({
      conversation_id: 'p1',
      limit: 60,
      content_mode: 'compact',
    });
  });

  it('clips each message and keeps only the most recent window', async () => {
    const long = 'x'.repeat(3000);
    const items = Array.from({ length: 60 }, (_, i) =>
      textMessage(`m${i}`, i % 2 ? 'left' : 'right', { content: `${i}-${long}` })
    );
    getConversationMessages.mockResolvedValue({
      items,
      oldest_cursor: null,
      newest_cursor: 'c',
      has_more_before: false,
      has_more_after: false,
    });

    const transcript = await loadParentReferenceTranscript('p1');
    const lines = transcript.split('\n\n');
    expect(lines).toHaveLength(40);
    // Oldest messages were dropped; each surviving line is capped.
    expect(lines[0]).toContain('20-');
    expect(lines[0].length).toBeLessThan(2200);
  });

  it('returns an empty string when the parent has no text messages', async () => {
    getConversationMessages.mockResolvedValue({
      items: [{ id: 't1', type: 'thinking', position: 'left', content: {} } as unknown as TMessage],
      oldest_cursor: null,
      newest_cursor: null,
      has_more_before: false,
      has_more_after: false,
    });

    await expect(loadParentReferenceTranscript('p1')).resolves.toBe('');
  });
});
