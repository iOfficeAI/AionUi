import type { TMessage } from '@/common/chat/chatLib';
import { getLastAssistantText } from '@/renderer/utils/chat/getLastAssistantText';
import { describe, expect, it } from 'vitest';

const createTextMessage = (overrides: Partial<TMessage> = {}): TMessage => ({
  id: crypto.randomUUID(),
  type: 'text',
  position: 'left',
  content: {
    content: 'assistant reply',
  },
  ...overrides,
});

describe('getLastAssistantText', () => {
  it('returns null while a response is still loading', () => {
    const messages = [createTextMessage()];

    expect(getLastAssistantText(messages, true)).toBeNull();
  });

  it('returns null when no visible assistant text message exists', () => {
    const messages = [
      createTextMessage({ position: 'right' }),
      {
        id: crypto.randomUUID(),
        type: 'tips',
        position: 'left',
        content: {
          content: 'tip',
          type: 'warning',
        },
      },
    ] satisfies TMessage[];

    expect(getLastAssistantText(messages, false)).toBeNull();
  });

  it('returns the last visible assistant text message', () => {
    const messages = [
      createTextMessage({ content: { content: 'first reply' } }),
      createTextMessage({ content: { content: 'second reply' } }),
    ];

    expect(getLastAssistantText(messages, false)).toBe('second reply');
  });

  it('skips hidden or empty assistant messages after cleanup', () => {
    const messages = [
      createTextMessage({ content: { content: 'final visible reply' } }),
      createTextMessage({ hidden: true, content: { content: 'hidden reply' } }),
      createTextMessage({ content: { content: '<think>internal</think>' } }),
    ];

    expect(getLastAssistantText(messages, false)).toBe('final visible reply');
  });

  it('strips think tags and skill suggestions before returning content', () => {
    const messages = [
      createTextMessage({
        content: {
          content:
            '<think>hidden reasoning</think>\nVisible answer\n[SKILL_SUGGEST]{"skills":[{"name":"test"}]}[/SKILL_SUGGEST]',
        },
      }),
    ];

    expect(getLastAssistantText(messages, false)).toBe('\nVisible answer\n');
  });

  it('preserves leading and trailing whitespace in copied content', () => {
    const messages = [
      createTextMessage({
        content: {
          content: '  indented line\ntrailing space  ',
        },
      }),
    ];

    expect(getLastAssistantText(messages, false)).toBe('  indented line\ntrailing space  ');
  });
});
