import type { TMessage } from '@/common/chat/chatLib';
import {
  getConversationInputHistory,
  isCaretOnFirstLine,
  isCaretOnLastLine,
} from '@/renderer/utils/chat/messageHistory';
import { describe, expect, it } from 'vitest';

function createTextMessage(overrides: Partial<TMessage> & { content?: string } = {}): TMessage {
  return {
    id: overrides.id ?? 'msg-1',
    conversation_id: overrides.conversation_id ?? 'conv-1',
    type: 'text',
    position: overrides.position ?? 'right',
    content: {
      content: overrides.content ?? 'hello',
    },
    msg_id: overrides.msg_id,
  } as TMessage;
}

describe('getConversationInputHistory', () => {
  it('returns current-conversation user text messages in reverse chronological order without duplicates', () => {
    const messages: TMessage[] = [
      createTextMessage({ id: '1', content: 'first' }),
      createTextMessage({ id: '2', position: 'left', content: 'assistant reply' }),
      createTextMessage({ id: '3', content: 'second' }),
      createTextMessage({ id: '4', content: 'first' }),
      createTextMessage({ id: '5', conversation_id: 'conv-2', content: 'other conversation' }),
    ];

    expect(getConversationInputHistory(messages, 'conv-1')).toEqual(['first', 'second']);
  });

  it('ignores empty and non-text messages, and returns an empty list when conversation is missing', () => {
    const messages: TMessage[] = [
      createTextMessage({ id: '1', content: '   ' }),
      {
        id: '2',
        conversation_id: 'conv-1',
        type: 'tips',
        position: 'center',
        content: {
          content: 'warning',
          type: 'warning',
        },
      } as TMessage,
    ];

    expect(getConversationInputHistory(messages, 'conv-1')).toEqual([]);
    expect(getConversationInputHistory(messages, undefined)).toEqual([]);
  });
});

describe('caret line helpers', () => {
  it('detects when the caret is on the first line', () => {
    const textarea = {
      value: 'first line\nsecond line',
      selectionStart: 3,
      selectionEnd: 3,
    } as HTMLTextAreaElement;

    expect(isCaretOnFirstLine(textarea)).toBe(true);
    expect(isCaretOnLastLine(textarea)).toBe(false);
  });

  it('detects when the caret is on the last line', () => {
    const value = 'first line\nsecond line';
    const textarea = {
      value,
      selectionStart: value.length,
      selectionEnd: value.length,
    } as HTMLTextAreaElement;

    expect(isCaretOnFirstLine(textarea)).toBe(false);
    expect(isCaretOnLastLine(textarea)).toBe(true);
  });
});
