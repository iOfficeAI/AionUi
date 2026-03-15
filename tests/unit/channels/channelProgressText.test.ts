/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chatLib';
import { formatChannelProgressText } from '@/channels/gateway/channelProgressText';
import { describe, expect, it } from 'vitest';

describe('formatChannelProgressText', () => {
  it('renders agent status updates as readable progress text', () => {
    const message = {
      id: 'msg-status',
      conversation_id: 'conv-1',
      type: 'agent_status',
      content: {
        backend: 'openclaw-gateway',
        status: 'connecting',
        agentName: 'OpenClaw Gateway',
      },
    } as TMessage;

    expect(formatChannelProgressText(message)).toBe('⏳ Connecting to OpenClaw Gateway...');
  });

  it('summarizes plan updates with current active entry', () => {
    const message = {
      id: 'msg-plan',
      conversation_id: 'conv-1',
      type: 'plan',
      content: {
        sessionId: 'session-1',
        entries: [
          { content: 'Inspect Lark connection flow', status: 'completed' },
          { content: 'Patch channel progress rendering', status: 'in_progress' },
          { content: 'Run validation', status: 'pending' },
        ],
      },
    } as TMessage;

    expect(formatChannelProgressText(message)).toBe('📝 Plan updated (1/3 completed)\nCurrent: Patch channel progress rendering');
  });

  it('includes ACP tool title and path when available', () => {
    const message = {
      id: 'msg-acp-tool',
      conversation_id: 'conv-1',
      type: 'acp_tool_call',
      content: {
        sessionId: 'session-1',
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'tool-1',
          status: 'in_progress',
          title: 'Read source file',
          kind: 'read',
          rawInput: { path: 'src/channels/gateway/ActionExecutor.ts' },
        },
      },
    } as TMessage;

    expect(formatChannelProgressText(message)).toBe('⏳ Read source file\nsrc/channels/gateway/ActionExecutor.ts');
  });

  it('includes Codex tool title and file path when available', () => {
    const message = {
      id: 'msg-codex-tool',
      conversation_id: 'conv-1',
      type: 'codex_tool_call',
      content: {
        toolCallId: 'tool-2',
        status: 'success',
        title: 'Apply patch',
        kind: 'patch',
        content: [{ type: 'diff', filePath: 'src/channels/gateway/channelProgressText.ts' }],
      },
    } as TMessage;

    expect(formatChannelProgressText(message)).toBe('✅ Apply patch\nsrc/channels/gateway/channelProgressText.ts');
  });

  it('returns null for normal text messages', () => {
    const message = {
      id: 'msg-text',
      conversation_id: 'conv-1',
      type: 'text',
      content: {
        content: 'Hello',
      },
    } as TMessage;

    expect(formatChannelProgressText(message)).toBeNull();
  });
});
