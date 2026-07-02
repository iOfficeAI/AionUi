/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import {
  composeMessage,
  normalizeAgentStreamError,
  normalizeTextMessageContent,
  transformMessage,
  type IMessageText,
  type IMessageTips,
  type IMessageAcpToolCall,
  type IMessageThinking,
  type TMessage,
} from '@/common/chat/chatLib';

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

describe('normalizeAgentStreamError', () => {
  it('treats resolution-only error metadata as structured', () => {
    expect(
      normalizeAgentStreamError({
        message: 'Agent is still responding',
        resolution: {
          kind: 'wait_for_current_response',
        },
      })
    ).toEqual({
      message: 'Agent is still responding',
      resolution: {
        kind: 'wait_for_current_response',
      },
    });
  });

  it('drops unknown resolution kind and target values', () => {
    expect(
      normalizeAgentStreamError({
        message: 'Provider authentication failed',
        resolution: {
          kind: 'check_provider_credentials',
          target: 'unexpected_settings',
        },
      })
    ).toEqual({
      message: 'Provider authentication failed',
      resolution: {
        kind: 'check_provider_credentials',
      },
    });

    expect(
      normalizeAgentStreamError({
        message: 'Unknown recovery action',
        resolution: {
          kind: 'open_secret_panel',
          target: 'provider_settings',
        },
      })
    ).toBeUndefined();
  });

  it('preserves workspace path metadata on structured errors', () => {
    expect(
      normalizeAgentStreamError({
        message: 'The current Agent failed to run in this workspace path.',
        code: 'WORKSPACE_PATH_RUNTIME_UNAVAILABLE',
        workspacePath: '/tmp/Archive ',
      })
    ).toEqual({
      message: 'The current Agent failed to run in this workspace path.',
      code: 'WORKSPACE_PATH_RUNTIME_UNAVAILABLE',
      workspacePath: '/tmp/Archive ',
    });
  });

  it('preserves the rawError diagnostic summary on internal errors', () => {
    expect(
      normalizeAgentStreamError({
        message: 'Something went wrong, please try again.',
        code: 'AIONUI_INTERNAL_ERROR',
        rawError: {
          name: 'Error',
          message: 'connect ECONNREFUSED',
          code: 'ECONNREFUSED',
          status: 500,
          stack: 'Error: connect ECONNREFUSED\n    at frame',
        },
      })
    ).toEqual({
      message: 'Something went wrong, please try again.',
      code: 'AIONUI_INTERNAL_ERROR',
      rawError: {
        name: 'Error',
        message: 'connect ECONNREFUSED',
        code: 'ECONNREFUSED',
        status: 500,
        stack: 'Error: connect ECONNREFUSED\n    at frame',
      },
    });
  });

  it('drops malformed rawError fields and keeps only valid ones', () => {
    expect(
      normalizeAgentStreamError({
        message: 'Something went wrong, please try again.',
        code: 'AIONUI_INTERNAL_ERROR',
        rawError: {
          name: 'Error',
          message: 42,
          status: 'not-a-number',
          extra: 'ignored',
        },
      })
    ).toEqual({
      message: 'Something went wrong, please try again.',
      code: 'AIONUI_INTERNAL_ERROR',
      rawError: {
        name: 'Error',
      },
    });
  });

  it('omits rawError when it has no usable fields', () => {
    expect(
      normalizeAgentStreamError({
        message: 'Something went wrong, please try again.',
        code: 'AIONUI_INTERNAL_ERROR',
        rawError: { unrelated: true },
      })
    ).toEqual({
      message: 'Something went wrong, please try again.',
      code: 'AIONUI_INTERNAL_ERROR',
    });
  });
});

describe('normalizeTextMessageContent', () => {
  it('normalizes snake_case team metadata from an object payload', () => {
    expect(
      normalizeTextMessageContent({
        content: '已向 Lead Agent 报告就绪状态',
        teammate_message: true,
        sender_name: 'Codex Assistant',
        sender_backend: 'codex',
        sender_conversation_id: 'teammate-conversation-1',
      })
    ).toEqual({
      content: '已向 Lead Agent 报告就绪状态',
      teammateMessage: true,
      senderName: 'Codex Assistant',
      senderAgentType: 'codex',
      senderConversationId: 'teammate-conversation-1',
    });
  });

  it('preserves camelCase team metadata from an already-normalized object payload', () => {
    expect(
      normalizeTextMessageContent({
        content: 'online and ready',
        teammateMessage: true,
        senderName: 'Claude Assistant',
        senderAgentType: 'claude',
        senderConversationId: 'teammate-conversation-2',
        replace: true,
      })
    ).toEqual({
      content: 'online and ready',
      teammateMessage: true,
      senderName: 'Claude Assistant',
      senderAgentType: 'claude',
      senderConversationId: 'teammate-conversation-2',
      replace: true,
    });
  });

  it('normalizes JSON string text content from persisted DB payloads', () => {
    expect(
      normalizeTextMessageContent(
        JSON.stringify({
          content: '[Codex Assistant] idle',
          teammate_message: true,
          sender_name: 'Codex Assistant',
          sender_backend: 'codex',
          sender_conversation_id: 'teammate-conversation-3',
        })
      )
    ).toEqual({
      content: '[Codex Assistant] idle',
      teammateMessage: true,
      senderName: 'Codex Assistant',
      senderAgentType: 'codex',
      senderConversationId: 'teammate-conversation-3',
    });
  });

  it('keeps ordinary string text messages as plain content', () => {
    expect(normalizeTextMessageContent('hello')).toEqual({
      content: 'hello',
    });
  });

  it('lets stream-level replace override a plain text payload', () => {
    expect(normalizeTextMessageContent('replacement text', { replace: true })).toEqual({
      content: 'replacement text',
      replace: true,
    });
  });
});

describe('transformMessage', () => {
  it('returns undefined for hidden system stream messages', () => {
    const message: IResponseMessage = {
      type: 'system',
      data: 'cron metadata',
      msg_id: 'system-1',
      conversation_id: CONVERSATION_ID,
      hidden: true,
    };

    expect(transformMessage(message)).toBeUndefined();
  });

  it('uses explicit stream position for team projected user text messages', () => {
    const message: IResponseMessage = {
      type: 'text',
      data: {
        content: '你好',
      },
      msg_id: 'team-user-message-1',
      conversation_id: CONVERSATION_ID,
      position: 'right',
      status: 'finish',
      replace: true,
    };

    const transformed = transformMessage(message) as IMessageText;

    expect(transformed.type).toBe('text');
    expect(transformed.position).toBe('right');
    expect(transformed.status).toBe('finish');
    expect(transformed.content).toEqual({
      content: '你好',
      replace: true,
    });
  });

  it('normalizes team teammate metadata on realtime text messages', () => {
    const message: IResponseMessage = {
      type: 'text',
      data: {
        content: '[Codex Assistant] idle',
        teammate_message: true,
        sender_name: 'Codex Assistant',
        sender_backend: 'codex',
        sender_conversation_id: 'teammate-conversation-1',
      },
      msg_id: 'team-teammate-message-1',
      conversation_id: CONVERSATION_ID,
      position: 'left',
      status: 'finish',
    };

    const transformed = transformMessage(message) as IMessageText;

    expect(transformed.type).toBe('text');
    expect(transformed.position).toBe('left');
    expect(transformed.status).toBe('finish');
    expect(transformed.content).toEqual({
      content: '[Codex Assistant] idle',
      teammateMessage: true,
      senderName: 'Codex Assistant',
      senderAgentType: 'codex',
      senderConversationId: 'teammate-conversation-1',
    });
  });

  it('keeps plain text stream messages left when no explicit position is present', () => {
    const message: IResponseMessage = {
      type: 'text',
      data: {
        content: 'agent response',
      },
      msg_id: 'agent-message-1',
      conversation_id: CONVERSATION_ID,
    };

    const transformed = transformMessage(message) as IMessageText;

    expect(transformed.type).toBe('text');
    expect(transformed.position).toBe('left');
    expect(transformed.content.content).toBe('agent response');
  });

  it('preserves structured agent stream error metadata', () => {
    const message: IResponseMessage = {
      type: 'error',
      data: {
        message: 'The model provider rejected the request',
        code: 'USER_LLM_PROVIDER_AUTH_FAILED',
        ownership: 'user_llm_provider',
        detail: 'Provider returned 401.',
        workspacePath: '/tmp/provider-test',
        retryable: false,
        feedback_recommended: false,
        resolution: {
          kind: 'check_provider_credentials',
          target: 'provider_settings',
        },
      },
      msg_id: 'error-1',
      conversation_id: CONVERSATION_ID,
    };

    const transformed = transformMessage(message) as IMessageTips;

    expect(transformed.type).toBe('tips');
    expect(transformed.content.content).toBe('The model provider rejected the request');
    expect(transformed.content.error).toEqual({
      message: 'The model provider rejected the request',
      code: 'USER_LLM_PROVIDER_AUTH_FAILED',
      ownership: 'user_llm_provider',
      detail: 'Provider returned 401.',
      workspacePath: '/tmp/provider-test',
      retryable: false,
      feedback_recommended: false,
      resolution: {
        kind: 'check_provider_credentials',
        target: 'provider_settings',
      },
    });
  });

  it('preserves structured metadata on live tips error messages', () => {
    const message: IResponseMessage = {
      type: 'tips',
      data: {
        content: 'AionUI failed while sending the message',
        type: 'error',
        source: 'send_failed',
        code: 'INTERNAL_ERROR',
        error: {
          message: 'AionUI failed while sending the message',
          code: 'AIONUI_INTERNAL_ERROR',
          ownership: 'aionui',
          detail: 'Failed to write Codex sandbox config',
          retryable: true,
          feedback_recommended: true,
          resolution: {
            kind: 'send_feedback',
            target: 'feedback',
          },
        },
      },
      msg_id: 'tips-error-1',
      conversation_id: CONVERSATION_ID,
    };

    const transformed = transformMessage(message) as IMessageTips;

    expect(transformed.type).toBe('tips');
    expect(transformed.content.error).toEqual({
      message: 'AionUI failed while sending the message',
      code: 'AIONUI_INTERNAL_ERROR',
      ownership: 'aionui',
      detail: 'Failed to write Codex sandbox config',
      retryable: true,
      feedback_recommended: true,
      resolution: {
        kind: 'send_feedback',
        target: 'feedback',
      },
    });
  });

  it('preserves info tip type with code and params', () => {
    const message: IResponseMessage = {
      type: 'tips',
      data: {
        content: 'Select a slash command to continue',
        type: 'info',
        code: 'acp.empty_turn.choose_command',
        params: {
          command_count: 3,
        },
      },
      msg_id: 'tips-info-1',
      conversation_id: CONVERSATION_ID,
    };

    const transformed = transformMessage(message) as IMessageTips;

    expect(transformed.type).toBe('tips');
    expect(transformed.content).toMatchObject({
      content: 'Select a slash command to continue',
      type: 'info',
      code: 'acp.empty_turn.choose_command',
      params: {
        command_count: 3,
      },
    });
  });
});
