/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { normalizeDbMessage } from '@/renderer/pages/conversation/Messages/hooks';
import type { IMessageText, IMessageTips } from '@/common/chat/chatLib';

describe('normalizeDbMessage', () => {
  it('keeps persisted info tip localization metadata from db content', () => {
    const normalized = normalizeDbMessage({
      id: 'tip-info',
      type: 'tips',
      conversation_id: 'conversation-1',
      position: 'center',
      status: 'finish',
      content: JSON.stringify({
        content: '',
        type: 'info',
        code: 'ACP_EMPTY_TURN',
        params: {
          provider: 'OpenCode',
        },
      }),
    } as unknown as IMessageTips) as IMessageTips;

    expect(normalized.content).toEqual({
      content: '',
      type: 'info',
      code: 'ACP_EMPTY_TURN',
      params: {
        provider: 'OpenCode',
      },
    });
  });

  it('keeps structured error metadata from persisted tips', () => {
    const normalized = normalizeDbMessage({
      id: 'tip-structured',
      type: 'tips',
      conversation_id: 'conversation-1',
      position: 'center',
      status: 'error',
      content: JSON.stringify({
        content: 'The upstream Agent failed while handling the request',
        type: 'error',
        source: 'send_failed',
        code: 'BAD_GATEWAY',
        error: {
          message: 'The upstream Agent failed while handling the request',
          code: 'UNKNOWN_UPSTREAM_ERROR',
          ownership: 'unknown_upstream',
          detail: 'ACP init failed: config file is invalid',
          retryable: true,
          feedback_recommended: true,
          resolution: {
            kind: 'start_new_session',
            target: 'new_conversation',
          },
        },
      }),
    } as unknown as IMessageTips) as IMessageTips;

    expect(normalized.content.error).toEqual({
      message: 'The upstream Agent failed while handling the request',
      code: 'UNKNOWN_UPSTREAM_ERROR',
      ownership: 'unknown_upstream',
      detail: 'ACP init failed: config file is invalid',
      retryable: true,
      feedback_recommended: true,
      resolution: {
        kind: 'start_new_session',
        target: 'new_conversation',
      },
    });
  });

  it('restores persisted send failure tips as structured agent errors', () => {
    const normalized = normalizeDbMessage({
      id: 'tip-1',
      type: 'tips',
      conversation_id: 'conversation-1',
      position: 'center',
      status: 'error',
      content: JSON.stringify({
        content: 'Bad gateway: ACP init failed: config file is invalid',
        type: 'error',
        source: 'send_failed',
        code: 'BAD_GATEWAY',
      }),
    } as unknown as IMessageTips) as IMessageTips;

    expect(normalized.content).toEqual({
      content: 'Bad gateway: ACP init failed: config file is invalid',
      type: 'error',
      error: {
        message: 'Bad gateway: ACP init failed: config file is invalid',
        code: 'UNKNOWN_UPSTREAM_ERROR',
        ownership: 'unknown_upstream',
        detail: 'Bad gateway: ACP init failed: config file is invalid',
        retryable: true,
        feedback_recommended: true,
      },
    });
  });

  it('prefers persisted workspace runtime errors over legacy unknown-upstream payloads', () => {
    const normalized = normalizeDbMessage({
      id: 'tip-runtime-workspace',
      type: 'tips',
      conversation_id: 'conversation-1',
      position: 'center',
      status: 'error',
      content: JSON.stringify({
        content: 'The current Agent failed to run in this workspace path',
        type: 'error',
        source: 'send_failed',
        code: 'WORKSPACE_PATH_CONTAINS_WHITESPACE_RUNTIME_UNSUPPORTED',
        details: {
          workspace_path: '/Users/zhoukai/Documents/Archive ',
        },
        error: {
          message: 'The current Agent failed to run in this workspace path',
          code: 'UNKNOWN_UPSTREAM_ERROR',
          ownership: 'unknown_upstream',
          detail: '/Users/zhoukai/Documents/Archive . Make sure the workspace path exists and is accessible.',
          retryable: true,
          feedback_recommended: true,
        },
      }),
    } as unknown as IMessageTips) as IMessageTips;

    expect(normalized.content.error).toEqual({
      message: 'The current Agent failed to run in this workspace path',
      code: 'WORKSPACE_PATH_RUNTIME_UNAVAILABLE',
      ownership: 'aionui',
      detail: '/Users/zhoukai/Documents/Archive . Make sure the workspace path exists and is accessible.',
      workspacePath: '/Users/zhoukai/Documents/Archive ',
      retryable: false,
      feedback_recommended: false,
    });
  });

  it('normalizes team metadata when persisted text content is already an object', () => {
    const normalized = normalizeDbMessage({
      id: 'team-message-object',
      type: 'text',
      conversation_id: 'leader-conversation-1',
      position: 'left',
      status: 'finish',
      content: {
        content: '[Claude Assistant] idle',
        teammate_message: true,
        sender_name: 'Claude Assistant',
        sender_backend: 'claude',
        sender_conversation_id: 'teammate-conversation-1',
      },
    } as unknown as IMessageText) as IMessageText;

    expect(normalized.content).toEqual({
      content: '[Claude Assistant] idle',
      teammateMessage: true,
      senderName: 'Claude Assistant',
      senderAgentType: 'claude',
      senderConversationId: 'teammate-conversation-1',
    });
  });

  it('normalizes team metadata when persisted text content is a JSON string', () => {
    const normalized = normalizeDbMessage({
      id: 'team-message-json',
      type: 'text',
      conversation_id: 'leader-conversation-1',
      position: 'left',
      status: 'finish',
      content: JSON.stringify({
        content: '[Codex Assistant] idle',
        teammate_message: true,
        sender_name: 'Codex Assistant',
        sender_backend: 'codex',
        sender_conversation_id: 'teammate-conversation-2',
      }),
    } as unknown as IMessageText) as IMessageText;

    expect(normalized.content).toEqual({
      content: '[Codex Assistant] idle',
      teammateMessage: true,
      senderName: 'Codex Assistant',
      senderAgentType: 'codex',
      senderConversationId: 'teammate-conversation-2',
    });
  });

  it('keeps ordinary recovered text messages as plain text content', () => {
    const normalized = normalizeDbMessage({
      id: 'ordinary-text',
      type: 'text',
      conversation_id: 'conversation-1',
      position: 'left',
      status: 'finish',
      content: {
        content: 'ordinary assistant response',
      },
    } as unknown as IMessageText) as IMessageText;

    expect(normalized.content).toEqual({
      content: 'ordinary assistant response',
    });
  });
});
