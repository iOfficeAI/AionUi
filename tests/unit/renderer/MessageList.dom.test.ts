import type { TMessage } from '@/common/chat/chatLib';
import { shouldRenderMessageInList } from '@/renderer/pages/conversation/Messages/MessageList';
import { describe, expect, it } from 'vitest';

const agentStatus = (status: string): TMessage =>
  ({
    id: `status-${status}`,
    msg_id: `status-${status}`,
    conversation_id: 'conv-1',
    type: 'agent_status',
    position: 'center',
    content: {
      backend: 'codex',
      status,
    },
  }) as TMessage;

describe('MessageList filtering', () => {
  it('hides transient agent statuses while preserving errors', () => {
    expect(shouldRenderMessageInList(agentStatus('connecting'))).toBe(false);
    expect(shouldRenderMessageInList(agentStatus('connected'))).toBe(false);
    expect(shouldRenderMessageInList(agentStatus('authenticated'))).toBe(false);
    expect(shouldRenderMessageInList(agentStatus('session_active'))).toBe(false);
    expect(shouldRenderMessageInList(agentStatus('error'))).toBe(true);
  });

  it('keeps normal messages and hides explicit non-content messages', () => {
    const textMessage = {
      id: 'text-1',
      msg_id: 'text-1',
      conversation_id: 'conv-1',
      type: 'text',
      position: 'left',
      content: { content: 'hello' },
    } as TMessage;
    const hiddenMessage = {
      ...textMessage,
      id: 'hidden-1',
      hidden: true,
    } as TMessage;
    const availableCommandsMessage = {
      ...textMessage,
      id: 'commands-1',
      type: 'available_commands',
    } as TMessage;

    expect(shouldRenderMessageInList(textMessage)).toBe(true);
    expect(shouldRenderMessageInList(hiddenMessage)).toBe(false);
    expect(shouldRenderMessageInList(availableCommandsMessage)).toBe(false);
  });
});
