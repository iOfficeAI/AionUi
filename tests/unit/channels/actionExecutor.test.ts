/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { TMessage } from '@/common/chat/chatLib';
import { convertTMessageToOutgoing } from '@process/channels/gateway/ActionExecutor';
import type { PluginType } from '@process/channels/types';

/**
 * Regression coverage for iOfficeAI/AionUi#2756.
 *
 * `agent_status` frames with non-error statuses (e.g. `session_active`) are
 * UI-only progress indicators emitted by the agent. Streaming them to IM
 * channels would overwrite the real reply text because each streamed frame
 * edits the same message. `convertTMessageToOutgoing` must return `null` so
 * the streaming caller skips the frame.
 */

const NON_ERROR_STATUSES = ['connecting', 'connected', 'authenticated', 'session_active'] as const;

const ALL_PLATFORMS: PluginType[] = ['lark', 'telegram', 'dingtalk', 'weixin', 'wecom'];

function buildAgentStatus(
  status: 'connecting' | 'connected' | 'authenticated' | 'session_active' | 'error',
  agentName = 'Claude Code'
): TMessage {
  return {
    id: 'msg_test',
    msg_id: 'msg_test',
    type: 'agent_status',
    position: 'center',
    conversation_id: 'conv_test',
    content: {
      backend: 'claude' as never,
      status,
      agentName,
    },
  } as TMessage;
}

describe('convertTMessageToOutgoing - agent_status', () => {
  describe.each(NON_ERROR_STATUSES)('status="%s"', (status) => {
    it.each(ALL_PLATFORMS)('returns null on %s (no progress text leaks to IM)', (platform) => {
      const message = buildAgentStatus(status);
      const result = convertTMessageToOutgoing(message, platform, false);
      expect(result).toBeNull();
    });
  });

  it('emits an error message on lark when status is error', () => {
    const message = buildAgentStatus('error', 'Claude Code');
    const result = convertTMessageToOutgoing(message, 'lark', false);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('text');
    expect(result!.text).toContain('Claude Code');
    expect(result!.text!.startsWith('❌')).toBe(true);
  });

  it('emits an error message on telegram when status is error', () => {
    const message = buildAgentStatus('error', 'Claude Code');
    const result = convertTMessageToOutgoing(message, 'telegram', false);
    expect(result).not.toBeNull();
    expect(result!.text!.startsWith('❌')).toBe(true);
  });

  it('emits an error message on dingtalk when status is error', () => {
    const message = buildAgentStatus('error', 'Claude Code');
    const result = convertTMessageToOutgoing(message, 'dingtalk', false);
    expect(result).not.toBeNull();
    expect(result!.text!.startsWith('❌')).toBe(true);
  });

  it('still suppresses error frames on weixin (existing behavior preserved)', () => {
    const message = buildAgentStatus('error', 'Claude Code');
    const result = convertTMessageToOutgoing(message, 'weixin', false);
    // WeChat/WeCom never surface agent_status frames, including errors.
    expect(result).toBeNull();
  });

  it('still suppresses error frames on wecom (existing behavior preserved)', () => {
    const message = buildAgentStatus('error', 'Claude Code');
    const result = convertTMessageToOutgoing(message, 'wecom', false);
    expect(result).toBeNull();
  });
});

describe('convertTMessageToOutgoing - regression: text passes through', () => {
  it('keeps regular text messages on lark', () => {
    const message: TMessage = {
      id: 'msg_test',
      msg_id: 'msg_test',
      type: 'text',
      position: 'right',
      conversation_id: 'conv_test',
      content: { content: 'hello world' },
    } as TMessage;
    const result = convertTMessageToOutgoing(message, 'lark', false);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('text');
    expect(result!.text).toContain('hello world');
  });
});
