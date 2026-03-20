import { describe, expect, it } from 'vitest';

import type { TMessage } from '@/common/chat/chatLib';
import { MAX_LINE_LEN } from '@/renderer/pages/conversation/components/ConversationTitleMinimap/minimapTypes';
import {
  buildSearchSnippet,
  buildTurnPreview,
} from '@/renderer/pages/conversation/components/ConversationTitleMinimap/minimapUtils';

// Helper to create a text message with sensible defaults
function textMsg(
  content: string,
  position: 'left' | 'right',
  overrides: Partial<{ id: string; msg_id: string }> = {}
): TMessage {
  return {
    id: overrides.id ?? `msg-${Math.random().toString(36).slice(2, 8)}`,
    msg_id: overrides.msg_id,
    conversation_id: 'conv-1',
    type: 'text' as const,
    content: { content },
    position,
  };
}

// Helper to create a tool_call message (non-text)
function toolCallMsg(): TMessage {
  return {
    id: `tc-${Math.random().toString(36).slice(2, 8)}`,
    conversation_id: 'conv-1',
    type: 'tool_call' as const,
    content: { callId: 'call-1', name: 'search', args: {} },
    position: 'left',
  };
}

// ---------------------------------------------------------------------------
// buildTurnPreview
// ---------------------------------------------------------------------------
describe('buildTurnPreview', () => {
  it('returns an empty array for an empty messages array', () => {
    expect(buildTurnPreview([])).toEqual([]);
  });

  it('creates a single turn for one user (right) text message', () => {
    const msgs = [textMsg('Hello world', 'right', { id: 'u1', msg_id: 'mu1' })];
    const turns = buildTurnPreview(msgs);

    expect(turns).toHaveLength(1);
    expect(turns[0].index).toBe(1);
    expect(turns[0].question).toBe('Hello world');
    expect(turns[0].questionRaw).toBe('Hello world');
    expect(turns[0].answer).toBe('');
    expect(turns[0].answerRaw).toBe('');
    expect(turns[0].messageId).toBe('u1');
    expect(turns[0].msgId).toBe('mu1');
  });

  it('creates a single turn with answer for one user + one assistant message', () => {
    const msgs = [textMsg('Question?', 'right'), textMsg('Answer!', 'left')];
    const turns = buildTurnPreview(msgs);

    expect(turns).toHaveLength(1);
    expect(turns[0].question).toBe('Question?');
    expect(turns[0].answer).toBe('Answer!');
  });

  it('skips tool_call messages entirely', () => {
    const msgs = [textMsg('Q1', 'right'), toolCallMsg(), textMsg('A1', 'left')];
    const turns = buildTurnPreview(msgs);

    expect(turns).toHaveLength(1);
    expect(turns[0].question).toBe('Q1');
    expect(turns[0].answer).toBe('A1');
  });

  it('truncates very long text in question and answer', () => {
    const longText = 'a'.repeat(200);
    const msgs = [textMsg(longText, 'right'), textMsg(longText, 'left')];
    const turns = buildTurnPreview(msgs);

    expect(turns[0].question.length).toBeLessThanOrEqual(MAX_LINE_LEN);
    expect(turns[0].question.endsWith('\u2026')).toBe(true);
    expect(turns[0].answer.length).toBeLessThanOrEqual(MAX_LINE_LEN);
    // Raw fields keep the full text
    expect(turns[0].questionRaw).toBe(longText);
    expect(turns[0].answerRaw).toBe(longText);
  });

  it('skips messages with image-only content (no text)', () => {
    // A tool_group message has no string content field, so it is skipped
    const imageOnlyMsg: TMessage = {
      id: 'img-1',
      conversation_id: 'conv-1',
      type: 'tool_group' as const,
      content: [{ callId: 'c1', description: 'img', name: 'gen', renderOutputAsMarkdown: false }],
      position: 'left',
    };
    const msgs = [textMsg('User question', 'right'), imageOnlyMsg];
    const turns = buildTurnPreview(msgs);

    expect(turns).toHaveLength(1);
    expect(turns[0].answer).toBe('');
  });

  it('creates multiple turns from interleaved user/assistant messages', () => {
    const msgs = [
      textMsg('Q1', 'right'),
      textMsg('A1', 'left'),
      textMsg('Q2', 'right'),
      textMsg('A2', 'left'),
      textMsg('Q3', 'right'),
    ];
    const turns = buildTurnPreview(msgs);

    expect(turns).toHaveLength(3);
    expect(turns[0].index).toBe(1);
    expect(turns[1].index).toBe(2);
    expect(turns[2].index).toBe(3);
    expect(turns[2].answer).toBe('');
  });

  it('only uses the first assistant message as the answer for a turn', () => {
    const msgs = [textMsg('Q', 'right'), textMsg('First answer', 'left'), textMsg('Second answer', 'left')];
    const turns = buildTurnPreview(msgs);

    expect(turns).toHaveLength(1);
    expect(turns[0].answer).toBe('First answer');
  });
});

// ---------------------------------------------------------------------------
// buildSearchSnippet
// ---------------------------------------------------------------------------
describe('buildSearchSnippet', () => {
  it('returns a snippet when keyword is at the beginning of text', () => {
    const text = 'Hello world, this is a test string for snippet extraction.';
    const result = buildSearchSnippet(text, 'Hello');

    expect(result).toContain('Hello');
    // No prefix ellipsis when keyword starts at position 0
    expect(result.startsWith('\u2026')).toBe(false);
  });

  it('returns a snippet with ellipses when keyword is in the middle of long text', () => {
    const padding = 'x'.repeat(80);
    const text = `${padding}KEYWORD${padding}`;
    const result = buildSearchSnippet(text, 'KEYWORD');

    expect(result).toContain('KEYWORD');
    // Should be trimmed on both sides for very long text
    expect(result.length).toBeLessThanOrEqual(MAX_LINE_LEN + 2); // +2 for possible ellipses
  });

  it('returns a snippet when keyword is at the end of text', () => {
    const padding = 'y'.repeat(100);
    const text = `${padding}Ending`;
    const result = buildSearchSnippet(text, 'Ending');

    expect(result).toContain('Ending');
    // Should not have a trailing ellipsis since keyword is at the end
    expect(result.endsWith('\u2026')).toBe(false);
  });

  it('returns truncated text when keyword is not found', () => {
    const text = 'Some text without the search term.';
    const result = buildSearchSnippet(text, 'nonexistent');

    // Falls back to truncate(text)
    expect(result).toBe(text);
  });

  it('handles Chinese text with keyword correctly', () => {
    const text = '这是一段包含关键词的中文文本，用于测试搜索片段提取功能。';
    const result = buildSearchSnippet(text, '关键词');

    expect(result).toContain('关键词');
  });

  it('returns full text when snippet radius exceeds text length', () => {
    const text = 'short';
    const result = buildSearchSnippet(text, 'short');

    expect(result).toBe('short');
  });

  it('returns truncated text when keyword is empty', () => {
    const text = 'A'.repeat(200);
    const result = buildSearchSnippet(text, '');

    expect(result.length).toBeLessThanOrEqual(MAX_LINE_LEN);
    expect(result.endsWith('\u2026')).toBe(true);
  });

  it('performs case-insensitive matching', () => {
    const text = 'The Quick Brown Fox jumps over the lazy dog.';
    const result = buildSearchSnippet(text, 'quick');

    expect(result).toContain('Quick');
  });
});
