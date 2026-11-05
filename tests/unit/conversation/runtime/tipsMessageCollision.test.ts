/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Replays a turn where an error/advisory tip or agent_status frame shares
 * the turn's msg_id with assistant text and tool frames.
 *
 * Before the fix, `msgIdIndex` was keyed on the bare msg_id without type namespacing
 * for tips and agent_status, and the fallback merge had no type guard. Consequently,
 * an error tip emitted at the end of a turn (e.g. rate limit quota reached) would
 * resolve to the assistant's text message in msgIdIndex and overwrite the text message
 * in place, causing the user's completed response to disappear and be replaced by the error card.
 */

import { describe, expect, it } from 'vitest';
import type { TMessage } from '@/common/chat/chatLib';
import { buildMessageIndex, composeMessageWithIndex } from '@/renderer/pages/conversation/Messages/hooks';

const MSG_ID = 'turn-test-1';

const toolCard = (callId: string, status: string): TMessage =>
  ({
    id: `tool-${callId}`,
    msg_id: MSG_ID,
    conversation_id: 'conv-1',
    type: 'tool_call',
    position: 'left',
    created_at: 1,
    content: { call_id: callId, name: 'run_command', status },
  }) as TMessage;

const textMessage = (body: string): TMessage =>
  ({
    id: `text-${MSG_ID}`,
    msg_id: MSG_ID,
    conversation_id: 'conv-1',
    type: 'text',
    position: 'left',
    created_at: 2,
    content: { content: body },
  }) as TMessage;

const errorTip = (content: string, code?: string): TMessage =>
  ({
    id: `tip-${MSG_ID}`,
    msg_id: MSG_ID,
    conversation_id: 'conv-1',
    type: 'tips',
    position: 'center',
    created_at: 3,
    content: {
      content,
      type: 'error',
      ...(code ? { error: { code, message: content } } : {}),
    },
  }) as TMessage;

const agentStatus = (status: string): TMessage =>
  ({
    id: `status-${MSG_ID}`,
    msg_id: MSG_ID,
    conversation_id: 'conv-1',
    type: 'agent_status',
    position: 'left',
    created_at: 4,
    content: { status },
  }) as TMessage;

describe('tips and agent_status message index isolation', () => {
  const replay = (frames: TMessage[]): TMessage[] => {
    let list: TMessage[] = [];
    for (const frame of frames) {
      const index = buildMessageIndex(list);
      list = composeMessageWithIndex(frame, list, index);
    }
    return list;
  };

  it('does not overwrite assistant text message when an error tip arrives sharing turn msg_id', () => {
    const list = replay([
      toolCard('call-1', 'completed'),
      textMessage('Here is the completed table and final response.'),
      errorTip('RESOURCE_EXHAUSTED: Rate limit reached', 'USER_LLM_PROVIDER_RATE_LIMITED'),
    ]);

    const texts = list.filter((m) => m.type === 'text');
    const tips = list.filter((m) => m.type === 'tips');
    const tools = list.filter((m) => m.type === 'tool_call');

    expect(tools).toHaveLength(1);
    expect(texts).toHaveLength(1);
    expect((texts[0].content as { content: string }).content).toBe('Here is the completed table and final response.');

    expect(tips).toHaveLength(1);
    expect((tips[0].content as { content: string }).content).toBe('RESOURCE_EXHAUSTED: Rate limit reached');
  });

  it('updates existing tips in place when a second tip frame arrives with the same msg_id', () => {
    const list = replay([
      textMessage('Assistant answer'),
      errorTip('First error notice'),
      errorTip('Updated error notice with more detail'),
    ]);

    const texts = list.filter((m) => m.type === 'text');
    const tips = list.filter((m) => m.type === 'tips');

    expect(texts).toHaveLength(1);
    expect((texts[0].content as { content: string }).content).toBe('Assistant answer');

    expect(tips).toHaveLength(1);
    expect((tips[0].content as { content: string }).content).toBe('Updated error notice with more detail');
  });

  it('does not overwrite assistant text message when agent_status shares turn msg_id', () => {
    const list = replay([textMessage('Assistant answer'), agentStatus('running'), agentStatus('idle')]);

    const texts = list.filter((m) => m.type === 'text');
    const statuses = list.filter((m) => m.type === 'agent_status');

    expect(texts).toHaveLength(1);
    expect((texts[0].content as { content: string }).content).toBe('Assistant answer');

    expect(statuses).toHaveLength(1);
    expect((statuses[0].content as { status: string }).status).toBe('idle');
  });

  it('does not overwrite tip when text arrives after tip sharing the same msg_id', () => {
    const list = replay([errorTip('Preliminary warning'), textMessage('Follow-up text')]);

    const tips = list.filter((m) => m.type === 'tips');
    const texts = list.filter((m) => m.type === 'text');

    expect(tips).toHaveLength(1);
    expect(texts).toHaveLength(1);
  });
});
