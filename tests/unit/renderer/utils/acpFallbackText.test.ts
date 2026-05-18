import { describe, expect, it } from 'vitest';
import type { IMessageAcpToolCall } from '@/common/chat/chatLib';
import {
  buildAcpFallbackAssistantText,
  extractCompletedToolFallbackText,
} from '@/renderer/pages/conversation/platforms/acp/useAcpMessage';

describe('ACP fallback assistant text', () => {
  it('extracts output path from Hermes terminal result summary', () => {
    const message = {
      content: {
        session_id: 's1',
        update: {
          session_update: 'tool_call_update',
          status: 'completed',
          tool_call_id: 'tc-1',
          content: [
            {
              type: 'content',
              content: {
                type: 'text',
                text: 'terminal result\n- **output:** /tmp/hermes-path\n- **exit_code:** 0',
              },
            },
          ],
        },
      },
    } as IMessageAcpToolCall;

    expect(extractCompletedToolFallbackText(message)).toBe('/tmp/hermes-path');
  });

  it('extracts raw output from OpenCode tool update', () => {
    const message = {
      content: {
        session_id: 's2',
        update: {
          session_update: 'tool_call_update',
          status: 'completed',
          tool_call_id: 'tc-2',
          raw_output: {
            output: '/tmp/opencode-path\n',
          },
        },
      },
    } as IMessageAcpToolCall;

    expect(extractCompletedToolFallbackText(message)).toBe('/tmp/opencode-path');
  });

  it('builds replacement assistant text for fallback rendering', () => {
    expect(
      buildAcpFallbackAssistantText({
        conversationId: 'cid-1',
        msgId: 'msg-1',
        content: '/tmp/answer',
        createdAt: 123,
      })
    ).toMatchObject({
      conversation_id: 'cid-1',
      msg_id: 'msg-1',
      type: 'text',
      position: 'left',
      created_at: 123,
      content: {
        content: '/tmp/answer',
        replace: true,
      },
    });
  });
});
