/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chat/chatLib';
import { buildMessageAnchors } from '@/renderer/pages/conversation/Messages/anchorRail/anchors';
import { describe, expect, it } from 'vitest';

const textMessage = (
  id: string,
  position: 'left' | 'right' | 'center',
  content: string,
  extra: Partial<TMessage> = {}
): TMessage =>
  ({
    id,
    msg_id: `msg-${id}`,
    conversation_id: 'conversation-1',
    type: 'text',
    position,
    content: { content },
    created_at: 1,
    ...extra,
  }) as TMessage;

const toolMessage = (id: string): TMessage =>
  ({
    id,
    conversation_id: 'conversation-1',
    type: 'tool_call',
    position: 'left',
    content: {},
    created_at: 1,
  }) as unknown as TMessage;

describe('buildMessageAnchors', () => {
  it('creates one anchor per user message with the turn reply attached', () => {
    const anchors = buildMessageAnchors([
      textMessage('u1', 'right', 'first question'),
      textMessage('a1', 'left', 'first answer'),
      textMessage('u2', 'right', 'second question'),
      textMessage('a2', 'left', 'second answer'),
    ]);

    expect(anchors).toHaveLength(2);
    expect(anchors[0]).toMatchObject({
      index: 1,
      question: 'first question',
      answer: 'first answer',
      messageId: 'u1',
      msgId: 'msg-u1',
    });
    expect(anchors[1]).toMatchObject({ index: 2, question: 'second question', answer: 'second answer' });
  });

  it('ignores AI replies that arrive before any user message', () => {
    const anchors = buildMessageAnchors([textMessage('a0', 'left', 'greeting'), textMessage('u1', 'right', 'hello')]);

    expect(anchors).toHaveLength(1);
    expect(anchors[0]).toMatchObject({ index: 1, question: 'hello', answer: '' });
  });

  it('keeps only the first AI reply of a turn as the preview answer', () => {
    const anchors = buildMessageAnchors([
      textMessage('u1', 'right', 'question'),
      textMessage('a1', 'left', 'first reply'),
      textMessage('a2', 'left', 'second reply'),
    ]);

    expect(anchors[0].answer).toBe('first reply');
  });

  it('skips hidden messages, blank text, and non-text messages', () => {
    const anchors = buildMessageAnchors([
      textMessage('hidden', 'right', 'hidden question', { hidden: true } as Partial<TMessage>),
      textMessage('blank', 'right', '   '),
      toolMessage('tool-1'),
      textMessage('u1', 'right', 'real question'),
      toolMessage('tool-2'),
      textMessage('a1', 'left', 'real answer'),
    ]);

    expect(anchors).toHaveLength(1);
    expect(anchors[0]).toMatchObject({ index: 1, question: 'real question', answer: 'real answer' });
  });

  it('normalizes whitespace so preview lines stay single-line', () => {
    const anchors = buildMessageAnchors([textMessage('u1', 'right', 'line one\n\n  line two\t')]);

    expect(anchors[0].question).toBe('line one line two');
  });

  it('truncates long text for the preview card', () => {
    const long = 'x'.repeat(400);
    const anchors = buildMessageAnchors([textMessage('u1', 'right', long), textMessage('a1', 'left', long)]);

    expect(anchors[0].question.length).toBeLessThan(long.length);
    expect(anchors[0].answer.length).toBeLessThan(long.length);
  });

  it('returns an empty list when the conversation has no user text', () => {
    expect(buildMessageAnchors([])).toEqual([]);
    expect(buildMessageAnchors([toolMessage('tool-1'), textMessage('a1', 'left', 'answer only')])).toEqual([]);
  });

  it('numbers anchors sequentially across many turns', () => {
    const messages: TMessage[] = [];
    for (let i = 1; i <= 5; i++) {
      messages.push(textMessage(`u${i}`, 'right', `question ${i}`));
      messages.push(textMessage(`a${i}`, 'left', `answer ${i}`));
    }

    const anchors = buildMessageAnchors(messages);
    expect(anchors.map((anchor) => anchor.index)).toEqual([1, 2, 3, 4, 5]);
    expect(anchors.map((anchor) => anchor.messageId)).toEqual(['u1', 'u2', 'u3', 'u4', 'u5']);
  });
});
