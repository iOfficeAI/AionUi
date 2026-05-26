/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { composeMessage, type IMessageAcpToolCall, type IMessageThinking, type TMessage } from '@/common/chat/chatLib';

const CONVERSATION_ID = 'conversation-1';

function createThinkingMessage(msgId: string, content: string): IMessageThinking {
  return {
    id: `thinking-${content}`,
    type: 'thinking',
    msg_id: msgId,
    conversation_id: CONVERSATION_ID,
    position: 'left',
    content: {
      content,
      status: 'thinking',
    },
  };
}

function createThinkingDoneMessage(msgId: string, duration: number): IMessageThinking {
  return {
    id: `thinking-done-${msgId}`,
    type: 'thinking',
    msg_id: msgId,
    conversation_id: CONVERSATION_ID,
    position: 'left',
    content: {
      content: '',
      duration,
      status: 'done',
    },
  };
}

function createToolCallMessage(toolCallId: string): IMessageAcpToolCall {
  return {
    id: toolCallId,
    type: 'acp_tool_call',
    msg_id: toolCallId,
    conversation_id: CONVERSATION_ID,
    position: 'left',
    content: {
      session_id: 'session-1',
      update: {
        sessionUpdate: 'tool_call',
        tool_call_id: toolCallId,
        status: 'completed',
        title: 'Read file',
        kind: 'read',
      },
    },
  };
}

describe('composeMessage', () => {
  it('preserves thinking boundaries once a tool message has been inserted', () => {
    let list: TMessage[] = [];

    list = composeMessage(createThinkingMessage('msg-1', 'alpha'), list);
    list = composeMessage(createThinkingMessage('msg-1', 'beta'), list);

    expect(list).toHaveLength(1);
    expect(list[0].type).toBe('thinking');
    expect((list[0] as IMessageThinking).content.content).toBe('alphabeta');

    list = composeMessage(createToolCallMessage('tool-1'), list);
    list = composeMessage(createThinkingMessage('msg-1', 'gamma'), list);

    expect(list).toHaveLength(3);
    expect(list.map((message) => message.type)).toEqual(['thinking', 'acp_tool_call', 'thinking']);
    expect((list[0] as IMessageThinking).content.content).toBe('alphabeta');
    expect((list[2] as IMessageThinking).content.content).toBe('gamma');
  });

  it('merges thinking done updates back into the latest matching thinking message', () => {
    let list: TMessage[] = [];

    list = composeMessage(createThinkingMessage('msg-1', 'alpha'), list);
    list = composeMessage(createToolCallMessage('tool-1'), list);
    list = composeMessage(createThinkingDoneMessage('msg-1', 3200), list);

    expect(list).toHaveLength(2);
    expect(list.map((message) => message.type)).toEqual(['thinking', 'acp_tool_call']);
    expect((list[0] as IMessageThinking).content.status).toBe('done');
    expect((list[0] as IMessageThinking).content.duration).toBe(3200);
  });
});
