import { describe, expect, it } from 'vitest';
import { buildAutoTitleFromContent, deriveAutoTitleFromMessages } from '@/renderer/utils/chat/autoTitle';
import type { TMessage } from '@/common/chat/chatLib';

const createUserMessage = (content: string): TMessage => ({
  id: content,
  conversation_id: 'conv-1',
  type: 'text',
  position: 'right',
  content: { content },
  createdAt: Date.now(),
});

describe('autoTitle', () => {
  it('picks the first user message from history', () => {
    const title = deriveAutoTitleFromMessages([
      createUserMessage('继续'),
      createUserMessage('请帮我排查登录态过期后跳回登录页的问题'),
    ]);

    expect(title).toBe('继续');
  });

  it('falls back to the current input when history has no user message yet', () => {
    const title = deriveAutoTitleFromMessages([], '帮我写一个发版回滚预案');

    expect(title).toBe('帮我写一个发版回滚预案');
  });

  it('returns null for empty content', () => {
    expect(buildAutoTitleFromContent('   \n  ')).toBeNull();
  });
});
