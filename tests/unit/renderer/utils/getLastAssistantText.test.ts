/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { getLastAssistantText } from '@/renderer/utils/chat/getLastAssistantText';
import type { TMessage, IMessageText } from '@/common/chat/chatLib';

vi.mock('@/renderer/utils/chat/thinkTagFilter', () => ({
  stripThinkTags: (content: string) => content.replace(/<think>.*?<\/think>/g, ''),
}));

const mockAssistantMessage = (content: string, overrides?: Partial<IMessageText>): IMessageText =>
  ({
    id: `msg-${Date.now()}`,
    type: 'text',
    position: 'left',
    hidden: false,
    content: { content },
    ...overrides,
  }) as IMessageText;

const mockUserMessage = (content: string): TMessage =>
  ({
    id: `msg-${Date.now()}`,
    type: 'text',
    position: 'right',
    content: { content },
  }) as TMessage;

describe('getLastAssistantText', () => {
  it('returns last assistant message content', () => {
    const messages = [
      mockAssistantMessage('First response'),
      mockUserMessage('User question'),
      mockAssistantMessage('Last response'),
    ];
    expect(getLastAssistantText(messages, false)).toBe('Last response');
  });

  it('returns null when loading', () => {
    const messages = [mockAssistantMessage('Response')];
    expect(getLastAssistantText(messages, true)).toBeNull();
  });

  it('returns null when no assistant messages', () => {
    const messages = [mockUserMessage('User question')];
    expect(getLastAssistantText(messages, false)).toBeNull();
  });

  it('skips hidden assistant messages', () => {
    const messages = [
      mockAssistantMessage('Visible response'),
      mockAssistantMessage('Hidden response', { hidden: true }),
    ];
    expect(getLastAssistantText(messages, false)).toBe('Visible response');
  });

  it('strips think tags from content', () => {
    const messages = [mockAssistantMessage('<think>thinking</think>Response')];
    expect(getLastAssistantText(messages, false)).toBe('Response');
  });

  it('strips SKILL_SUGGEST tags', () => {
    const messages = [mockAssistantMessage('Text[SKILL_SUGGEST]suggest[/SKILL_SUGGEST]more')];
    expect(getLastAssistantText(messages, false)).toBe('Textmore');
  });

  it('strips multiple SKILL_SUGGEST tags', () => {
    const messages = [mockAssistantMessage('[SKILL_SUGGEST]1[/SKILL_SUGGEST]Text[SKILL_SUGGEST]2[/SKILL_SUGGEST]')];
    expect(getLastAssistantText(messages, false)).toBe('Text');
  });

  it('handles case-insensitive SKILL_SUGGEST tags', () => {
    const messages = [mockAssistantMessage('[skill_suggest]content[/skill_suggest]Text')];
    expect(getLastAssistantText(messages, false)).toBe('Text');
  });

  it('collapses multiple newlines after stripping tags', () => {
    const messages = [mockAssistantMessage('Text\n\n\n\nMore')];
    expect(getLastAssistantText(messages, false)).toBe('Text\n\nMore');
  });

  it('returns null for empty content', () => {
    const messages = [mockAssistantMessage('')];
    expect(getLastAssistantText(messages, false)).toBeNull();
  });

  it('returns null for whitespace-only content', () => {
    const messages = [mockAssistantMessage('   \n   ')];
    expect(getLastAssistantText(messages, false)).toBeNull();
  });

  it('skips empty messages and returns previous valid message', () => {
    const messages = [mockAssistantMessage('Valid response'), mockAssistantMessage(''), mockAssistantMessage('   ')];
    expect(getLastAssistantText(messages, false)).toBe('Valid response');
  });

  it('handles empty message list', () => {
    expect(getLastAssistantText([], false)).toBeNull();
  });

  it('handles mixed message types', () => {
    const messages = [
      { type: 'image', position: 'left' } as TMessage,
      mockAssistantMessage('Text response'),
      { type: 'file', position: 'left' } as TMessage,
    ];
    expect(getLastAssistantText(messages, false)).toBe('Text response');
  });

  it('returns last valid assistant message in reverse order', () => {
    const messages = [mockAssistantMessage('First'), mockAssistantMessage('Second'), mockAssistantMessage('Third')];
    expect(getLastAssistantText(messages, false)).toBe('Third');
  });

  it('combines think tag stripping and SKILL_SUGGEST stripping', () => {
    const messages = [mockAssistantMessage('<think>thinking</think>Text[SKILL_SUGGEST]suggest[/SKILL_SUGGEST]')];
    expect(getLastAssistantText(messages, false)).toBe('Text');
  });
});
