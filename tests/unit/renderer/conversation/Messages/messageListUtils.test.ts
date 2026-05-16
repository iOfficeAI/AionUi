import { describe, expect, it } from 'vitest';
import type { TMessage } from '@/common/chat/chatLib';
import { shouldRenderMessageInList } from '@/renderer/pages/conversation/Messages/messageListUtils';

const makeMessage = (overrides: Partial<TMessage>): TMessage =>
  ({
    id: 'msg-1',
    msg_id: 'msg-1',
    conversation_id: 'conv-1',
    type: 'text',
    position: 'left',
    content: { content: 'hello' },
    ...overrides,
  }) as TMessage;

describe('shouldRenderMessageInList', () => {
  it('keeps visible chat messages in the virtualized list', () => {
    expect(shouldRenderMessageInList(makeMessage({ type: 'text' }))).toBe(true);
    expect(shouldRenderMessageInList(makeMessage({ type: 'tool_group', content: [] }))).toBe(true);
  });

  it('filters messages that would render as hidden or empty rows', () => {
    expect(shouldRenderMessageInList(makeMessage({ hidden: true }))).toBe(false);
    expect(shouldRenderMessageInList(makeMessage({ type: 'available_commands' }))).toBe(false);
    expect(shouldRenderMessageInList(makeMessage({ type: 'codex_permission' }))).toBe(false);
  });
});
