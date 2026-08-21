/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Replays a codex/ACP turn where a plan snapshot is interleaved with tool and
 * text frames that share the turn's msg_id.
 *
 * Before the fix, `msgIdIndex` was keyed on the bare msg_id for every type, so
 * the second plan frame resolved to whichever frame was appended last, rewrote
 * THAT message into a plan card, and left the first plan card in place: two plan
 * cards, and the tool/text card silently destroyed.
 */

import { describe, expect, it } from 'vitest';
import type { TMessage } from '@/common/chat/chatLib';
import { transformMessage } from '@/common/chat/chatLib';
import { buildMessageIndex, composeMessageWithIndex } from '@/renderer/pages/conversation/Messages/hooks';

const MSG_ID = 'turn-a';

const plan = (entries: Array<{ content: string; status: string }>): TMessage =>
  ({
    id: `plan:${MSG_ID}`,
    msg_id: MSG_ID,
    conversation_id: 'conv-1',
    type: 'plan',
    position: 'left',
    created_at: 1,
    content: { entries },
  }) as TMessage;

const toolCard = (callId: string, status: string): TMessage =>
  ({
    id: `tool-${callId}`,
    msg_id: MSG_ID,
    conversation_id: 'conv-1',
    type: 'tool_call',
    position: 'left',
    created_at: 2,
    content: { call_id: callId, name: 'Bash', status },
  }) as TMessage;

const text = (body: string): TMessage =>
  ({
    id: `text-${body}`,
    msg_id: MSG_ID,
    conversation_id: 'conv-1',
    type: 'text',
    position: 'left',
    created_at: 3,
    content: { content: body },
  }) as TMessage;

describe('plan live merge', () => {
  const replay = (frames: TMessage[]): TMessage[] => {
    let list: TMessage[] = [];
    for (const frame of frames) {
      const index = buildMessageIndex(list);
      list = composeMessageWithIndex(frame, list, index);
    }
    return list;
  };

  it('keeps exactly one plan card when a tool call shares the turn msg_id', () => {
    const list = replay([
      plan([{ content: 'step one', status: 'pending' }]),
      toolCard('call-1', 'running'),
      plan([{ content: 'step one', status: 'completed' }]),
    ]);

    const plans = list.filter((m) => m.type === 'plan');
    expect(plans).toHaveLength(1);
    expect((plans[0].content as { entries: Array<{ status: string }> }).entries[0].status).toBe('completed');
  });

  it('does not destroy the tool card it shares a msg_id with', () => {
    const list = replay([
      plan([{ content: 'step one', status: 'pending' }]),
      toolCard('call-1', 'running'),
      plan([{ content: 'step one', status: 'completed' }]),
    ]);

    const tools = list.filter((m) => m.type === 'tool_call');
    expect(tools).toHaveLength(1);
    expect((tools[0].content as { call_id: string }).call_id).toBe('call-1');
  });

  it('does not destroy an assistant text message it shares a msg_id with', () => {
    const list = replay([
      plan([{ content: 'step one', status: 'pending' }]),
      text('here is my answer'),
      plan([{ content: 'step one', status: 'completed' }]),
    ]);

    const texts = list.filter((m) => m.type === 'text');
    expect(texts).toHaveLength(1);
    expect((texts[0].content as { content: string }).content).toBe('here is my answer');
  });

  it('leaves a plan from a different turn alone', () => {
    const other = { ...plan([{ content: 'old', status: 'completed' }]), id: 'plan:turn-b', msg_id: 'turn-b' };
    const list = replay([other as TMessage, plan([{ content: 'new', status: 'pending' }])]);

    expect(list.filter((m) => m.type === 'plan')).toHaveLength(2);
  });
});

describe('plan message transform', () => {
  it('mints a deterministic id so the row never remounts on update', () => {
    const first = transformMessage({
      type: 'plan',
      conversation_id: 'conv-1',
      msg_id: 'turn-a',
      data: { entries: [{ content: 'step one', status: 'pending' }] },
    } as never);
    const second = transformMessage({
      type: 'plan',
      conversation_id: 'conv-1',
      msg_id: 'turn-a',
      data: { entries: [{ content: 'step one', status: 'completed' }] },
    } as never);

    expect(first?.id).toBe('plan:turn-a');
    expect(second?.id).toBe('plan:turn-a');
  });
});
